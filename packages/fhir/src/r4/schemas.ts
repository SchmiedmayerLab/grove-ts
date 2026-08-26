//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

// The Grove profiles. Every schema here is derived from the corresponding R4B schema in
// `src/elements` or `src/resources` rather than redeclared: the field list is spread from the base
// shape, the elements the profiles forbid are omitted, and only the constraints the profiles add
// are written out. A field therefore exists in exactly one place, and this file reads as the
// profile itself rather than as a second copy of R4B.
//
// Two properties hold throughout, and both are held by tests rather than by care:
//   - every shape matches the implementation guide's shape, at every depth (`derived-shapes`)
//   - no base schema survives anywhere inside a profile's graph (`grove-graph`)
//
// The second is why nested fields are re-bound rather than inherited. Closing the outer object is
// not enough — unknown-key rejection has to be threaded through the whole tree, and a `superRefine`
// cannot see a key the base schema already stripped.

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
} from 'fhir/r4b.js'
import { z } from 'zod'
import type {
  CollectionBundle,
  GraphResource,
  SupportedR4Resource,
} from './types.js'
import {
  dateTimeSchema,
  instantSchema,
  untypedAnnotationSchema,
  untypedAttachmentSchema,
  untypedCodeableConceptSchema,
  untypedCodingSchema,
  untypedExpressionSchema,
  untypedExtensionSchema,
  untypedIdentifierSchema,
  untypedMetaSchema,
  untypedPeriodSchema,
  untypedQuantitySchema,
  untypedRangeSchema,
  untypedReferenceSchema,
  untypedSampledDataSchema,
} from '../elements/index.js'
import { untypedBundleSchema } from '../resources/bundle.js'
import { untypedDeviceSchema } from '../resources/device.js'
import { untypedDocumentReferenceSchema } from '../resources/documentReference.js'
import { untypedObservationSchema } from '../resources/observation.js'
import { untypedProvenanceSchema } from '../resources/provenance.js'
import { untypedSpecimenSchema } from '../resources/specimen.js'
import {
  deviceStatusSchema,
  documentReferenceDocStatusSchema,
  documentReferenceRelatesToCodeSchema,
  documentReferenceStatusSchema,
  observationStatusSchema,
  provenanceEntityRoleSchema,
  specimenStatusSchema,
} from '../valueSets/index.js'

const nonBlankStringSchema = z
  .string()
  .refine((value) => value.trim() !== '', 'Expected a non-blank string.')

const r4IntegerSchema = z.number().int().min(-2_147_483_648).max(2_147_483_647)
const r4UnsignedIntSchema = z.number().int().min(0).max(2_147_483_647)
const r4PositiveIntSchema = z.number().int().min(1).max(2_147_483_647)

const URN_UUID =
  /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u

/**
 * The epoch milliseconds a FHIR dateTime names, for ordering only.
 *
 * `Date.parse` returns NaN for the leap second R4 permits, which would let an out-of-order period
 * compare as acceptable. The second is folded to :59 first, which cannot change the ordering of
 * two values a second apart to within the precision FHIR states.
 */
const fhirDateTimeToEpoch = (value: string): number =>
  Date.parse(value.replace(/:60(?=\.|Z|[+-]|$)/u, ':59'))

/** Element as the profiles use it: an id and extensions, and nothing else. */
export const primitiveElementSchema: z.ZodType<R4Element> = z.lazy(() =>
  z.strictObject({
    id: z.string().optional(),
    extension: z.array(extensionSchema).optional(),
  }),
)

const metadata = (): z.ZodOptional<z.ZodType<R4Element>> =>
  primitiveElementSchema.optional()

// The base schemas carry a primitive-extension slot beside every primitive field. Rebinding
// roughly fifty of those by hand would bury the constraints that actually differ, so the rewrite
// happens once, here. `Meta.profile` and `Provenance.policy` are arrays, so their slots are
// arrays of nullable Elements.
const PRIMITIVE_ARRAY_SLOTS: ReadonlySet<string> = new Set([
  '_policy',
  '_profile',
])

