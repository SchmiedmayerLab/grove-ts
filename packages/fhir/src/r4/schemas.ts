//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

export const extensionSchema: z.ZodType = z.lazy(createExtensionSchema)

export const primitiveElementSchema: z.ZodType = z.lazy(() =>
  z.strictObject({
    id: z.string().optional(),
    extension: z.array(extensionSchema).optional(),
  }),
)

const primitiveMetadata = primitiveElementSchema.optional()

export const codingSchema = z.strictObject({
  id: z.string().optional(),
  extension: z.array(extensionSchema).optional(),
  system: z.url().optional(),
  _system: primitiveMetadata,
  version: z.string().optional(),
  _version: primitiveMetadata,
  code: z.string().optional(),
  _code: primitiveMetadata,
  display: z.string().optional(),
  _display: primitiveMetadata,
  userSelected: z.boolean().optional(),
  _userSelected: primitiveMetadata,
})

export const codeableConceptSchema = z.strictObject({
  id: z.string().optional(),
  extension: z.array(extensionSchema).optional(),
  coding: z.array(codingSchema).optional(),
  text: z.string().optional(),
  _text: primitiveMetadata,
})

export const identifierSchema = z.strictObject({
  id: z.string().optional(),
  extension: z.array(extensionSchema).optional(),
  use: z.enum(['usual', 'official', 'temp', 'secondary', 'old']).optional(),
  _use: primitiveMetadata,
  type: codeableConceptSchema.optional(),
  system: z.url(),
  _system: primitiveMetadata,
  value: z.string().min(1),
  _value: primitiveMetadata,
  period: z.lazy(() => periodSchema).optional(),
  assigner: z.lazy(() => referenceSchema).optional(),
})

export const referenceSchema: z.ZodType = z.lazy(() =>
  z
    .strictObject({
      id: z.string().optional(),
      extension: z.array(extensionSchema).optional(),
      reference: z.string().min(1).optional(),
      _reference: primitiveMetadata,
      type: z.url().optional(),
      _type: primitiveMetadata,
      identifier: identifierSchema.optional(),
      display: z.string().optional(),
      _display: primitiveMetadata,
    })
    .refine(
      (value) =>
        value.reference !== undefined || value.identifier !== undefined,
      {
        message: 'A Reference requires reference or identifier.',
      },
    ),
)

export const quantitySchema = z.strictObject({
  id: z.string().optional(),
  extension: z.array(extensionSchema).optional(),
  value: z.number().optional(),
  _value: primitiveMetadata,
  comparator: z.enum(['<', '<=', '>=', '>']).optional(),
  _comparator: primitiveMetadata,
  unit: z.string().optional(),
  _unit: primitiveMetadata,
  system: z.url().optional(),
  _system: primitiveMetadata,
  code: z.string().optional(),
  _code: primitiveMetadata,
})

export const periodSchema = z
  .strictObject({
    id: z.string().optional(),
    extension: z.array(extensionSchema).optional(),
    start: z.string().optional(),
    _start: primitiveMetadata,
    end: z.string().optional(),
    _end: primitiveMetadata,
  })
  .refine(
    (value) =>
      value.start === undefined ||
      value.end === undefined ||
      Date.parse(value.start) <= Date.parse(value.end),
    { message: 'Period.start must not be later than Period.end.' },
  )

export const expressionSchema = z.strictObject({
  id: z.string().optional(),
  extension: z.array(extensionSchema).optional(),
  description: z.string().optional(),
  _description: primitiveMetadata,
  name: z.string().optional(),
  _name: primitiveMetadata,
  language: z.string().min(1),
  _language: primitiveMetadata,
  expression: z.string().optional(),
  _expression: primitiveMetadata,
  reference: z.string().optional(),
  _reference: primitiveMetadata,
})

