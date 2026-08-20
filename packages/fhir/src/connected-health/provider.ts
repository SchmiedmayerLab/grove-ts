//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'
import {
  connectedHealthRecordEffectiveRules,
  connectedHealthScalarMappings,
} from './contract.generated.js'
import {
  deriveConnectedHealthIdentities,
  parseResourceIdentityInput,
} from './identity.js'
import { containsReversibleIdentityRepresentation } from './privacy.js'
import type {
  ConnectedHealthMeasurementBundleInput,
  ConnectedProvider,
  NormalizedProviderRecord,
} from './types.js'
import {
  compareFhirInstants,
  deepFreeze,
  issues,
  ok,
  parseAbsoluteUri,
  parseFhirInstant,
  parsePatientReference,
  parsePositiveInteger,
  parseResearchStudyReference,
  type Issue,
  type Result,
} from '../core/index.js'
import { sharedMobileMeasurementCatalog } from '../mobile/measurement-catalog.generated.js'
import { canonicalizeMobileEffectiveInstant } from '../mobile/time.js'
import type { MobileMeasurement } from '../mobile/types.js'

const primitiveInstantSchemaValue = z
  .string()
  .refine((value) => parseFhirInstant(value).ok, {
    message:
      'Expected an RFC 3339 instant with seconds and an explicit UTC offset.',
  })
export const primitiveInstantSchema: z.ZodString = primitiveInstantSchemaValue

const mobileEffectiveInstantSchema = z.string().transform((value, context) => {
  const canonical = canonicalizeMobileEffectiveInstant(value)
  if (!canonical.ok) {
    for (const issue of canonical.issues) {
      context.addIssue({ code: 'custom', message: issue.message })
    }
    return z.NEVER
  }
  return canonical.value
})

const nonBlankStringSchemaValue = z
  .string()
  .refine((value) => value.trim() !== '', 'Expected a non-blank string.')
export const nonBlankStringSchema: z.ZodString = nonBlankStringSchemaValue

const identifierInputSchemaValue = z.strictObject({
  system: z.url(),
  value: nonBlankStringSchema,
})
export const identifierInputSchema: z.ZodObject<
  { system: z.ZodURL; value: z.ZodString },
  z.core.$strict
> = identifierInputSchemaValue

const fhirIdSchemaValue = z.string().regex(/^[A-Za-z0-9\-.]{1,64}$/u)
export const fhirIdSchema: z.ZodString = fhirIdSchemaValue

const resourceIdentitySchema = z.strictObject({
  identifier: identifierInputSchema,
  id: fhirIdSchema.optional(),
})

const applicationDeviceSchemaValue = z.strictObject({
  identity: resourceIdentitySchema,
  name: nonBlankStringSchema,
  version: nonBlankStringSchema.optional(),
  manufacturer: nonBlankStringSchema.optional(),
})
export const applicationDeviceSchema: z.ZodType<{
  identity: {
    identifier: { system: string; value: string }
    id?: string | undefined
  }
  name: string
  version?: string | undefined
  manufacturer?: string | undefined
}> = applicationDeviceSchemaValue

const recordingDeviceBase = {
  identity: resourceIdentitySchema,
  name: nonBlankStringSchema.optional(),
  manufacturer: nonBlankStringSchema.optional(),
  modelNumber: nonBlankStringSchema.optional(),
} as const

const recordingDeviceSchema = z.discriminatedUnion('identityScope', [
  z.strictObject({
    ...recordingDeviceBase,
    identityScope: z.literal('deployment-scoped'),
  }),
  z.strictObject({
    ...recordingDeviceBase,
    identityScope: z.literal('authorized-hardware'),
    disclosureAuthorization: z.literal('authorized-for-exchange'),
  }),
])

const gatewayApplicationSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('converter-application'),
    roleAssurance: z.literal('mediated-or-routed-measurement'),
  }),
  z.strictObject({
    kind: z.literal('distinct-application'),
    roleAssurance: z.literal('mediated-or-routed-measurement'),
    application: applicationDeviceSchema,
  }),
])