const rebindSlot = (key: string, schema: z.core.$ZodType): z.core.$ZodType => {
  if (!key.startsWith('_')) return schema
  if (PRIMITIVE_ARRAY_SLOTS.has(key)) {
    return z.array(primitiveElementSchema.nullable()).optional()
  }
  return metadata()
}

const rebindSlots = (
  shape: z.ZodRawShape,
  dropIdSlot: boolean,
): z.ZodRawShape =>
  Object.fromEntries(
    Object.entries(shape)
      .filter(([key]) => !(dropIdSlot && key === '_id'))
      .map(([key, schema]) => [key, rebindSlot(key, schema)]),
  )

// `Resource.id` is a primitive, so `_id` belongs beside it; Element has no such field, and the
// profiles drop the slot the base schemas added there. Hence the two entry points.
//
// Both return types keep the input's field types: a rebound slot validates the same `Element` the
// base one did, so only `_id`'s removal is visible to TypeScript. Stating that lets the choice-
// element refinements below read the spread fields instead of having them redeclared.
const profiledElement = <Shape extends z.ZodRawShape>(
  shape: Shape,
): Omit<Shape, '_id'> => rebindSlots(shape, true) as Omit<Shape, '_id'>

const profiledResource = <Shape extends z.ZodRawShape>(shape: Shape): Shape =>
  rebindSlots(shape, false) as Shape

// The base schemas annotate their private backbone elements as `ZodType`, which hides `.shape`
// from TypeScript even though the object is right there at runtime. Naming the wrapper chain
// recovers it, so the field list still lives only in the base schema; `derived-shapes` is what
// proves the keys line up.
type OptionalArrayOf<Shape extends z.ZodRawShape> = z.ZodOptional<
  z.ZodArray<z.ZodObject<Shape>>
>
type ArrayOf<Shape extends z.ZodRawShape> = z.ZodArray<z.ZodObject<Shape>>

const asOptionalArray = (schema: unknown): z.ZodObject<z.ZodRawShape> =>
  (schema as OptionalArrayOf<z.ZodRawShape>).unwrap().element

const asArray = (schema: unknown): z.ZodObject<z.ZodRawShape> =>
  (schema as ArrayOf<z.ZodRawShape>).element

const asOptionalObject = (schema: unknown): z.ZodObject<z.ZodRawShape> =>
  (schema as z.ZodOptional<z.ZodObject<z.ZodRawShape>>).unwrap()

/** The `extension` and `modifierExtension` slots every profiled backbone element re-binds. */
const extensionSlots = (): z.ZodRawShape => ({
  get extension() {
    return z.array(extensionSchema).optional()
  },
  get modifierExtension() {
    return z.array(extensionSchema).optional()
  },
})

// -- Data types ---------------------------------------------------------------------------------

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

// Extension is the one data type stated as an allow-list rather than a deny-list: R4B admits over
// fifty value[x] choices where the profiles admit nineteen, so naming what is kept is both the
// shorter half and the one that reads as a decision.
const extensionKeys = {
  id: true,
  extension: true,
  url: true,
  _url: true,
  valueBoolean: true,
  _valueBoolean: true,
  valueCanonical: true,
  _valueCanonical: true,
  valueCode: true,
  _valueCode: true,
  valueCodeableConcept: true,
  valueCoding: true,
  valueDate: true,
  _valueDate: true,
  valueDateTime: true,
  _valueDateTime: true,
  valueDecimal: true,
  _valueDecimal: true,
  valueExpression: true,
  valueIdentifier: true,
  valueInstant: true,
  _valueInstant: true,
  valueInteger: true,
  _valueInteger: true,
  valueId: true,
  _valueId: true,
  valueQuantity: true,
  valueReference: true,
  valueString: true,
  _valueString: true,
  valueTime: true,
  _valueTime: true,
  valueUri: true,
  _valueUri: true,
  valueUrl: true,
  _valueUrl: true,
} as const

