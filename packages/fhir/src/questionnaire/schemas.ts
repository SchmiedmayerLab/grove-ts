//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import type {
  QuestionnaireItem as R4QuestionnaireItem,
  QuestionnaireResponseItem as R4QuestionnaireResponseItem,
  QuestionnaireResponseItemAnswer as R4QuestionnaireResponseItemAnswer,
} from 'fhir/r4.js'
import { z } from 'zod'
import { isR4ResourceType } from './r4-resource-types.js'
import {
  compareR4Temporal,
  isR4Date,
  isR4DateTime,
  isR4Time,
} from './temporal.js'
import type { GroveQuestionnaire, GroveQuestionnaireResponse } from './types.js'
import { parseFhirInstant } from '../core/index.js'
import type { FhirJson } from '../r4/json.js'
import {
  attachmentSchema,
  codingSchema,
  extensionSchema,
  identifierSchema,
  metaSchema,
  primitiveElementSchema,
  quantitySchema,
  resolvableReferenceSchema,
} from '../r4/schemas.js'

const primitiveMetadata = primitiveElementSchema.optional()

const r4DateSchema = z
  .string()
  .refine(isR4Date, 'Expected a valid FHIR R4 date primitive.')
const r4DateTimeSchema = z
  .string()
  .refine(isR4DateTime, 'Expected a valid FHIR R4 dateTime primitive.')
const r4TimeSchema = z
  .string()
  .refine(isR4Time, 'Expected a valid FHIR R4 time primitive.')
const r4InstantSchema = z
  .string()
  .refine(
    (value) => parseFhirInstant(value).ok,
    'Expected a valid FHIR R4 instant primitive.',
  )
const questionnairePeriodSchema = z
  .strictObject({
    id: z.string().optional(),
    extension: z.array(extensionSchema).optional(),
    start: r4DateTimeSchema.optional(),
    _start: primitiveMetadata,
    end: r4DateTimeSchema.optional(),
    _end: primitiveMetadata,
  })
  .superRefine((value, context) => {
    if (value.start === undefined || value.end === undefined) return
    const comparison = compareR4Temporal(value.start, value.end, 'dateTime')
    if (comparison === undefined || comparison > 0) {
      context.addIssue({
        code: 'custom',
        message:
          'Questionnaire.effectivePeriod.start must not be later than or incomparable with end.',
      })
    }
  })
const r4IntegerSchema = z.number().int().min(-2_147_483_648).max(2_147_483_647)
const nonEmptyStringSchema = z.string().min(1)
const nonEmptyUriSchema = z
  .string()
  .regex(/^\S+$/u, 'Expected a non-empty FHIR uri primitive.')

const childHasContent = (value: unknown): boolean => {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.length > 0
  if (Array.isArray(value)) return value.some(childHasContent)
  if (typeof value === 'object') return elementHasContent(value)
  return true
}

const elementHasContent = (value: object): boolean =>
  Object.entries(value).some(
    ([key, child]) => key !== 'id' && childHasContent(child),
  )

const answerAttachmentSchema = attachmentSchema.refine(
  elementHasContent,
  'Attachment answer values cannot be empty.',
)
const answerCodingSchema = codingSchema.refine(
  elementHasContent,
  'Coding answer values cannot be empty.',
)
const answerQuantitySchema = quantitySchema.refine(
  elementHasContent,
  'Quantity answer values cannot be empty.',
)

// A contained resource keeps the issuer's own shape; only its type code and id are Grove's.
const containedResourceSchema = z.looseObject({
  resourceType: z
    .string()
    .refine(isR4ResourceType, 'Unknown contained R4 ResourceType code.'),
  id: z.string().regex(/^[A-Za-z\d\-.]{1,64}$/u),
})

const resourceFields = {
  id: z.string().optional(),
  _id: primitiveMetadata,
  meta: metaSchema.optional(),
  implicitRules: z.string().optional(),
  _implicitRules: primitiveMetadata,
  language: z.string().optional(),
  _language: primitiveMetadata,
  contained: z.array(containedResourceSchema).optional(),
  extension: z.array(extensionSchema).optional(),
  modifierExtension: z.array(extensionSchema).optional(),
} as const

