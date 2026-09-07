//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'
import {
  deriveProviderIdentities,
  type ProviderIdentities,
} from './identity.js'
import {
  connectedProviderExclusiveDefinitions,
  sharedMeasurementDefinition,
  violatesQuantityDomain,
  type MeasurementDefinition,
} from './measurement-definition.js'
import {
  absoluteUriSchema,
  applicationDeviceSchema,
  deploymentIdentitySchema,
  fhirIdSchema,
  gatewayApplicationSchema,
  governedSourceIdentifierIssues,
  governedSourceIdentifierSchema,
  identifierInputSchema,
  mobileEffectiveInstantSchema,
  nonBlankStringSchema,
  primitiveInstantSchema,
  providerPatientReferenceSchema,
  providerScopeIdentifierIssues,
  providerScopeIdentifierSchema,
  providerResearchStudyReferenceSchema,
  recordingDeviceSchema,
} from './provider-input-schemas.js'
import type {
  ProviderMeasurementBundleInput,
  ConnectedProviderMeasurementKind,
  ConnectedProvider,
  NormalizedProviderRecord,
} from './types.js'
import {
  sharedMobileMeasurementCatalog,
  type SharedMobileMeasurementKind,
} from '../contract/measurement-catalog.generated.js'
import {
  providerRecordEffectiveRules,
  providerScalarOutputDiscriminators,
  providerScalarOutputRoles,
} from '../contract/providers.generated.js'
import {
  cloneJsonValue,
  compareFhirInstants,
  deepFreeze,
  issues,
  mapResult,
  ok,
  zodIssueToIssue,
  type Issue,
  type Result,
} from '../core/index.js'
import type {
  MeasurementKindsWhere,
  MobileMeasurement,
} from '../mobile/types.js'

type ParsedProviderMeasurement =
  | MobileMeasurement
  | {
      readonly kind: string
      readonly value: number | string
      readonly effective:
        | { readonly kind: 'date-time'; readonly value: string }
        | {
            readonly kind: 'period'
            readonly start: string
            readonly end: string
          }
    }

export {
  applicationDeviceSchema,
  deploymentIdentitySchema,
  fhirIdSchema,
  governedSourceIdentifierIssues,
  governedSourceIdentifierSchema,
  identifierInputSchema,
  nonBlankStringSchema,
  primitiveInstantSchema,
  providerPatientReferenceSchema,
  providerScopeIdentifierIssues,
  providerScopeIdentifierSchema,
} from './provider-input-schemas.js'

const sourceBase = {
  recordingMethod: z
    .enum(['actively-recorded', 'automatically-recorded', 'manual-entry'])
    .optional(),
  recordingDevice: recordingDeviceSchema.optional(),
  writerRecord: z
    .strictObject({
      applicationIdentifier: identifierInputSchema,
      nativeRecordId: nonBlankStringSchema,
      version: z
        .string()
        .regex(/^(?:0|[1-9]\d*)$/u)
        .optional(),
    })
    .optional(),
} as const

const sourceSchema = z.strictObject({
  ...sourceBase,
  adapter: z.strictObject({
    kind: z.literal('providers'),
    provider: z.enum(
      Object.keys(providerScalarOutputRoles) as [
        ConnectedProvider,
        ...ConnectedProvider[],
      ],
    ),
  }),
  providerScopeIdentifier: providerScopeIdentifierSchema,
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
      return ordering.ok && ordering.value !== 1
    },
    { message: 'A measurement Period must not end before it starts.' },
  )

// The value arguments decide the kinds, so a swapped pair cannot compile into a lie.
const measurementKindsWhere = <
  ValueKind extends 'codeableConcept' | 'quantity',
  Effective extends 'Period' | 'dateTime' | 'dateTime-or-Period',
  Excluded extends SharedMobileMeasurementKind = never,