const sourceBase = {
  recordingMethod: z
    .enum(['actively-recorded', 'automatically-recorded', 'manual-entry'])
    .optional(),
  recordingDevice: recordingDeviceSchema.optional(),
} as const

const sourceSchema = z.strictObject({
  ...sourceBase,
  adapter: z.strictObject({
    kind: z.literal('connected-health'),
    provider: z.enum(
      Object.keys(connectedHealthScalarMappings) as [
        ConnectedProvider,
        ...ConnectedProvider[],
      ],
    ),
  }),
  providerAccountIdentifier: identifierInputSchema.extend({
    assurance: z.literal('deployment-scoped-pseudonym'),
  }),
  sourceType: nonBlankStringSchema,
  sourceNativeId: nonBlankStringSchema,
  dataOrigin: applicationDeviceSchema,
})

const instantEffectiveSchema = z.strictObject({
  kind: z.literal('date-time'),
  value: mobileEffectiveInstantSchema,
})

const periodEffectiveSchema = z
  .strictObject({
    kind: z.literal('period'),
    start: mobileEffectiveInstantSchema,
    end: mobileEffectiveInstantSchema,
  })
  .refine(
    (value) => {
      const ordering = compareFhirInstants(value.start, value.end)
      return ordering.ok && ordering.value === -1
    },
    { message: 'A measurement Period must end after it starts.' },
  )

const instantQuantityMeasurementSchema = z.strictObject({
  kind: z.enum([
    'basal-body-temperature',
    'body-height',
    'body-temperature',
    'body-weight',
    'heart-rate',
    'oxygen-saturation',
    'respiratory-rate',
  ]),
  value: z.number(),
  effective: instantEffectiveSchema,
})

const periodQuantityMeasurementSchema = z.strictObject({
  kind: z.enum(['active-energy', 'distance', 'sleep-duration', 'step-count']),
  value: z.number().nonnegative(),
  effective: periodEffectiveSchema,
})

const bloodPressureMeasurementSchema = z.strictObject({
  kind: z.literal('blood-pressure'),
  systolic: z.number().positive(),
  diastolic: z.number().positive(),
  effective: instantEffectiveSchema,
})

const sleepStageMeasurementSchema = z.strictObject({
  kind: z.literal('sleep-stage'),
  stage: z.enum(sharedMobileMeasurementCatalog['sleep-stage'].allowedValues),
  sourceStageCoding: z
    .strictObject({
      system: z.url(),
      code: nonBlankStringSchema,
      display: nonBlankStringSchema.optional(),
    })
    .optional(),
  effective: periodEffectiveSchema,
})

const measurementSchema = z.discriminatedUnion('kind', [
  instantQuantityMeasurementSchema,
  periodQuantityMeasurementSchema,
  bloodPressureMeasurementSchema,
  sleepStageMeasurementSchema,
])

const refineMeasurement = (
  measurement: z.infer<typeof measurementSchema>,
  path: ReadonlyArray<number | string>,
  context: z.core.$RefinementCtx,
) => {
  if (
    measurement.effective.kind === 'date-time' &&
    'value' in measurement &&
    measurement.kind !== 'oxygen-saturation' &&
    measurement.value <= 0
  ) {
    context.addIssue({
      code: 'custom',
      path: [...path, 'value'],
      message: 'An instantaneous measurement value must be greater than zero.',
    })
  }
  if (
    measurement.kind === 'oxygen-saturation' &&
    (measurement.value < 0 || measurement.value > 100)
  ) {
    context.addIssue({
      code: 'custom',
      path: [...path, 'value'],
      message: 'Oxygen saturation must be between 0 and 100 percent.',
    })
  }
  if (
    measurement.kind === 'step-count' &&
    !Number.isInteger(measurement.value)
  ) {
    context.addIssue({
      code: 'custom',
      path: [...path, 'value'],
      message: 'Step count must be an integer.',
    })
  }
}

const normalizedProviderRecordShape = {
  source: sourceSchema,
  measurements: z.array(measurementSchema).nonempty(),
} as const