const answerValueFields = {
  valueBoolean: z.boolean().optional(),
  valueDecimal: z.number().optional(),
  valueInteger: r4IntegerSchema.optional(),
  valueDate: r4DateSchema.optional(),
  valueDateTime: r4DateTimeSchema.optional(),
  valueTime: r4TimeSchema.optional(),
  valueString: nonEmptyStringSchema.optional(),
  valueUri: nonEmptyUriSchema.optional(),
  valueAttachment: answerAttachmentSchema.optional(),
  valueCoding: answerCodingSchema.optional(),
  valueQuantity: answerQuantitySchema.optional(),
} as const

const answerValueKeys = Object.keys(answerValueFields)

const answerOptionFields = {
  valueInteger: r4IntegerSchema.optional(),
  valueDate: r4DateSchema.optional(),
  valueTime: r4TimeSchema.optional(),
  valueString: nonEmptyStringSchema.optional(),
  valueCoding: answerCodingSchema.optional(),
} as const

const answerOptionKeys = Object.keys(answerOptionFields)

const populatedCount = (value: object, keys: readonly string[]): number =>
  keys.filter((key) => Reflect.get(value, key) !== undefined).length

const exactlyOneAnswerChoice = (
  value: object,
  keys: readonly string[],
  context: z.RefinementCtx,
) => {
  if (populatedCount(value, keys) !== 1) {
    context.addIssue({
      code: 'custom',
      message: 'Expected exactly one supported answer value[x].',
    })
  }
}

const enableWhenSchema = z
  .strictObject({
    id: z.string().optional(),
    extension: z.array(extensionSchema).optional(),
    modifierExtension: z.array(extensionSchema).optional(),
    question: z.string().min(1),
    _question: primitiveMetadata,
    operator: z.enum(['exists', '=', '!=', '>', '<', '>=', '<=']),
    _operator: primitiveMetadata,
    answerBoolean: z.boolean().optional(),
    answerDecimal: z.number().optional(),
    answerInteger: r4IntegerSchema.optional(),
    answerDate: r4DateSchema.optional(),
    answerDateTime: r4DateTimeSchema.optional(),
    answerTime: r4TimeSchema.optional(),
    answerString: nonEmptyStringSchema.optional(),
    answerCoding: answerCodingSchema.optional(),
    answerQuantity: answerQuantitySchema.optional(),
  })
  .superRefine((value, context) => {
    if (
      populatedCount(value, [
        'answerBoolean',
        'answerDecimal',
        'answerInteger',
        'answerDate',
        'answerDateTime',
        'answerTime',
        'answerString',
        'answerCoding',
        'answerQuantity',
      ]) !== 1
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Questionnaire.enableWhen requires exactly one answer[x].',
      })
    }
  })

const answerOptionSchema = z
  .strictObject({
    id: z.string().optional(),
    extension: z.array(extensionSchema).optional(),
    modifierExtension: z.array(extensionSchema).optional(),
    ...answerOptionFields,
    initialSelected: z.boolean().optional(),
    _initialSelected: primitiveMetadata,
  })
  .superRefine((value, context) =>
    exactlyOneAnswerChoice(value, answerOptionKeys, context),
  )

const initialSchema = z
  .strictObject({
    id: z.string().optional(),
    extension: z.array(extensionSchema).optional(),
    modifierExtension: z.array(extensionSchema).optional(),
    ...answerValueFields,
  })
  .superRefine((value, context) =>
    exactlyOneAnswerChoice(value, answerValueKeys, context),
  )

