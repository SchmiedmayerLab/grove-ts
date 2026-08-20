//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'
import {
  attachmentSchema,
  codingSchema,
  extensionSchema,
  identifierSchema,
  metaSchema,
  periodSchema,
  primitiveElementSchema,
  quantitySchema,
  referenceSchema,
} from '../r4/schemas.js'

const primitiveMetadata = primitiveElementSchema.optional()

const resourceFields = {
  id: z.string().optional(),
  _id: primitiveMetadata,
  meta: metaSchema.optional(),
  implicitRules: z.string().optional(),
  _implicitRules: primitiveMetadata,
  language: z.string().optional(),
  _language: primitiveMetadata,
  extension: z.array(extensionSchema).optional(),
  modifierExtension: z.array(extensionSchema).optional(),
} as const

const answerValueFields = {
  valueBoolean: z.boolean().optional(),
  valueDecimal: z.number().optional(),
  valueInteger: z.number().int().optional(),
  valueDate: z.string().optional(),
  valueDateTime: z.string().optional(),
  valueTime: z.string().optional(),
  valueString: z.string().optional(),
  valueUri: z.string().optional(),
  valueAttachment: attachmentSchema.optional(),
  valueCoding: codingSchema.optional(),
  valueQuantity: quantitySchema.optional(),
} as const

const answerValueKeys = Object.keys(answerValueFields)

const answerOptionFields = {
  valueInteger: z.number().int().optional(),
  valueDate: z.string().min(1).optional(),
  valueTime: z.string().min(1).optional(),
  valueString: z.string().optional(),
  valueCoding: codingSchema.optional(),
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
    answerInteger: z.number().int().optional(),
    answerDate: z.string().optional(),
    answerDateTime: z.string().optional(),
    answerTime: z.string().optional(),
    answerString: z.string().optional(),
    answerCoding: codingSchema.optional(),
    answerQuantity: quantitySchema.optional(),
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

export const questionnaireItemSchema: z.ZodType = z.lazy(() =>
  z.strictObject({
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
    maxLength: z.number().int().nonnegative().optional(),
    _maxLength: primitiveMetadata,
    answerValueSet: z.string().optional(),
    _answerValueSet: primitiveMetadata,
    answerOption: z.array(answerOptionSchema).optional(),
    initial: z.array(initialSchema).optional(),
    item: z.array(questionnaireItemSchema).optional(),
  }),
)

export const questionnaireSchema = z.strictObject({
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
  subjectType: z.array(z.string().min(1)).min(1).optional(),
  _subjectType: z.array(primitiveElementSchema.nullable()).optional(),
  date: z.string().optional(),
  _date: primitiveMetadata,
  description: z.string().optional(),
  _description: primitiveMetadata,
  purpose: z.string().optional(),
  _purpose: primitiveMetadata,
  copyright: z.string().optional(),
  _copyright: primitiveMetadata,
  approvalDate: z.string().optional(),
  _approvalDate: primitiveMetadata,
  lastReviewDate: z.string().optional(),
  _lastReviewDate: primitiveMetadata,
  effectivePeriod: periodSchema.optional(),
  code: z.array(codingSchema).optional(),
  item: z.array(questionnaireItemSchema).min(1),
})

export const questionnaireResponseAnswerSchema: z.ZodType = z.lazy(() =>
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

export const questionnaireResponseItemSchema: z.ZodType = z.lazy(() =>
  z.strictObject({
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
  }),
)

export const questionnaireResponseSchema = z.strictObject({
  resourceType: z.literal('QuestionnaireResponse'),
  ...resourceFields,
  identifier: identifierSchema,
  basedOn: z.array(referenceSchema).optional(),
  partOf: z.array(referenceSchema).optional(),
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
  subject: referenceSchema.optional(),
  encounter: referenceSchema.optional(),
  authored: z.string().min(1),
  _authored: primitiveMetadata,
  author: referenceSchema.optional(),
  source: referenceSchema.optional(),
  item: z.array(questionnaireResponseItemSchema).optional(),
})