export const attachmentSchema = z.strictObject({
  id: z.string().optional(),
  extension: z.array(extensionSchema).optional(),
  contentType: z.string().optional(),
  _contentType: primitiveMetadata,
  language: z.string().optional(),
  _language: primitiveMetadata,
  data: z.string().optional(),
  _data: primitiveMetadata,
  url: z.string().optional(),
  _url: primitiveMetadata,
  size: z.number().int().nonnegative().optional(),
  _size: primitiveMetadata,
  hash: z.string().optional(),
  _hash: primitiveMetadata,
  title: z.string().optional(),
  _title: primitiveMetadata,
  creation: z.string().optional(),
  _creation: primitiveMetadata,
})

const extensionValueKeys = [
  'valueBoolean',
  'valueCanonical',
  'valueCode',
  'valueCodeableConcept',
  'valueCoding',
  'valueDate',
  'valueDateTime',
  'valueDecimal',
  'valueExpression',
  'valueIdentifier',
  'valueInstant',
  'valueInteger',
  'valueQuantity',
  'valueReference',
  'valueString',
  'valueTime',
  'valueUri',
  'valueUrl',
] as const

function createExtensionSchema(): z.ZodType {
  return z
    .strictObject({
      id: z.string().optional(),
      extension: z.array(extensionSchema).optional(),
      url: z.string().min(1),
      _url: primitiveMetadata,
      valueBoolean: z.boolean().optional(),
      _valueBoolean: primitiveMetadata,
      valueCanonical: z.string().optional(),
      _valueCanonical: primitiveMetadata,
      valueCode: z.string().optional(),
      _valueCode: primitiveMetadata,
      valueCodeableConcept: codeableConceptSchema.optional(),
      valueCoding: codingSchema.optional(),
      valueDate: z.string().optional(),
      _valueDate: primitiveMetadata,
      valueDateTime: z.string().optional(),
      _valueDateTime: primitiveMetadata,
      valueDecimal: z.number().optional(),
      _valueDecimal: primitiveMetadata,
      valueExpression: expressionSchema.optional(),
      valueIdentifier: identifierSchema.optional(),
      valueInstant: z.string().optional(),
      _valueInstant: primitiveMetadata,
      valueInteger: z.number().int().optional(),
      _valueInteger: primitiveMetadata,
      valueQuantity: quantitySchema.optional(),
      valueReference: referenceSchema.optional(),
      valueString: z.string().optional(),
      _valueString: primitiveMetadata,
      valueTime: z.string().optional(),
      _valueTime: primitiveMetadata,
      valueUri: z.string().optional(),
      _valueUri: primitiveMetadata,
      valueUrl: z.string().optional(),
      _valueUrl: primitiveMetadata,
    })
    .superRefine((value, context) => {
      const populated = extensionValueKeys.filter(
        (key) => value[key] !== undefined,
      ).length
      if (populated > 1 || (populated === 1 && value.extension !== undefined)) {
        context.addIssue({
          code: 'custom',
          message:
            'Extension may contain nested extensions or one value[x], but not both.',
        })
      }
    })
}

export const metaSchema = z.strictObject({
  id: z.string().optional(),
  extension: z.array(extensionSchema).optional(),
  versionId: z.string().optional(),
  _versionId: primitiveMetadata,
  lastUpdated: z.string().optional(),
  _lastUpdated: primitiveMetadata,
  source: z.string().optional(),
  _source: primitiveMetadata,
  profile: z.array(z.string().min(1)).optional(),
  _profile: z.array(primitiveElementSchema.nullable()).optional(),
  security: z.array(codingSchema).optional(),
  tag: z.array(codingSchema).optional(),
})

const annotationSchema = z.strictObject({
  id: z.string().optional(),
  extension: z.array(extensionSchema).optional(),
  authorReference: referenceSchema.optional(),
  authorString: z.string().optional(),
  _authorString: primitiveMetadata,
  time: z.string().optional(),
  _time: primitiveMetadata,
  text: z.string(),
  _text: primitiveMetadata,
})

