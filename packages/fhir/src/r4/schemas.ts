//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import type {
  Attachment as R4Attachment,
  CodeableConcept as R4CodeableConcept,
  Coding as R4Coding,
  Device as R4Device,
  DocumentReference as R4DocumentReference,
  Element as R4Element,
  Expression as R4Expression,
  Extension as R4Extension,
  Identifier as R4Identifier,
  Meta as R4Meta,
  Observation as R4Observation,
  ObservationComponent as R4ObservationComponent,
  Period as R4Period,
  Provenance as R4Provenance,
  Quantity as R4Quantity,
  Reference as R4Reference,
  SampledData as R4SampledData,
  Specimen as R4Specimen,
} from 'fhir/r4.js'
import { z } from 'zod'
import type {
  CollectionBundle,
  GraphResource,
  SupportedR4Resource,
} from './types.js'

const nonBlankStringSchema = z
  .string()
  .refine((value) => value.trim() !== '', 'Expected a non-blank string.')
const r4IntegerSchema = z.number().int().min(-2_147_483_648).max(2_147_483_647)
const r4UnsignedIntSchema = z.number().int().min(0).max(2_147_483_647)
const r4PositiveIntSchema = z.number().int().min(1).max(2_147_483_647)

export const extensionSchema: z.ZodType<R4Extension> = z.lazy(
  createExtensionSchema,
)

export const primitiveElementSchema: z.ZodType<R4Element> = z.lazy(() =>
  z.strictObject({
    id: z.string().optional(),
    extension: z.array(extensionSchema).optional(),
  }),
)

const primitiveMetadata = primitiveElementSchema.optional()

const codingSchemaValue = z.strictObject({
  id: z.string().optional(),
  extension: z.array(extensionSchema).optional(),
  system: z.url().optional(),
  _system: primitiveMetadata,
  version: z.string().optional(),
  _version: primitiveMetadata,
  code: nonBlankStringSchema.optional(),
  _code: primitiveMetadata,
  display: z.string().optional(),
  _display: primitiveMetadata,
  userSelected: z.boolean().optional(),
  _userSelected: primitiveMetadata,
})
export const codingSchema: z.ZodType<R4Coding> = codingSchemaValue

const codeableConceptSchemaValue = z.strictObject({
  id: z.string().optional(),
  extension: z.array(extensionSchema).optional(),
  coding: z.array(codingSchema).optional(),
  text: z.string().optional(),
  _text: primitiveMetadata,
})
export const codeableConceptSchema: z.ZodType<R4CodeableConcept> =
  codeableConceptSchemaValue

const identifierSchemaValue = z.strictObject({
  id: z.string().optional(),
  extension: z.array(extensionSchema).optional(),
  use: z.enum(['usual', 'official', 'temp', 'secondary', 'old']).optional(),
  _use: primitiveMetadata,
  type: codeableConceptSchema.optional(),
  system: z.url(),
  _system: primitiveMetadata,
  value: nonBlankStringSchema,
  _value: primitiveMetadata,
  period: z.lazy(() => periodSchema).optional(),
  assigner: z.lazy(() => referenceSchema).optional(),
})
export const identifierSchema: z.ZodType<R4Identifier> = identifierSchemaValue

export const referenceSchema: z.ZodType<R4Reference> = z.lazy(() =>
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

const quantitySchemaValue = z.strictObject({
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
  code: nonBlankStringSchema.optional(),
  _code: primitiveMetadata,
})
export const quantitySchema: z.ZodType<R4Quantity> = quantitySchemaValue

const periodSchemaValue = z
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
export const periodSchema: z.ZodType<R4Period> = periodSchemaValue

const expressionSchemaValue = z.strictObject({
  id: z.string().optional(),
  extension: z.array(extensionSchema).optional(),
  description: z.string().optional(),
  _description: primitiveMetadata,
  name: z.string().optional(),
  _name: primitiveMetadata,
  language: nonBlankStringSchema,
  _language: primitiveMetadata,
  expression: z.string().optional(),
  _expression: primitiveMetadata,
  reference: z.string().optional(),
  _reference: primitiveMetadata,
})
export const expressionSchema: z.ZodType<R4Expression> = expressionSchemaValue

const attachmentSchemaValue = z.strictObject({
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
  size: r4UnsignedIntSchema.optional(),
  _size: primitiveMetadata,
  hash: z.string().optional(),
  _hash: primitiveMetadata,
  title: z.string().optional(),
  _title: primitiveMetadata,
  creation: z.string().optional(),
  _creation: primitiveMetadata,
})
export const attachmentSchema: z.ZodType<R4Attachment> = attachmentSchemaValue

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
  'valueId',
  'valueQuantity',
  'valueReference',
  'valueString',
  'valueTime',
  'valueUri',
  'valueUrl',
] as const

function createExtensionSchema(): z.ZodType<R4Extension> {
  return z
    .strictObject({
      id: z.string().optional(),
      extension: z.array(extensionSchema).min(1).optional(),
      url: z.string().min(1),
      _url: primitiveMetadata,
      valueBoolean: z.boolean().optional(),
      _valueBoolean: primitiveMetadata,
      valueCanonical: z.string().optional(),
      _valueCanonical: primitiveMetadata,
      valueCode: nonBlankStringSchema.optional(),
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
      valueInteger: r4IntegerSchema.optional(),
      _valueInteger: primitiveMetadata,
      valueId: z.string().optional(),
      _valueId: primitiveMetadata,
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
      const hasNestedExtensions = value.extension !== undefined
      if (
        populated > 1 ||
        (populated === 1 && hasNestedExtensions) ||
        (populated === 0 && !hasNestedExtensions)
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'Extension must contain nested extensions or exactly one value[x], but not both.',
        })
      }
    })
}