const refineMeasurements = (
  value: {
    readonly measurements: ReadonlyArray<z.infer<typeof measurementSchema>>
  },
  context: z.core.$RefinementCtx,
) => {
  for (const [index, measurement] of value.measurements.entries()) {
    refineMeasurement(measurement, ['measurements', index], context)
  }
}

const normalizedProviderRecordSchema = z
  .strictObject(normalizedProviderRecordShape)
  .superRefine(refineMeasurements)

const connectedHealthMeasurementBundleInputSchema = z
  .strictObject({
    ...normalizedProviderRecordShape,
    subject: z.string().refine((value) => parsePatientReference(value).ok, {
      message:
        'Expected Patient/{id} or an absolute HTTP(S) URL ending in /Patient/{id}.',
    }),
    application: applicationDeviceSchema,
    gatewayApplication: gatewayApplicationSchema.optional(),
    eventSequence: z
      .number()
      .refine((value) => parsePositiveInteger(value).ok, {
        message: 'Expected a positive safe integer greater than zero.',
      }),
    issued: primitiveInstantSchema,
    recorded: primitiveInstantSchema,
    repositoryIds: z
      .strictObject({
        bundle: fhirIdSchema.optional(),
        observations: z
          .partialRecord(
            z.enum(
              Object.keys(sharedMobileMeasurementCatalog) as [
                MobileMeasurement['kind'],
                ...Array<MobileMeasurement['kind']>,
              ],
            ),
            fhirIdSchema,
          )
          .optional(),
        provenance: fhirIdSchema.optional(),
      })
      .optional(),
    researchStudyReferences: z.array(z.string()).optional(),
  })
  .superRefine(refineMeasurements)

const applicationStrings = (
  input: z.infer<typeof applicationDeviceSchema> | undefined,
): readonly string[] =>
  input === undefined ?
    []
  : [
      input.identity.identifier.system,
      input.identity.identifier.value,
      input.identity.id ?? '',
      input.name,
      input.version ?? '',
      input.manufacturer ?? '',
    ]

const recordingDeviceStrings = (
  input: z.infer<typeof recordingDeviceSchema> | undefined,
): readonly string[] =>
  input === undefined ?
    []
  : [
      input.identity.identifier.system,
      input.identity.identifier.value,
      input.identity.id ?? '',
      input.name ?? '',
      input.manufacturer ?? '',
      input.modelNumber ?? '',
    ]

const stringLeaves = (value: unknown): readonly string[] => {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(stringLeaves)
  if (typeof value !== 'object' || value === null) return []
  return Object.values(value).flatMap(stringLeaves)
}

const normalizedEmittedCallerStrings = (
  input: z.infer<typeof normalizedProviderRecordSchema>,
): readonly string[] => [
  input.source.adapter.provider,
  input.source.sourceType,
  input.source.recordingMethod ?? '',
  ...stringLeaves(input.measurements),
  ...applicationStrings(input.source.dataOrigin),
  ...recordingDeviceStrings(input.source.recordingDevice),
]

const graphEmittedCallerStrings = (
  input: z.infer<typeof connectedHealthMeasurementBundleInputSchema>,
): readonly string[] => [
  ...normalizedEmittedCallerStrings(input),
  input.subject,
  input.issued,
  input.recorded,
  ...applicationStrings(input.application),
  ...applicationStrings(
    input.gatewayApplication?.kind === 'distinct-application' ?
      input.gatewayApplication.application
    : undefined,
  ),
  input.repositoryIds?.bundle ?? '',
  ...Object.values(input.repositoryIds?.observations ?? {}),
  input.repositoryIds?.provenance ?? '',
  ...(input.researchStudyReferences ?? []),
]