const commonResourceFields = {
  id: z.string().optional(),
  _id: primitiveMetadata,
  meta: metaSchema.optional(),
  implicitRules: z.string().optional(),
  _implicitRules: primitiveMetadata,
  language: z.string().optional(),
  _language: primitiveMetadata,
} as const

const commonDomainResourceFields = {
  ...commonResourceFields,
  extension: z.array(extensionSchema).optional(),
  modifierExtension: z.array(extensionSchema).optional(),
} as const

export const sampledDataSchema = z.strictObject({
  id: z.string().optional(),
  extension: z.array(extensionSchema).optional(),
  origin: quantitySchema,
  period: z.number().positive(),
  _period: primitiveMetadata,
  factor: z.number().optional(),
  _factor: primitiveMetadata,
  lowerLimit: z.number().optional(),
  _lowerLimit: primitiveMetadata,
  upperLimit: z.number().optional(),
  _upperLimit: primitiveMetadata,
  dimensions: z.number().int().positive(),
  _dimensions: primitiveMetadata,
  data: z.string().optional(),
  _data: primitiveMetadata,
})

export const observationComponentSchema = z
  .strictObject({
    id: z.string().optional(),
    extension: z.array(extensionSchema).optional(),
    modifierExtension: z.array(extensionSchema).optional(),
    code: codeableConceptSchema,
    valueQuantity: quantitySchema.optional(),
    valueCodeableConcept: codeableConceptSchema.optional(),
    valueString: z.string().optional(),
    _valueString: primitiveMetadata,
    valueBoolean: z.boolean().optional(),
    _valueBoolean: primitiveMetadata,
    valueInteger: z.number().int().optional(),
    _valueInteger: primitiveMetadata,
    valueSampledData: sampledDataSchema.optional(),
    dataAbsentReason: codeableConceptSchema.optional(),
    interpretation: z.array(codeableConceptSchema).optional(),
    referenceRange: z
      .array(
        z.strictObject({
          id: z.string().optional(),
          extension: z.array(extensionSchema).optional(),
          modifierExtension: z.array(extensionSchema).optional(),
          low: quantitySchema.optional(),
          high: quantitySchema.optional(),
          type: codeableConceptSchema.optional(),
          appliesTo: z.array(codeableConceptSchema).optional(),
          age: z
            .strictObject({
              id: z.string().optional(),
              extension: z.array(extensionSchema).optional(),
              low: quantitySchema.optional(),
              high: quantitySchema.optional(),
            })
            .optional(),
          text: z.string().optional(),
          _text: primitiveMetadata,
        }),
      )
      .optional(),
  })
  .superRefine((value, context) => {
    const values = [
      value.valueQuantity,
      value.valueCodeableConcept,
      value.valueString,
      value.valueBoolean,
      value.valueInteger,
      value.valueSampledData,
    ].filter((entry) => entry !== undefined).length
    if (values > 1 || (values === 1 && value.dataAbsentReason !== undefined)) {
      context.addIssue({
        code: 'custom',
        message:
          'Observation.component permits one value[x] or dataAbsentReason.',
      })
    }
  })