>(
  valueKind: ValueKind,
  effective: Effective,
  excluded?: Excluded,
): [
  Exclude<MeasurementKindsWhere<ValueKind, Effective>, Excluded>,
  ...Array<Exclude<MeasurementKindsWhere<ValueKind, Effective>, Excluded>>,
] => {
  const excludedKind: string | undefined = excluded
  return (
    Object.keys(sharedMobileMeasurementCatalog) as SharedMobileMeasurementKind[]
  ).filter((kind) => {
    const definition = sharedMobileMeasurementCatalog[kind]
    return (
      definition.valueKind === valueKind &&
      definition.effective === effective &&
      kind !== excludedKind
    )
  }) as [
    Exclude<MeasurementKindsWhere<ValueKind, Effective>, Excluded>,
    ...Array<Exclude<MeasurementKindsWhere<ValueKind, Effective>, Excluded>>,
  ]
}

const instantQuantityMeasurementSchema = z.strictObject({
  kind: z.enum(measurementKindsWhere('quantity', 'dateTime')),
  value: z.number(),
  effective: instantEffectiveSchema,
})

const periodQuantityMeasurementSchema = z.strictObject({
  kind: z.enum(measurementKindsWhere('quantity', 'Period')),
  value: z.number(),
  effective: periodEffectiveSchema,
})

const choiceQuantityMeasurementKinds = measurementKindsWhere(
  'quantity',
  'dateTime-or-Period',
)
const choiceQuantityMeasurementKindSet: ReadonlySet<string> = new Set(
  choiceQuantityMeasurementKinds,
)
const choiceQuantityMeasurementSchema = z.strictObject({
  kind: z.custom<(typeof choiceQuantityMeasurementKinds)[number]>(
    (value) =>
      typeof value === 'string' && choiceQuantityMeasurementKindSet.has(value),
    { message: 'Expected a catalog measurement with choice effective[x].' },
  ),
  value: z.number(),
  effective: z.union([instantEffectiveSchema, periodEffectiveSchema]),
})

const instantCodedMeasurementSchema = z.strictObject({
  kind: z.enum(measurementKindsWhere('codeableConcept', 'dateTime')),
  value: nonBlankStringSchema,
  effective: instantEffectiveSchema,
})

const periodCodedMeasurementSchema = z.strictObject({
  kind: z.enum(
    measurementKindsWhere('codeableConcept', 'Period', 'sleep-stage'),
  ),
  value: nonBlankStringSchema,
  effective: periodEffectiveSchema,
})

const bloodPressureMeasurementSchema = z.strictObject({
  kind: z.literal('blood-pressure'),
  systolic: z.number(),
  diastolic: z.number(),
  effective: instantEffectiveSchema,
})

const sleepStageMeasurementSchema = z.strictObject({
  kind: z.literal('sleep-stage'),
  stage: z.enum(sharedMobileMeasurementCatalog['sleep-stage'].allowedValues),
  sourceStageCoding: z
    .strictObject({
      system: absoluteUriSchema,
      code: nonBlankStringSchema,
      display: nonBlankStringSchema.optional(),
    })
    .optional(),
  effective: periodEffectiveSchema,
})

const exclusiveDefinitions = connectedProviderExclusiveDefinitions
const exclusiveQuantityKinds = Object.values(exclusiveDefinitions)
  .filter(({ valueKind }) => valueKind === 'quantity')
  .map(({ id }) => id) as [string, ...string[]]
const exclusiveCodedKinds = Object.values(exclusiveDefinitions)
  .filter(({ valueKind }) => valueKind === 'codeableConcept')
  .map(({ id }) => id) as [string, ...string[]]

const exclusiveQuantityMeasurementSchema = z.strictObject({
  kind: z.enum(exclusiveQuantityKinds),
  value: z.number(),
  effective: z.union([instantEffectiveSchema, periodEffectiveSchema]),
})

const exclusiveCodedMeasurementSchema = z.strictObject({
  kind: z.enum(exclusiveCodedKinds),
  value: nonBlankStringSchema,
  effective: z.union([instantEffectiveSchema, periodEffectiveSchema]),
})