// Written here rather than reused from the generated R4 schemas: an instrument's every item,
// at every nesting depth, must carry a non-blank linkId. The generated base states the release's
// own constraint, which admits a blank one, and layering the narrowing on top would take a
// recursive walk of item.item that is harder to read than the constraint stated inline.
export const questionnaireItemSchema: z.ZodType<FhirJson<R4QuestionnaireItem>> =
  z.lazy(() =>
    z
      .strictObject({
        id: z.string().optional(),
        extension: z.array(extensionSchema).optional(),
        modifierExtension: z.array(extensionSchema).optional(),
        linkId: z.string().min(1),
        _linkId: primitiveMetadata,
        definition: z.string().optional(),
        _definition: primitiveMetadata,
        code: z.array(codingSchema).optional(),
        prefix: z.string().optional(),
        _prefix: primitiveMetadata,
        text: z.string().optional(),
        _text: primitiveMetadata,
        type: z.enum([
          'group',
          'display',
          'boolean',
          'decimal',
          'integer',
          'date',
          'dateTime',
          'time',
          'string',
          'text',
          'url',
          'choice',
          'open-choice',
          'attachment',
          'quantity',
        ]),
        _type: primitiveMetadata,
        enableWhen: z.array(enableWhenSchema).optional(),
        enableBehavior: z.enum(['all', 'any']).optional(),
        _enableBehavior: primitiveMetadata,
        required: z.boolean().optional(),
        _required: primitiveMetadata,
        repeats: z.boolean().optional(),
        _repeats: primitiveMetadata,
        readOnly: z.boolean().optional(),
        _readOnly: primitiveMetadata,
        maxLength: r4IntegerSchema.nonnegative().optional(),
        _maxLength: primitiveMetadata,
        answerValueSet: z.string().optional(),
        _answerValueSet: primitiveMetadata,
        answerOption: z.array(answerOptionSchema).optional(),
        initial: z.array(initialSchema).optional(),
        item: z.array(questionnaireItemSchema).optional(),
      })
      .superRefine((value, context) => {
        if (value.type === 'group' && (value.item?.length ?? 0) === 0) {
          context.addIssue({
            code: 'custom',
            path: ['item'],
            message: 'A group Questionnaire item requires nested items.',
          })
        }
        if (value.type === 'display' && (value.item?.length ?? 0) > 0) {
          context.addIssue({
            code: 'custom',
            path: ['item'],
            message: 'A display Questionnaire item cannot have nested items.',
          })
        }
        if (
          value.type === 'display' &&
          (value.required !== undefined || value.repeats !== undefined)
        ) {
          context.addIssue({
            code: 'custom',
            message:
              'A display Questionnaire item cannot declare required or repeats.',
          })
        }
        if (
          (value.answerOption?.length ?? 0) > 0 &&
          (value.initial?.length ?? 0) > 0
        ) {
          context.addIssue({
            code: 'custom',
            message:
              'A Questionnaire item cannot declare both answerOption and initial.',
          })
        }
      }),
  )

const questionnaireSchemaValue = z.strictObject({
  resourceType: z.literal('Questionnaire'),
  ...resourceFields,
  url: z.url(),
  _url: primitiveMetadata,
  version: z.string().min(1),
  _version: primitiveMetadata,
  name: z.string().optional(),
  _name: primitiveMetadata,
  title: z.string().optional(),
  _title: primitiveMetadata,
  derivedFrom: z.array(z.string()).optional(),
  _derivedFrom: z.array(primitiveElementSchema.nullable()).optional(),
  status: z.enum(['draft', 'active', 'retired', 'unknown']),
  _status: primitiveMetadata,
  experimental: z.boolean().optional(),
  _experimental: primitiveMetadata,
  subjectType: z
    .array(z.string().refine(isR4ResourceType, 'Unknown R4 ResourceType code.'))
    .min(1)
    .optional(),
  _subjectType: z.array(primitiveElementSchema.nullable()).optional(),
  date: r4DateTimeSchema.optional(),
  _date: primitiveMetadata,
  description: z.string().optional(),
  _description: primitiveMetadata,
  purpose: z.string().optional(),
  _purpose: primitiveMetadata,
  copyright: z.string().optional(),
  _copyright: primitiveMetadata,
  approvalDate: r4DateSchema.optional(),
  _approvalDate: primitiveMetadata,
  lastReviewDate: r4DateSchema.optional(),
  _lastReviewDate: primitiveMetadata,
  effectivePeriod: questionnairePeriodSchema.optional(),
  code: z.array(codingSchema).optional(),
  item: z.array(questionnaireItemSchema).min(1),
})
export const questionnaireSchema: z.ZodType<GroveQuestionnaire> =
  questionnaireSchemaValue as z.ZodType<GroveQuestionnaire>