const identityLeakageIssues = (
  source: z.infer<typeof sourceSchema>,
  emitted: readonly string[],
): readonly Issue[] => {
  const privateInputs = [
    [source.sourceNativeId, ['source', 'sourceNativeId'], 'sourceNativeId'],
    [
      source.providerAccountIdentifier.value,
      ['source', 'providerAccountIdentifier', 'value'],
      'providerAccountIdentifier.value',
    ],
  ] as const
  return privateInputs.flatMap(([privateValue, path, label]) =>
    (
      emitted.some(
        (value) =>
          value !== '' &&
          containsReversibleIdentityRepresentation(value, privateValue),
      )
    ) ?
      [
        {
          severity: 'error' as const,
          code: 'invalid-identifier' as const,
          path,
          message: `${label} is an identity input only and must not appear in emitted FHIR metadata.`,
        },
      ]
    : [],
  )
}

export const normalizeZodIssue = (entry: z.core.$ZodIssue): Issue => ({
  severity: 'error',
  code: 'schema-invalid',
  path: entry.path.map((component) =>
    typeof component === 'symbol' ?
      (component.description ?? component.toString())
    : component,
  ),
  message: entry.message,
})

const connectedHealthSourceMapping = (
  provider: ConnectedProvider,
  sourceType: string,
): Readonly<Record<string, string>> | undefined => {
  const providerMappings = connectedHealthScalarMappings[provider] as Record<
    string,
    Readonly<Record<string, string>> | undefined
  >
  return providerMappings[sourceType]
}

interface RecordEffectiveRule {
  readonly kind: 'complete-civil-day-period'
  readonly measurementIds: readonly string[]
  readonly outputsShareEffective: true
}

const connectedHealthRecordEffectiveRule = (
  provider: ConnectedProvider,
  sourceType: string,
): RecordEffectiveRule | undefined => {
  const providers = connectedHealthRecordEffectiveRules as Readonly<
    Record<string, Readonly<Record<string, RecordEffectiveRule>> | undefined>
  >
  return providers[provider]?.[sourceType]
}

const CIVIL_DAY_BOUNDARY =
  /^(\d{4}-\d{2}-\d{2})T00:00:00\.000(?:Z|[+-]\d{2}:\d{2})$/u

const nextCivilDate = (value: string): string | undefined => {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value)
  if (parts === null) return undefined
  const year = Number(parts[1])
  const month = Number(parts[2])
  const day = Number(parts[3])
  const instant = new Date(0)
  instant.setUTCHours(0, 0, 0, 0)
  instant.setUTCFullYear(year, month - 1, day + 1)
  return `${String(instant.getUTCFullYear()).padStart(4, '0')}-${String(
    instant.getUTCMonth() + 1,
  ).padStart(2, '0')}-${String(instant.getUTCDate()).padStart(2, '0')}`
}

const isCompleteCivilDay = (start: string, end: string): boolean => {
  const startDate = CIVIL_DAY_BOUNDARY.exec(start)?.[1]
  const endDate = CIVIL_DAY_BOUNDARY.exec(end)?.[1]
  return (
    startDate !== undefined &&
    endDate !== undefined &&
    nextCivilDate(startDate) === endDate
  )
}

const recordEffectiveIssues = (input: {
  readonly source: z.infer<typeof sourceSchema>
  readonly measurements: ReadonlyArray<z.infer<typeof measurementSchema>>
}): readonly Issue[] => {
  const rule = connectedHealthRecordEffectiveRule(
    input.source.adapter.provider,
    input.source.sourceType,
  )
  if (rule === undefined) return []
  const first = input.measurements[0]?.effective
  if (first?.kind !== 'period' || !isCompleteCivilDay(first.start, first.end)) {
    return [
      {
        severity: 'error',
        code: 'value-mismatch',
        path: ['measurements', 0, 'effective'],
        message:
          'This source record requires the complete source civil day as a midnight-to-midnight Period.',
      },
    ]
  }
  return input.measurements.flatMap((measurement, index) =>
    (
      measurement.effective.kind !== 'period' ||
      measurement.effective.start !== first.start ||
      measurement.effective.end !== first.end
    ) ?
      [
        {
          severity: 'error' as const,
          code: 'value-mismatch' as const,
          path: ['measurements', index, 'effective'],
          message:
            'Every output from this source record must share the same complete civil-day Period.',
        },
      ]
    : [],
  )
}