export const observationSchema = z
  .strictObject({
    resourceType: z.literal('Observation'),
    ...commonDomainResourceFields,
    identifier: z.array(identifierSchema).optional(),
    basedOn: z.array(referenceSchema).optional(),
    partOf: z.array(referenceSchema).optional(),
    status: z.enum([
      'registered',
      'preliminary',
      'final',
      'amended',
      'corrected',
      'cancelled',
      'entered-in-error',
      'unknown',
    ]),
    _status: primitiveMetadata,
    category: z.array(codeableConceptSchema).optional(),
    code: codeableConceptSchema,
    subject: referenceSchema.optional(),
    focus: z.array(referenceSchema).optional(),
    encounter: referenceSchema.optional(),
    effectiveDateTime: z.string().optional(),
    _effectiveDateTime: primitiveMetadata,
    effectivePeriod: periodSchema.optional(),
    issued: z.string().optional(),
    _issued: primitiveMetadata,
    performer: z.array(referenceSchema).optional(),
    valueQuantity: quantitySchema.optional(),
    valueCodeableConcept: codeableConceptSchema.optional(),
    valueString: z.string().optional(),
    _valueString: primitiveMetadata,
    valueBoolean: z.boolean().optional(),
    _valueBoolean: primitiveMetadata,
    valueInteger: z.number().int().optional(),
    _valueInteger: primitiveMetadata,
    valueSampledData: sampledDataSchema.optional(),
    dataAbsentReason: codeableConceptSchema.optional(),
    interpretation: z.array(codeableConceptSchema).optional(),
    note: z.array(annotationSchema).optional(),
    bodySite: codeableConceptSchema.optional(),
    method: codeableConceptSchema.optional(),
    specimen: referenceSchema.optional(),
    device: referenceSchema.optional(),
    hasMember: z.array(referenceSchema).optional(),
    derivedFrom: z.array(referenceSchema).optional(),
    component: z.array(observationComponentSchema).optional(),
  })
  .superRefine((value, context) => {
    const effectiveChoices = [
      value.effectiveDateTime,
      value.effectivePeriod,
    ].filter((entry) => entry !== undefined).length
    if (effectiveChoices > 1) {
      context.addIssue({
        code: 'custom',
        message: 'Observation permits one effective[x].',
      })
    }

    const resultChoices = [
      value.valueQuantity,
      value.valueCodeableConcept,
      value.valueString,
      value.valueBoolean,
      value.valueInteger,
      value.valueSampledData,
    ].filter((entry) => entry !== undefined).length
    if (
      resultChoices > 1 ||
      (resultChoices === 1 && value.dataAbsentReason !== undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Observation permits one value[x] or dataAbsentReason.',
      })
    }
  })

const deviceNameSchema = z.strictObject({
  id: z.string().optional(),
  extension: z.array(extensionSchema).optional(),
  modifierExtension: z.array(extensionSchema).optional(),
  name: z.string().min(1),
  _name: primitiveMetadata,
  type: z.enum([
    'udi-label-name',
    'user-friendly-name',
    'patient-reported-name',
    'manufacturer-name',
    'model-name',
    'other',
  ]),
  _type: primitiveMetadata,
})

const deviceVersionSchema = z.strictObject({
  id: z.string().optional(),
  extension: z.array(extensionSchema).optional(),
  modifierExtension: z.array(extensionSchema).optional(),
  type: codeableConceptSchema.optional(),
  component: identifierSchema.optional(),
  value: z.string().min(1),
  _value: primitiveMetadata,
})

export const deviceSchema = z.strictObject({
  resourceType: z.literal('Device'),
  ...commonDomainResourceFields,
  identifier: z.array(identifierSchema).optional(),
  status: z
    .enum(['active', 'inactive', 'entered-in-error', 'unknown'])
    .optional(),
  _status: primitiveMetadata,
  manufacturer: z.string().optional(),
  _manufacturer: primitiveMetadata,
  manufactureDate: z.string().optional(),
  _manufactureDate: primitiveMetadata,
  expirationDate: z.string().optional(),
  _expirationDate: primitiveMetadata,
  lotNumber: z.string().optional(),
  _lotNumber: primitiveMetadata,
  serialNumber: z.string().optional(),
  _serialNumber: primitiveMetadata,
  deviceName: z.array(deviceNameSchema).optional(),
  modelNumber: z.string().optional(),
  _modelNumber: primitiveMetadata,
  partNumber: z.string().optional(),
  _partNumber: primitiveMetadata,
  type: codeableConceptSchema.optional(),
  version: z.array(deviceVersionSchema).optional(),
  patient: referenceSchema.optional(),
  owner: referenceSchema.optional(),
  location: referenceSchema.optional(),
  url: z.string().optional(),
  _url: primitiveMetadata,
  note: z.array(annotationSchema).optional(),
  safety: z.array(codeableConceptSchema).optional(),
  parent: referenceSchema.optional(),
})