export const extensionSchema: z.ZodType<R4Extension> = z.lazy(() =>
  z
    .strictObject({
      ...profiledElement(
        untypedExtensionSchema.unwrap().pick(extensionKeys).shape,
      ),
      extension: z.array(extensionSchema).min(1).optional(),
      url: z.string().min(1),
      valueCode: nonBlankStringSchema.optional(),
      get valueCodeableConcept() {
        return codeableConceptSchema.optional()
      },
      get valueCoding() {
        return codingSchema.optional()
      },
      get valueExpression() {
        return expressionSchema.optional()
      },
      get valueIdentifier() {
        return identifierSchema.optional()
      },
      valueInteger: r4IntegerSchema.optional(),
      get valueQuantity() {
        return quantitySchema.optional()
      },
      get valueReference() {
        return referenceSchema.optional()
      },
    })
    .superRefine((value, context) => {
      // Only nineteen of the parsed keys are choice elements, and they are named once above.
      const choices: Record<string, unknown> = value
      const populated = extensionValueKeys.filter(
        (key) => choices[key] !== undefined,
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
    }),
)

export const codingSchema: z.ZodType<R4Coding> = z.lazy(() =>
  z.strictObject({
    ...profiledElement(untypedCodingSchema.unwrap().shape),
    extension: z.array(extensionSchema).optional(),
    system: z.url().optional(),
    code: nonBlankStringSchema.optional(),
  }),
)

export const codeableConceptSchema: z.ZodType<R4CodeableConcept> = z.lazy(() =>
  z.strictObject({
    ...profiledElement(
      untypedCodeableConceptSchema.unwrap().omit({ _coding: true }).shape,
    ),
    extension: z.array(extensionSchema).optional(),
    coding: z.array(codingSchema).optional(),
  }),
)

export const identifierSchema: z.ZodType<R4Identifier> = z.lazy(() =>
  z.strictObject({
    ...profiledElement(untypedIdentifierSchema.unwrap().shape),
    extension: z.array(extensionSchema).optional(),
    type: codeableConceptSchema.optional(),
    system: z.url(),
    value: nonBlankStringSchema,
    get period() {
      return periodSchema.optional()
    },
    get assigner() {
      return referenceSchema.optional()
    },
  }),
)

export const referenceSchema: z.ZodType<R4Reference> = z.lazy(() =>
  z
    .strictObject({
      ...profiledElement(untypedReferenceSchema.unwrap().shape),
      extension: z.array(extensionSchema).optional(),
      reference: z.string().min(1).optional(),
      type: z.url().optional(),
      get identifier() {
        return identifierSchema.optional()
      },
    })
    .refine(
      (value) =>
        value.reference !== undefined || value.identifier !== undefined,
      { message: 'A Reference requires reference or identifier.' },
    ),
)

export const quantitySchema: z.ZodType<R4Quantity> = z.lazy(() =>
  z.strictObject({
    ...profiledElement(untypedQuantitySchema.unwrap().shape),
    extension: z.array(extensionSchema).optional(),
    system: z.url().optional(),
    code: nonBlankStringSchema.optional(),
  }),
)

export const periodSchema: z.ZodType<R4Period> = z.lazy(() =>
  z
    .strictObject({
      ...profiledElement(untypedPeriodSchema.unwrap().shape),
      extension: z.array(extensionSchema).optional(),
    })
    .refine(
      (value) => {
        if (value.start === undefined || value.end === undefined) return true
        // A value stated to lower precision compares at the start of the period it names.
        const start = fhirDateTimeToEpoch(value.start)
        const end = fhirDateTimeToEpoch(value.end)
        // Only a value the pattern already rejected can still be NaN here, and that is reported
        // as malformed; calling it out of order too would name the wrong problem.
        return Number.isNaN(start) || Number.isNaN(end) || start <= end
      },
      { message: 'Period.start must not be later than Period.end.' },
    ),
)

export const expressionSchema: z.ZodType<R4Expression> = z.lazy(() =>
  z.strictObject({
    ...profiledElement(untypedExpressionSchema.unwrap().shape),
    extension: z.array(extensionSchema).optional(),
    language: nonBlankStringSchema,
  }),
)

export const attachmentSchema: z.ZodType<R4Attachment> = z.lazy(() =>
  z.strictObject({
    ...profiledElement(untypedAttachmentSchema.unwrap().shape),
    extension: z.array(extensionSchema).optional(),
    size: r4UnsignedIntSchema.optional(),
  }),
)

export const metaSchema: z.ZodType<R4Meta> = z.lazy(() =>
  z.strictObject({
    ...profiledElement(untypedMetaSchema.unwrap().shape),
    extension: z.array(extensionSchema).optional(),
    profile: z.array(z.string().min(1)).optional(),
    security: z.array(codingSchema).optional(),
    tag: z.array(codingSchema).optional(),
  }),
)

const annotationSchema = z.lazy(() =>
  z.strictObject({
    ...profiledElement(untypedAnnotationSchema.unwrap().shape),
    extension: z.array(extensionSchema).optional(),
    get authorReference() {
      return referenceSchema.optional()
    },
    text: z.string(),
  }),
)

const rangeSchema = z.lazy(() =>
  z.strictObject({
    ...profiledElement(untypedRangeSchema.unwrap().shape),
    extension: z.array(extensionSchema).optional(),
    get low() {
      return quantitySchema.optional()
    },
    get high() {
      return quantitySchema.optional()
    },
  }),
)

export const sampledDataSchema: z.ZodType<R4SampledData> = z.lazy(() =>
  z.strictObject({
    ...profiledElement(untypedSampledDataSchema.unwrap().shape),
    extension: z.array(extensionSchema).optional(),
    get origin() {
      return quantitySchema
    },
    period: z.number().positive(),
    dimensions: r4PositiveIntSchema,
  }),
)

// -- Observation --------------------------------------------------------------------------------

const legacyObservation = untypedObservationSchema.unwrap()
const legacyComponent = asOptionalArray(legacyObservation.shape.component)
const legacyComponentRange = asOptionalArray(
  legacyComponent.shape.referenceRange,
)

const observationReferenceRangeValue = z.strictObject({
  ...profiledElement(legacyComponentRange.shape),
  ...extensionSlots(),
  get low() {
    return quantitySchema.optional()
  },
  get high() {
    return quantitySchema.optional()
  },
  get type() {
    return codeableConceptSchema.optional()
  },
  get appliesTo() {
    return z.array(codeableConceptSchema).optional()
  },
  get age() {
    return rangeSchema.optional()
  },
})

const observationComponentValue = z
  .strictObject({
    ...profiledElement(
      legacyComponent.omit({
        valueRange: true,
        valueRatio: true,
        valueTime: true,
        _valueTime: true,
        valueDateTime: true,
        _valueDateTime: true,
        valuePeriod: true,
      }).shape,
    ),
    ...extensionSlots(),
    get code() {
      return codeableConceptSchema
    },
    get valueQuantity() {
      return quantitySchema.optional()
    },
    get valueCodeableConcept() {
      return codeableConceptSchema.optional()
    },
    valueInteger: r4IntegerSchema.optional(),
    get valueSampledData() {
      return sampledDataSchema.optional()
    },
    get dataAbsentReason() {
      return codeableConceptSchema.optional()
    },
    get interpretation() {
      return z.array(codeableConceptSchema).optional()
    },
    referenceRange: z.array(observationReferenceRangeValue).optional(),
  })
  .superRefine((value, context) => {
    // `valueString` and `valueBoolean` reach the shape through the base backbone element, whose
    // field types the wrapper cast above does not carry; the rest are declared right here.
    const choices = value as Record<string, unknown>
    const values = [
      value.valueQuantity,
      value.valueCodeableConcept,
      choices.valueString,
      choices.valueBoolean,
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
  observationComponentValue

const observationValue = z
  .strictObject({
    ...profiledResource(
      legacyObservation.omit({
        text: true,
        contained: true,
        effectiveTiming: true,
        effectiveInstant: true,
        _effectiveInstant: true,
        valueRange: true,
        valueRatio: true,
        valueTime: true,
        _valueTime: true,
        valueDateTime: true,
        _valueDateTime: true,
        valuePeriod: true,
        referenceRange: true,
      }).shape,
    ),
    ...extensionSlots(),
    resourceType: z.literal('Observation'),
    get meta() {
      return metaSchema.optional()
    },
    get identifier() {
      return z.array(identifierSchema).optional()
    },
    get basedOn() {
      return z.array(referenceSchema).optional()
    },
    get partOf() {
      return z.array(referenceSchema).optional()
    },
    status: observationStatusSchema,
    get category() {
      return z.array(codeableConceptSchema).optional()
    },
    get code() {
      return codeableConceptSchema
    },
    get subject() {
      return referenceSchema.optional()
    },
    get focus() {
      return z.array(referenceSchema).optional()
    },
    get encounter() {
      return referenceSchema.optional()
    },
    effectiveDateTime: dateTimeSchema.optional(),
    get effectivePeriod() {
      return periodSchema.optional()
    },
    issued: instantSchema.optional(),
    get performer() {
      return z.array(referenceSchema).optional()
    },
    get valueQuantity() {
      return quantitySchema.optional()
    },
    get valueCodeableConcept() {
      return codeableConceptSchema.optional()
    },
    valueInteger: r4IntegerSchema.optional(),
    get valueSampledData() {
      return sampledDataSchema.optional()
    },
    get dataAbsentReason() {
      return codeableConceptSchema.optional()
    },
    get interpretation() {
      return z.array(codeableConceptSchema).optional()
    },
    get note() {
      return z.array(annotationSchema).optional()
    },
    get bodySite() {
      return codeableConceptSchema.optional()
    },
    get method() {
      return codeableConceptSchema.optional()
    },
    get specimen() {
      return referenceSchema.optional()
    },
    get device() {
      return referenceSchema.optional()
    },
    get hasMember() {
      return z.array(referenceSchema).optional()
    },
    get derivedFrom() {
      return z.array(referenceSchema).optional()
    },
    component: z.array(observationComponentValue).optional(),
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

export const observationSchema: z.ZodType<R4Observation> = observationValue

// -- Device -------------------------------------------------------------------------------------

const legacyDevice = untypedDeviceSchema.unwrap()

const deviceNameValue = z.strictObject({
  ...profiledElement(asOptionalArray(legacyDevice.shape.deviceName).shape),
  ...extensionSlots(),
  name: z.string().min(1),
})

const deviceVersionValue = z.strictObject({
  ...profiledElement(asOptionalArray(legacyDevice.shape.version).shape),
  ...extensionSlots(),
  get type() {
    return codeableConceptSchema.optional()
  },
  get component() {
    return identifierSchema.optional()
  },
  value: z.string().min(1),
})

const deviceValue = z.strictObject({
  ...profiledResource(
    legacyDevice.omit({
      text: true,
      contained: true,
      definition: true,
      udiCarrier: true,
      distinctIdentifier: true,
      _distinctIdentifier: true,
      property: true,
      specialization: true,
      statusReason: true,
      contact: true,
    }).shape,
  ),
  ...extensionSlots(),
  resourceType: z.literal('Device'),
  get meta() {
    return metaSchema.optional()
  },
  get identifier() {
    return z.array(identifierSchema).optional()
  },
  status: deviceStatusSchema.optional(),
  manufactureDate: dateTimeSchema.optional(),
  expirationDate: dateTimeSchema.optional(),
  deviceName: z.array(deviceNameValue).optional(),
  get type() {
    return codeableConceptSchema.optional()
  },
  version: z.array(deviceVersionValue).optional(),
  get patient() {
    return referenceSchema.optional()
  },
  get owner() {
    return referenceSchema.optional()
  },
  get location() {
    return referenceSchema.optional()
  },
  get note() {
    return z.array(annotationSchema).optional()
  },
  get safety() {
    return z.array(codeableConceptSchema).optional()
  },
  get parent() {
    return referenceSchema.optional()
  },
})

export const deviceSchema: z.ZodType<R4Device> =
  deviceValue as unknown as z.ZodType<R4Device>

// -- DocumentReference --------------------------------------------------------------------------

const legacyDocumentReference = untypedDocumentReferenceSchema.unwrap()

const documentReferenceContentValue = z.strictObject({
  ...profiledElement(asArray(legacyDocumentReference.shape.content).shape),
  ...extensionSlots(),
  get attachment() {
    return attachmentSchema
  },
  get format() {
    return codingSchema.optional()
  },
})

const documentReferenceContextValue = z.strictObject({
  ...profiledElement(
    asOptionalObject(legacyDocumentReference.shape.context).shape,
  ),
  ...extensionSlots(),
  get encounter() {
    return z.array(referenceSchema).optional()
  },
  get event() {
    return z.array(codeableConceptSchema).optional()
  },
  get period() {
    return periodSchema.optional()
  },
  get facilityType() {
    return codeableConceptSchema.optional()
  },
  get practiceSetting() {
    return codeableConceptSchema.optional()
  },
  get sourcePatientInfo() {
    return referenceSchema.optional()
  },
  get related() {
    return z.array(referenceSchema).optional()
  },
})

const documentReferenceRelatesToValue = z.strictObject({
  ...profiledElement(
    asOptionalArray(legacyDocumentReference.shape.relatesTo).shape,
  ),
  ...extensionSlots(),
  code: documentReferenceRelatesToCodeSchema,
  get target() {
    return referenceSchema
  },
})

const documentReferenceValue = z.strictObject({
  ...profiledResource(
    legacyDocumentReference.omit({ text: true, contained: true }).shape,
  ),
  ...extensionSlots(),
  resourceType: z.literal('DocumentReference'),
  get meta() {
    return metaSchema.optional()
  },
  get masterIdentifier() {
    return identifierSchema.optional()
  },
  get identifier() {
    return z.array(identifierSchema).optional()
  },
  status: documentReferenceStatusSchema,
  docStatus: documentReferenceDocStatusSchema.optional(),
  get type() {
    return codeableConceptSchema.optional()
  },
  get category() {
    return z.array(codeableConceptSchema).optional()
  },
  get subject() {
    return referenceSchema.optional()
  },
  get author() {
    return z.array(referenceSchema).optional()
  },
  get authenticator() {
    return referenceSchema.optional()
  },
  get custodian() {
    return referenceSchema.optional()
  },
  relatesTo: z.array(documentReferenceRelatesToValue).optional(),
  get securityLabel() {
    return z.array(codeableConceptSchema).optional()
  },
  content: z.array(documentReferenceContentValue).min(1),
  context: documentReferenceContextValue.optional(),
})

export const documentReferenceSchema: z.ZodType<R4DocumentReference> =
  documentReferenceValue

// -- Specimen -----------------------------------------------------------------------------------

const legacySpecimen = untypedSpecimenSchema.unwrap()

const specimenValue = z.strictObject({
  ...profiledResource(
    legacySpecimen.omit({
      text: true,
      contained: true,
      collection: true,
      condition: true,
      container: true,
      note: true,
      parent: true,
      processing: true,
      request: true,
    }).shape,
  ),
  ...extensionSlots(),
  resourceType: z.literal('Specimen'),
  get meta() {
    return metaSchema.optional()
  },
  identifier: z.array(identifierSchema).min(1),
  get accessionIdentifier() {
    return identifierSchema.optional()
  },
  status: specimenStatusSchema.optional(),
  get type() {
    return codeableConceptSchema
  },
  get subject() {
    return referenceSchema
  },
  receivedTime: dateTimeSchema.optional(),
})

export const specimenSchema: z.ZodType<R4Specimen> = specimenValue

// -- Provenance ---------------------------------------------------------------------------------

const legacyProvenance = untypedProvenanceSchema.unwrap()

const provenanceAgentValue = z.strictObject({
  ...profiledElement(asArray(legacyProvenance.shape.agent).shape),
  ...extensionSlots(),
  get type() {
    return codeableConceptSchema.optional()
  },
  get role() {
    return z.array(codeableConceptSchema).optional()
  },
  get who() {
    return referenceSchema
  },
  get onBehalfOf() {
    return referenceSchema.optional()
  },
})

const provenanceEntityValue = z.strictObject({
  ...profiledElement(asOptionalArray(legacyProvenance.shape.entity).shape),
  ...extensionSlots(),
  role: provenanceEntityRoleSchema,
  get what() {
    return referenceSchema
  },
  agent: z.array(provenanceAgentValue).optional(),
})

const provenanceValue = z
  .strictObject({
    ...profiledResource(
      legacyProvenance.omit({ text: true, contained: true, signature: true })
        .shape,
    ),
    ...extensionSlots(),
    resourceType: z.literal('Provenance'),
    get meta() {
      return metaSchema.optional()
    },
    target: z.array(referenceSchema).min(1),
    get occurredPeriod() {
      return periodSchema.optional()
    },
    occurredDateTime: dateTimeSchema.optional(),
    recorded: instantSchema,
    get location() {
      return referenceSchema.optional()
    },
    get reason() {
      return z.array(codeableConceptSchema).optional()
    },
    get activity() {
      return codeableConceptSchema.optional()
    },
    agent: z.array(provenanceAgentValue).min(1),
    entity: z.array(provenanceEntityValue).optional(),
  })
  .refine(
    (value) =>
      value.occurredDateTime === undefined ||
      value.occurredPeriod === undefined,
    { message: 'Provenance permits one occurred[x].' },
  )

export const provenanceSchema: z.ZodType<R4Provenance> = provenanceValue

// -- Graph and bundle ---------------------------------------------------------------------------

const graphResourceValue = z.discriminatedUnion('resourceType', [
  observationValue,
  deviceValue,
  documentReferenceValue,
  provenanceValue,
  specimenValue,
])

export const graphResourceSchema: z.ZodType<GraphResource> =
  graphResourceValue as unknown as z.ZodType<GraphResource>

// `untypedBundleSchema` is already generic over the resource it carries, so binding the graph
// union here is what makes the entries strict; there is no getter to forget.
const legacyCollectionBundle = untypedBundleSchema(graphResourceValue)

const collectionBundleEntryValue = z.strictObject({
  ...profiledElement(
    asOptionalArray(legacyCollectionBundle.shape.entry).omit({
      link: true,
      search: true,
      request: true,
      response: true,
    }).shape,
  ),
  ...extensionSlots(),
  fullUrl: z.string().regex(URN_UUID),
  resource: graphResourceValue,
})

const collectionBundleValue = z.strictObject({
  ...profiledResource(
    legacyCollectionBundle.omit({
      total: true,
      _total: true,
      signature: true,
      link: true,
    }).shape,
  ),
  resourceType: z.literal('Bundle'),
  get meta() {
    return metaSchema.optional()
  },
  get identifier() {
    return identifierSchema.optional()
  },
  type: z.literal('collection'),
  timestamp: instantSchema.optional(),
  entry: z.array(collectionBundleEntryValue).min(1),
})

export const collectionBundleSchema: z.ZodType<CollectionBundle> =
  collectionBundleValue as unknown as z.ZodType<CollectionBundle>

const supportedR4ResourceValue = z.discriminatedUnion('resourceType', [
  observationValue,
  deviceValue,
  documentReferenceValue,
  provenanceValue,
  specimenValue,
  collectionBundleValue,
])

export const supportedR4ResourceSchema: z.ZodType<SupportedR4Resource> =
  supportedR4ResourceValue as unknown as z.ZodType<SupportedR4Resource>