export const connectedHealthOutputDiscriminator = (
  provider: ConnectedProvider,
  sourceType: string,
  kind: MobileMeasurement['kind'],
): string | undefined => {
  return connectedHealthSourceMapping(provider, sourceType)?.[kind]
}

const recordMappingIssues = (input: {
  readonly source: z.infer<typeof sourceSchema>
  readonly measurements: ReadonlyArray<z.infer<typeof measurementSchema>>
  readonly repositoryIds?:
    | {
        readonly observations?:
          | Readonly<Partial<Record<MobileMeasurement['kind'], string>>>
          | undefined
      }
    | undefined
}): readonly Issue[] => {
  const mapping = connectedHealthSourceMapping(
    input.source.adapter.provider,
    input.source.sourceType,
  )
  if (mapping === undefined) {
    return [
      {
        severity: 'error',
        code: 'unsupported-measurement',
        path: ['source', 'sourceType'],
        message: `${input.source.adapter.provider}/${input.source.sourceType} does not have a supported scalar mapping.`,
      },
    ]
  }

  const findings: Issue[] = []
  const kinds = input.measurements.map(({ kind }) => kind)
  for (const [index, kind] of kinds.entries()) {
    if (!Object.hasOwn(mapping, kind)) {
      findings.push({
        severity: 'error',
        code: 'unsupported-measurement',
        path: ['measurements', index, 'kind'],
        message: `${input.source.adapter.provider}/${input.source.sourceType} does not have a supported scalar mapping for ${kind}.`,
      })
    }
  }
  if (new Set(kinds).size !== kinds.length) {
    findings.push({
      severity: 'error',
      code: 'duplicate-identifier',
      path: ['measurements'],
      message:
        'A source record may emit each admitted measurement kind at most once.',
    })
  }
  for (const kind of Object.keys(input.repositoryIds?.observations ?? {})) {
    if (!kinds.includes(kind as MobileMeasurement['kind'])) {
      findings.push({
        severity: 'error',
        code: 'invalid-reference',
        path: ['repositoryIds', 'observations', kind],
        message:
          'A repository Observation id requires a matching emitted measurement.',
      })
    }
  }
  findings.push(...recordEffectiveIssues(input))
  return findings
}

const sortMeasurements = <
  Value extends {
    readonly source: z.infer<typeof sourceSchema>
    readonly measurements: ReadonlyArray<z.infer<typeof measurementSchema>>
  },
>(
  value: Value,
): Value => {
  const mapping = connectedHealthSourceMapping(
    value.source.adapter.provider,
    value.source.sourceType,
  )
  if (mapping === undefined) return value
  const order = new Map(
    Object.keys(mapping).map((kind, index) => [kind, index] as const),
  )
  return {
    ...value,
    measurements: [...value.measurements].sort(
      (left, right) =>
        (order.get(left.kind) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(right.kind) ?? Number.MAX_SAFE_INTEGER),
    ),
  }
}

/**
 * Parses the provider-neutral handoff produced by an external provider adapter.
 * Raw provider payload fields are rejected rather than retained or stripped.
 */
export const parseNormalizedProviderRecord = (
  input: unknown,
): Result<NormalizedProviderRecord> => {
  const result = normalizedProviderRecordSchema.safeParse(input)
  if (!result.success) {
    return issues(result.error.issues.map(normalizeZodIssue))
  }
  const leakageIssues = identityLeakageIssues(
    result.data.source,
    normalizedEmittedCallerStrings(result.data),
  )
  if (leakageIssues.length > 0) return issues(leakageIssues)
  const mappingIssues = recordMappingIssues(result.data)
  if (mappingIssues.length > 0) return issues(mappingIssues)
  return ok(
    deepFreeze(sortMeasurements(result.data)) as NormalizedProviderRecord,
  )
}