export const specimenSchema = z.strictObject({
  resourceType: z.literal('Specimen'),
  ...commonDomainResourceFields,
  identifier: z.array(identifierSchema).min(1),
  accessionIdentifier: identifierSchema.optional(),
  status: z
    .enum(['available', 'unavailable', 'unsatisfactory', 'entered-in-error'])
    .optional(),
  _status: primitiveMetadata,
  type: codeableConceptSchema,
  subject: referenceSchema,
  receivedTime: z.string().optional(),
  _receivedTime: primitiveMetadata,
})

const provenanceAgentSchema = z.strictObject({
  id: z.string().optional(),
  extension: z.array(extensionSchema).optional(),
  modifierExtension: z.array(extensionSchema).optional(),
  type: codeableConceptSchema.optional(),
  role: z.array(codeableConceptSchema).optional(),
  who: referenceSchema,
  onBehalfOf: referenceSchema.optional(),
})

const provenanceEntitySchema: z.ZodType = z.lazy(() =>
  z.strictObject({
    id: z.string().optional(),
    extension: z.array(extensionSchema).optional(),
    modifierExtension: z.array(extensionSchema).optional(),
    role: z.enum(['derivation', 'revision', 'quotation', 'source', 'removal']),
    _role: primitiveMetadata,
    what: referenceSchema,
    agent: z.array(provenanceAgentSchema).optional(),
  }),
)

export const provenanceSchema = z
  .strictObject({
    resourceType: z.literal('Provenance'),
    ...commonDomainResourceFields,
    target: z.array(referenceSchema).min(1),
    occurredPeriod: periodSchema.optional(),
    occurredDateTime: z.string().optional(),
    _occurredDateTime: primitiveMetadata,
    recorded: z.string().min(1),
    _recorded: primitiveMetadata,
    policy: z.array(z.string()).optional(),
    _policy: z.array(primitiveElementSchema.nullable()).optional(),
    location: referenceSchema.optional(),
    reason: z.array(codeableConceptSchema).optional(),
    activity: codeableConceptSchema.optional(),
    agent: z.array(provenanceAgentSchema).min(1),
    entity: z.array(provenanceEntitySchema).optional(),
  })
  .refine(
    (value) =>
      value.occurredDateTime === undefined ||
      value.occurredPeriod === undefined,
    { message: 'Provenance permits one occurred[x].' },
  )

export const graphResourceSchema = z.discriminatedUnion('resourceType', [
  observationSchema,
  deviceSchema,
  provenanceSchema,
  specimenSchema,
])

export const collectionBundleSchema = z.strictObject({
  resourceType: z.literal('Bundle'),
  ...commonResourceFields,
  identifier: identifierSchema.optional(),
  type: z.literal('collection'),
  _type: primitiveMetadata,
  timestamp: z.string().optional(),
  _timestamp: primitiveMetadata,
  total: z.number().int().nonnegative().optional(),
  _total: primitiveMetadata,
  entry: z
    .array(
      z.strictObject({
        id: z.string().optional(),
        extension: z.array(extensionSchema).optional(),
        modifierExtension: z.array(extensionSchema).optional(),
        fullUrl: z
          .string()
          .regex(
            /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
          ),
        _fullUrl: primitiveMetadata,
        resource: graphResourceSchema,
      }),
    )
    .min(1),
})

export const supportedR4ResourceSchema = z.discriminatedUnion('resourceType', [
  observationSchema,
  deviceSchema,
  provenanceSchema,
  specimenSchema,
  collectionBundleSchema,
])

export const strictObjectSchema = z.strictObject