const metaSchemaValue = z.strictObject({
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
export const metaSchema: z.ZodType<R4Meta> =
  metaSchemaValue as z.ZodType<R4Meta>

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

const sampledDataSchemaValue = z.strictObject({
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
  dimensions: r4PositiveIntSchema,
  _dimensions: primitiveMetadata,
  data: z.string().optional(),
  _data: primitiveMetadata,
})
export const sampledDataSchema: z.ZodType<R4SampledData> =
  sampledDataSchemaValue

const observationComponentSchemaValue = z
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
    valueInteger: r4IntegerSchema.optional(),
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
export const observationComponentSchema: z.ZodType<R4ObservationComponent> =
  observationComponentSchemaValue

const observationSchemaValue = z
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
    valueInteger: r4IntegerSchema.optional(),
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
export const observationSchema: z.ZodType<R4Observation> =
  observationSchemaValue

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

const deviceSchemaValue = z.strictObject({
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
export const deviceSchema: z.ZodType<R4Device> = deviceSchemaValue

const documentReferenceContentSchema = z.strictObject({
  id: z.string().optional(),
  extension: z.array(extensionSchema).optional(),
  modifierExtension: z.array(extensionSchema).optional(),
  attachment: attachmentSchema,
  format: codingSchema.optional(),
})

const documentReferenceContextSchema = z.strictObject({
  id: z.string().optional(),
  extension: z.array(extensionSchema).optional(),
  modifierExtension: z.array(extensionSchema).optional(),
  encounter: z.array(referenceSchema).optional(),
  event: z.array(codeableConceptSchema).optional(),
  period: periodSchema.optional(),
  facilityType: codeableConceptSchema.optional(),
  practiceSetting: codeableConceptSchema.optional(),
  sourcePatientInfo: referenceSchema.optional(),
  related: z.array(referenceSchema).optional(),
})

/** Strict bounded R4 surface required by the Sensor recording contract. */
const documentReferenceSchemaValue = z.strictObject({
  resourceType: z.literal('DocumentReference'),
  ...commonDomainResourceFields,
  masterIdentifier: identifierSchema.optional(),
  identifier: z.array(identifierSchema).optional(),
  status: z.enum(['current', 'superseded', 'entered-in-error']),
  _status: primitiveMetadata,
  docStatus: z
    .enum(['preliminary', 'final', 'amended', 'entered-in-error'])
    .optional(),
  _docStatus: primitiveMetadata,
  type: codeableConceptSchema.optional(),
  category: z.array(codeableConceptSchema).optional(),
  subject: referenceSchema.optional(),
  date: z.string().optional(),
  _date: primitiveMetadata,
  author: z.array(referenceSchema).optional(),
  authenticator: referenceSchema.optional(),
  custodian: referenceSchema.optional(),
  relatesTo: z
    .array(
      z.strictObject({
        id: z.string().optional(),
        extension: z.array(extensionSchema).optional(),
        modifierExtension: z.array(extensionSchema).optional(),
        code: z.enum(['replaces', 'transforms', 'signs', 'appends']),
        _code: primitiveMetadata,
        target: referenceSchema,
      }),
    )
    .optional(),
  description: z.string().optional(),
  _description: primitiveMetadata,
  securityLabel: z.array(codeableConceptSchema).optional(),
  content: z.array(documentReferenceContentSchema).min(1),
  context: documentReferenceContextSchema.optional(),
})
export const documentReferenceSchema: z.ZodType<R4DocumentReference> =
  documentReferenceSchemaValue

const specimenSchemaValue = z.strictObject({
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
export const specimenSchema: z.ZodType<R4Specimen> = specimenSchemaValue

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

const provenanceSchemaValue = z
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
export const provenanceSchema: z.ZodType<R4Provenance> =
  provenanceSchemaValue as z.ZodType<R4Provenance>

const graphResourceSchemaValue = z.discriminatedUnion('resourceType', [
  observationSchemaValue,
  deviceSchemaValue,
  documentReferenceSchemaValue,
  provenanceSchemaValue,
  specimenSchemaValue,
])
export const graphResourceSchema: z.ZodType<GraphResource> =
  graphResourceSchemaValue as z.ZodType<GraphResource>

const collectionBundleSchemaValue = z.strictObject({
  resourceType: z.literal('Bundle'),
  ...commonResourceFields,
  identifier: identifierSchema.optional(),
  type: z.literal('collection'),
  _type: primitiveMetadata,
  timestamp: z.string().optional(),
  _timestamp: primitiveMetadata,
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
export const collectionBundleSchema: z.ZodType<CollectionBundle> =
  collectionBundleSchemaValue

const supportedR4ResourceSchemaValue = z.discriminatedUnion('resourceType', [
  observationSchemaValue,
  deviceSchemaValue,
  documentReferenceSchemaValue,
  provenanceSchemaValue,
  specimenSchemaValue,
  collectionBundleSchemaValue,
])
export const supportedR4ResourceSchema: z.ZodType<SupportedR4Resource> =
  supportedR4ResourceSchemaValue as z.ZodType<SupportedR4Resource>