export const questionnaireResponseAnswerSchema: z.ZodType<
  FhirJson<R4QuestionnaireResponseItemAnswer>
> = z.lazy(() =>
  z
    .strictObject({
      id: z.string().optional(),
      extension: z.array(extensionSchema).optional(),
      modifierExtension: z.array(extensionSchema).optional(),
      ...answerValueFields,
      item: z.array(questionnaireResponseItemSchema).optional(),
    })
    .superRefine((value, context) =>
      exactlyOneAnswerChoice(value, answerValueKeys, context),
    ),
)

export const questionnaireResponseItemSchema: z.ZodType<
  FhirJson<R4QuestionnaireResponseItem>
> = z.lazy(() =>
  z
    .strictObject({
      id: z.string().optional(),
      extension: z.array(extensionSchema).optional(),
      modifierExtension: z.array(extensionSchema).optional(),
      linkId: z.string().min(1),
      _linkId: primitiveMetadata,
      definition: z.string().optional(),
      _definition: primitiveMetadata,
      text: z.string().optional(),
      _text: primitiveMetadata,
      answer: z.array(questionnaireResponseAnswerSchema).optional(),
      item: z.array(questionnaireResponseItemSchema).optional(),
    })
    .superRefine((value, context) => {
      if ((value.answer?.length ?? 0) > 0 && (value.item?.length ?? 0) > 0) {
        context.addIssue({
          code: 'custom',
          message:
            'A QuestionnaireResponse item cannot contain both answer and item.',
        })
      }
    }),
)

const questionnaireResponseSchemaValue = z.strictObject({
  resourceType: z.literal('QuestionnaireResponse'),
  ...resourceFields,
  identifier: identifierSchema,
  basedOn: z.array(resolvableReferenceSchema).optional(),
  partOf: z.array(resolvableReferenceSchema).optional(),
  questionnaire: z.string().min(1),
  _questionnaire: primitiveMetadata,
  status: z.enum([
    'in-progress',
    'completed',
    'amended',
    'entered-in-error',
    'stopped',
  ]),
  _status: primitiveMetadata,
  subject: resolvableReferenceSchema.optional(),
  encounter: resolvableReferenceSchema.optional(),
  authored: r4InstantSchema,
  _authored: primitiveMetadata,
  author: resolvableReferenceSchema.optional(),
  source: resolvableReferenceSchema.optional(),
  item: z.array(questionnaireResponseItemSchema).optional(),
})
export const questionnaireResponseSchema: z.ZodType<GroveQuestionnaireResponse> =
  questionnaireResponseSchemaValue

const builderBackboneFields = {
  id: z.string().optional(),
  extension: z.array(extensionSchema).optional(),
  modifierExtension: z.array(extensionSchema).optional(),
} as const

const builderEnableWhenSchema = z
  .strictObject({
    ...builderBackboneFields,
    question: z.string(),
    operator: z.enum(['exists', '=', '!=', '>', '<', '>=', '<=']),
    answerBoolean: z.boolean().optional(),
    answerDecimal: z.number().optional(),
    answerInteger: r4IntegerSchema.optional(),
    answerDate: r4DateSchema.optional(),
    answerDateTime: r4DateTimeSchema.optional(),
    answerTime: r4TimeSchema.optional(),
    answerString: nonEmptyStringSchema.optional(),
    answerCoding: answerCodingSchema.optional(),
    answerQuantity: answerQuantitySchema.optional(),
  })
  .superRefine((value, context) => {
    if (
      populatedCount(value, [
        'answerBoolean',
        'answerDecimal',
        'answerInteger',
        'answerDate',
        'answerDateTime',
        'answerTime',
        'answerString',
        'answerCoding',
        'answerQuantity',
      ]) !== 1
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Questionnaire.enableWhen requires exactly one answer[x].',
      })
    }
  })

const builderAnswerOptionSchema = z
  .strictObject({
    ...builderBackboneFields,
    ...answerOptionFields,
    initialSelected: z.boolean().optional(),
  })
  .superRefine((value, context) =>
    exactlyOneAnswerChoice(value, answerOptionKeys, context),
  )