const measurementSchema: z.ZodType<ParsedProviderMeasurement> = z.union([
  instantQuantityMeasurementSchema,
  periodQuantityMeasurementSchema,
  choiceQuantityMeasurementSchema,
  instantCodedMeasurementSchema,
  periodCodedMeasurementSchema,
  bloodPressureMeasurementSchema,
  sleepStageMeasurementSchema,
  exclusiveQuantityMeasurementSchema,
  exclusiveCodedMeasurementSchema,
])

const effectiveKindMatches = (
  definition: MeasurementDefinition,
  effectiveKind: 'date-time' | 'period',
): boolean =>
  definition.effective === 'dateTime-or-Period' ||
  (definition.effective === 'dateTime' && effectiveKind === 'date-time') ||
  (definition.effective === 'Period' && effectiveKind === 'period')

const violatesRequiredPeriodOrdering = (
  measurement: z.infer<typeof measurementSchema>,
  definition: MeasurementDefinition,
): boolean => {
  if (
    measurement.effective.kind !== 'period' ||
    !(definition.obeys ?? []).includes('grove-step-count-period-1')
  ) {
    return false
  }
  const ordering = compareFhirInstants(
    measurement.effective.start,
    measurement.effective.end,
  )
  return !ordering.ok || ordering.value !== -1
}