/** Strict runtime boundary for the complete deterministic graph input. */
export const parseConnectedHealthMeasurementBundleInput = (
  input: unknown,
): Result<ConnectedHealthMeasurementBundleInput> => {
  const result = connectedHealthMeasurementBundleInputSchema.safeParse(input)
  if (!result.success) {
    return issues(result.error.issues.map(normalizeZodIssue))
  }
  type GraphIdentityInput = readonly [
    Parameters<typeof parseResourceIdentityInput>[0],
    readonly string[],
  ]
  const graphIdentityInputs: GraphIdentityInput[] = [
    [result.data.application.identity, ['application', 'identity']],
    [
      result.data.source.dataOrigin.identity,
      ['source', 'dataOrigin', 'identity'],
    ],
  ]
  if (result.data.source.recordingDevice !== undefined) {
    graphIdentityInputs.push([
      result.data.source.recordingDevice.identity,
      ['source', 'recordingDevice', 'identity'],
    ])
  }
  if (result.data.gatewayApplication?.kind === 'distinct-application') {
    graphIdentityInputs.push([
      result.data.gatewayApplication.application.identity,
      ['gatewayApplication', 'application', 'identity'],
    ])
  }
  const graphIdentityIssues = graphIdentityInputs.flatMap(
    ([identity, path]) => {
      const parsedIdentity = parseResourceIdentityInput(identity)
      return parsedIdentity.ok ?
          []
        : parsedIdentity.issues.map((entry) => ({
            ...entry,
            path: [...path, ...entry.path],
          }))
    },
  )
  if (graphIdentityIssues.length > 0) return issues(graphIdentityIssues)
  const researchStudyIssues: Issue[] = []
  for (const [index, reference] of (
    result.data.researchStudyReferences ?? []
  ).entries()) {
    if (!parseResearchStudyReference(reference).ok) {
      researchStudyIssues.push({
        severity: 'error',
        code: 'invalid-reference',
        path: ['researchStudyReferences', index],
        message:
          'Expected ResearchStudy/{id} or an absolute HTTP(S) URL ending in /ResearchStudy/{id} without a query or fragment.',
      })
    }
  }
  if (
    result.data.researchStudyReferences !== undefined &&
    new Set(result.data.researchStudyReferences).size !==
      result.data.researchStudyReferences.length
  ) {
    researchStudyIssues.push({
      severity: 'error',
      code: 'duplicate-identifier',
      path: ['researchStudyReferences'],
      message: 'ResearchStudy references must be unique.',
    })
  }
  if (researchStudyIssues.length > 0) return issues(researchStudyIssues)
  const leakageIssues = identityLeakageIssues(
    result.data.source,
    graphEmittedCallerStrings(result.data),
  )
  if (leakageIssues.length > 0) return issues(leakageIssues)
  const mappingIssues = recordMappingIssues(result.data)
  if (mappingIssues.length > 0) return issues(mappingIssues)
  const outputDiscriminators = result.data.measurements.map(({ kind }) =>
    connectedHealthOutputDiscriminator(
      result.data.source.adapter.provider,
      result.data.source.sourceType,
      kind,
    ),
  )
  if (outputDiscriminators.some((value) => value === undefined)) {
    return issues([
      {
        severity: 'error',
        code: 'unsupported-measurement',
        path: ['measurements'],
        message:
          'Every emitted measurement requires a catalog-owned Connected Health output discriminator.',
      },
    ])
  }
  const providerAccountSystem = parseAbsoluteUri(
    result.data.source.providerAccountIdentifier.system,
  )
  const eventSequence = parsePositiveInteger(result.data.eventSequence)
  if (!providerAccountSystem.ok) return providerAccountSystem
  if (!eventSequence.ok) return eventSequence
  const identity = deriveConnectedHealthIdentities({
    provider: result.data.source.adapter.provider,
    providerAccountIdentifier: {
      system: providerAccountSystem.value,
      value: result.data.source.providerAccountIdentifier.value,
    },
    sourceType: result.data.source.sourceType,
    sourceNativeId: result.data.source.sourceNativeId,
    outputDiscriminators: outputDiscriminators as [string, ...string[]],
    eventSequence: eventSequence.value,
  })
  if (!identity.ok) return identity
  return ok(
    deepFreeze(
      sortMeasurements(result.data),
    ) as ConnectedHealthMeasurementBundleInput,
  )
}