const builderInitialSchema = z
  .strictObject({
    ...builderBackboneFields,
    ...answerValueFields,
  })
  .superRefine((value, context) =>
    exactlyOneAnswerChoice(value, answerValueKeys, context),
  )

const questionnaireBuilderItemSchema: z.ZodType = z.lazy(() =>
  z.strictObject({
    ...builderBackboneFields,
    linkId: z.string(),
    definition: z.string().optional(),
    code: z.array(codingSchema).optional(),
    prefix: z.string().optional(),
    text: z.string().optional(),
    type: z.enum([
      'group',
      'display',
      'boolean',
      'decimal',
      'integer',
      'date',
      'dateTime',
      'time',
      'string',
      'text',
      'url',
      'choice',
      'open-choice',
      'attachment',
      'quantity',
    ]),
    enableWhen: z.array(builderEnableWhenSchema).optional(),
    enableBehavior: z.enum(['all', 'any']).optional(),
    required: z.boolean().optional(),
    repeats: z.boolean().optional(),
    readOnly: z.boolean().optional(),
    maxLength: r4IntegerSchema.nonnegative().optional(),
    answerValueSet: z.string().optional(),
    answerOption: z.array(builderAnswerOptionSchema).optional(),
    initial: z.array(builderInitialSchema).optional(),
    item: z.array(questionnaireBuilderItemSchema).optional(),
  }),
)

/** Strict runtime boundary for the public Questionnaire builder input. */
export const questionnaireBuilderInputSchema: z.ZodType = z.strictObject({
  id: z.string().optional(),
  url: z.string(),
  version: z.string(),
  name: z.string().optional(),
  title: z.string().optional(),
  status: z.enum(['draft', 'active', 'retired', 'unknown']),
  subjectTypes: z.tuple([z.literal('Patient')]),
  date: z.string().optional(),
  description: z.string().optional(),
  purpose: z.string().optional(),
  extensions: z.array(extensionSchema).optional(),
  items: z.array(questionnaireBuilderItemSchema).min(1),
})

const questionnaireResponseBuilderItemSchema: z.ZodType = z.lazy(() =>
  z.strictObject({
    ...builderBackboneFields,
    linkId: z.string(),
    definition: z.string().optional(),
    text: z.string().optional(),
    answer: z
      .array(
        z
          .strictObject({
            ...builderBackboneFields,
            ...answerValueFields,
            item: z.array(questionnaireResponseBuilderItemSchema).optional(),
          })
          .superRefine((value, context) =>
            exactlyOneAnswerChoice(value, answerValueKeys, context),
          ),
      )
      .optional(),
    item: z.array(questionnaireResponseBuilderItemSchema).optional(),
  }),
)

const questionnaireResponseIdentifierInputSchema = z.strictObject({
  system: z.string(),
  value: z.string(),
})

const builderReferenceSchema = (type: z.ZodType<string>): z.ZodType =>
  z.union([
    z.strictObject({
      type,
      reference: z.string(),
    }),
    z.strictObject({
      type,
      identifier: questionnaireResponseIdentifierInputSchema,
    }),
  ])

// The Grove profile fixes the response subject to Patient, so the shape boundary states it.
const subjectReferenceInputSchema = builderReferenceSchema(z.literal('Patient'))
// The shape boundary admits every R4 type so semantic validation can report
// the field-specific author/source target rule alongside other input issues.
const actorReferenceInputSchema = builderReferenceSchema(
  z.string().refine(isR4ResourceType, 'Expected a FHIR R4 ResourceType code.'),
)

/** Strict runtime boundary for the public QuestionnaireResponse builder input. */
export const questionnaireResponseBuilderInputSchema: z.ZodType =
  z.strictObject({
    id: z.string().optional(),
    questionnaire: z.string(),
    identifier: questionnaireResponseIdentifierInputSchema,
    status: z.enum([
      'in-progress',
      'completed',
      'amended',
      'entered-in-error',
      'stopped',
    ]),
    subject: subjectReferenceInputSchema,
    authored: z.string(),
    author: actorReferenceInputSchema.optional(),
    source: actorReferenceInputSchema.optional(),
    extensions: z.array(extensionSchema).optional(),
    items: z.array(questionnaireResponseBuilderItemSchema).optional(),
  })