const refineMeasurement = (
  measurement: z.infer<typeof measurementSchema>,
  path: ReadonlyArray<number | string>,
  context: z.core.$RefinementCtx,
) => {
  const measurementDefinition =
    sharedMeasurementDefinition(measurement.kind) ??
    exclusiveDefinitions[measurement.kind]
  if (measurementDefinition === undefined) {
    context.addIssue({
      code: 'custom',
      path: [...path, 'kind'],
      message: `No closed Provider measurement definition exists for ${measurement.kind}.`,
    })
    return
  }
  if (
    !effectiveKindMatches(measurementDefinition, measurement.effective.kind)
  ) {
    context.addIssue({
      code: 'custom',
      path: [...path, 'effective'],
      message: `${measurement.kind} requires catalog effective[x] ${measurementDefinition.effective}.`,
    })
  }
  if (violatesRequiredPeriodOrdering(measurement, measurementDefinition)) {
    context.addIssue({
      code: 'custom',
      path: [...path, 'effective'],
      message: `The ${measurement.kind} Period must satisfy its catalog-owned nonzero-duration rule.`,
    })
  }
  const allowedValues: readonly string[] | undefined =
    measurementDefinition.allowedValues
  if (
    'value' in measurement &&
    typeof measurement.value === 'string' &&
    allowedValues?.includes(measurement.value) !== true
  ) {
    context.addIssue({
      code: 'custom',
      path: [...path, 'value'],
      message: `Expected a catalog-allowed coded result for ${measurement.kind}.`,
    })
  }
  if (
    'value' in measurement &&
    typeof measurement.value === 'number' &&
    violatesQuantityDomain(measurement.value, measurementDefinition)
  ) {
    context.addIssue({
      code: 'custom',
      path: [...path, 'value'],
      message: `The ${measurement.kind} value is outside its catalog-owned value domain.`,
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

const scalarOutputRoles = providerScalarOutputRoles as Readonly<
  Record<string, Readonly<Record<string, Readonly<Record<string, string>>>>>
>

const connectedProviderMeasurementKinds = [
  ...new Set(
    Object.values(scalarOutputRoles).flatMap((sources) =>
      Object.values(sources).flatMap((mapping) => Object.keys(mapping)),
    ),
  ),
] as [ConnectedProviderMeasurementKind, ...ConnectedProviderMeasurementKind[]]

const providerMeasurementBundleInputSchema = z
  .strictObject({
    ...normalizedProviderRecordShape,
    subject: providerPatientReferenceSchema,
    application: applicationDeviceSchema,
    gatewayApplication: gatewayApplicationSchema.optional(),
    eventSequence: z.string().regex(/^[1-9]\d*$/u),
    deploymentIdentity: deploymentIdentitySchema,
    nativeIdentifierDisclosure: governedSourceIdentifierSchema.optional(),
    occurred: primitiveInstantSchema,
    recorded: primitiveInstantSchema,
    assembled: primitiveInstantSchema,
    repositoryIds: z
      .strictObject({
        bundle: fhirIdSchema.optional(),
        observations: z
          .partialRecord(
            z.enum(connectedProviderMeasurementKinds),
            fhirIdSchema,
          )
          .optional(),
        provenance: fhirIdSchema.optional(),
      })
      .optional(),
    researchStudyReferences: z
      .array(providerResearchStudyReferenceSchema)
      .optional(),
  })
  .superRefine(refineMeasurements)

const providerSourceMapping = (
  provider: ConnectedProvider,
  sourceType: string,
): Readonly<Record<string, string>> | undefined => {
  const providerMappings = providerScalarOutputRoles[provider] as Record<
    string,
    Readonly<Record<string, string>> | undefined
  >
  return providerMappings[sourceType]
}

const providerSourceDiscriminatorMapping = (
  provider: ConnectedProvider,
  sourceType: string,
): Readonly<Record<string, string>> | undefined => {
  const providerMappings = providerScalarOutputDiscriminators[
    provider
  ] as Record<string, Readonly<Record<string, string>> | undefined>
  return providerMappings[sourceType]
}

export interface ProviderOutputCoordinates {
  readonly outputRole: string
  readonly outputDiscriminator: string
}

interface RecordEffectiveRule {
  readonly kind: 'complete-civil-day-period'
  readonly measurementIds: readonly string[]
  readonly outputsShareEffective: true
}

const providerRecordEffectiveRule = (
  provider: ConnectedProvider,
  sourceType: string,
): RecordEffectiveRule | undefined => {
  const providers = providerRecordEffectiveRules as Readonly<
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
  const rule = providerRecordEffectiveRule(
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

export const providerOutputRole = (
  provider: ConnectedProvider,
  sourceType: string,
  kind: string,
): string | undefined => {
  return providerSourceMapping(provider, sourceType)?.[kind]
}

/** Exact catalog-owned HMAC coordinates for one Provider Observation output. */
export const providerOutputCoordinates = (
  provider: ConnectedProvider,
  sourceType: string,
  kind: string,
): ProviderOutputCoordinates | undefined => {
  const outputRole = providerSourceMapping(provider, sourceType)?.[kind]
  const outputDiscriminator = providerSourceDiscriminatorMapping(
    provider,
    sourceType,
  )?.[kind]
  return outputRole === undefined || outputDiscriminator === undefined ?
      undefined
    : { outputRole, outputDiscriminator }
}

const recordMappingIssues = (input: {
  readonly source: z.infer<typeof sourceSchema>
  readonly measurements: ReadonlyArray<z.infer<typeof measurementSchema>>
  readonly repositoryIds?:
    | {
        readonly observations?:
          | Readonly<Partial<Record<ConnectedProviderMeasurementKind, string>>>
          | undefined
      }
    | undefined
}): readonly Issue[] => {
  const mapping = providerSourceMapping(
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
  findings.push(
    ...providerScopeIdentifierIssues(
      input.source.adapter.provider,
      input.source.providerScopeIdentifier,
    ),
  )
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
    if (!kinds.includes(kind)) {
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
  const mapping = providerSourceMapping(
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
  const snapshot = cloneJsonValue(input)
  if (!snapshot.ok) return snapshot
  const result = normalizedProviderRecordSchema.safeParse(snapshot.value)
  if (!result.success) return issues(result.error.issues.map(zodIssueToIssue))
  const mappingIssues = recordMappingIssues(result.data)
  if (mappingIssues.length > 0) return issues(mappingIssues)
  return ok(
    deepFreeze(sortMeasurements(result.data)) as NormalizedProviderRecord,
  )
}

/** The validated graph input together with the identities its derivation proved. */
export interface ParsedProviderMeasurementBundle {
  readonly input: ProviderMeasurementBundleInput
  readonly identities: ProviderIdentities
}

/** Strict runtime boundary that also derives the graph identities exactly once. */
export const parseProviderMeasurementBundle = (
  input: unknown,
): Result<ParsedProviderMeasurementBundle> => {
  const snapshot = cloneJsonValue(input)
  if (!snapshot.ok) return snapshot
  const result = providerMeasurementBundleInputSchema.safeParse(snapshot.value)
  if (!result.success) return issues(result.error.issues.map(zodIssueToIssue))
  const disclosureIssues = governedSourceIdentifierIssues(
    result.data.nativeIdentifierDisclosure,
    result.data.source.sourceNativeId,
    result.data.deploymentIdentity,
  )
  if (disclosureIssues.length > 0) return issues(disclosureIssues)
  const researchStudyIssues: Issue[] = []
  const researchStudyKeys = (result.data.researchStudyReferences ?? []).map(
    ({ identifier }) =>
      `${identifier.system.length}:${identifier.system}${identifier.value.length}:${identifier.value}`,
  )
  if (new Set(researchStudyKeys).size !== researchStudyKeys.length) {
    researchStudyIssues.push({
      severity: 'error',
      code: 'duplicate-identifier',
      path: ['researchStudyReferences'],
      message: 'ResearchStudy references must be unique.',
    })
  }
  if (researchStudyIssues.length > 0) return issues(researchStudyIssues)
  const mappingIssues = recordMappingIssues(result.data)
  if (mappingIssues.length > 0) return issues(mappingIssues)
  const sourceMapping = providerSourceMapping(
    result.data.source.adapter.provider,
    result.data.source.sourceType,
  )
  if (
    result.data.nativeIdentifierDisclosure !== undefined &&
    (sourceMapping === undefined ||
      Object.keys(sourceMapping).length !== 1 ||
      result.data.measurements.length !== 1)
  ) {
    return issues([
      {
        severity: 'error',
        code: 'value-mismatch',
        path: ['nativeIdentifierDisclosure'],
        message:
          'The Provider catalog must designate one unique one-to-one Observation before a governed source Identifier may be disclosed; ambiguous multi-output records must omit it.',
      },
    ])
  }
  const sorted = sortMeasurements(result.data)
  const outputCoordinates = sorted.measurements.map(({ kind }) =>
    providerOutputCoordinates(
      sorted.source.adapter.provider,
      sorted.source.sourceType,
      kind,
    ),
  )
  const definedOutputCoordinates = outputCoordinates.filter(
    (coordinates): coordinates is ProviderOutputCoordinates =>
      coordinates !== undefined,
  )
  if (definedOutputCoordinates.length !== outputCoordinates.length) {
    return issues([
      {
        severity: 'error',
        code: 'unsupported-measurement',
        path: ['measurements'],
        message:
          'Every emitted measurement requires a catalog-owned Provider output role.',
      },
    ])
  }
  const identities = deriveProviderIdentities({
    provider: sorted.source.adapter.provider,
    providerScopeIdentifier: sorted.source.providerScopeIdentifier,
    sourceType: sorted.source.sourceType,
    sourceNativeId: sorted.source.sourceNativeId,
    outputs: definedOutputCoordinates.map(
      ({ outputRole, outputDiscriminator }) => ({
        kind: 'provider-output' as const,
        outputRole,
        outputDiscriminator,
      }),
    ),
    eventSequence: sorted.eventSequence,
    deployment: sorted.deploymentIdentity,
  })
  if (!identities.ok) return identities
  return ok({
    input: deepFreeze(sorted) as ProviderMeasurementBundleInput,
    identities: identities.value,
  })
}

/** Strict runtime boundary for the complete deterministic graph input. */
export const parseProviderMeasurementBundleInput = (
  input: unknown,
): Result<ProviderMeasurementBundleInput> =>
  mapResult(parseProviderMeasurementBundle(input), ({ input: value }) => value)
