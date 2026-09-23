//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'
import {
  connectedProviderExclusiveDefinitions,
  sharedMeasurementDefinition,
  violatesQuantityDomain,
  type MeasurementDefinition,
} from './measurement-definition.js'
import {
  conversionOptionsSchema,
  effectiveTimeSchema,
  instantEffectiveSchema,
  nativeIdentifierText,
  nonBlankText,
  periodEffectiveSchema,
  recordingDeviceSchema,
  refusal,
  sourceAbsoluteUri,
  writerRecordSchema,
  writerSchema,
} from './provider-input-schemas.js'
import type {
  ConnectedProvider,
  NormalizedProviderRecord,
  ProviderConversionOptions,
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
  ok,
  zodIssuePath,
  zodIssueToIssue,
  type Issue,
  type Result,
} from '../core/index.js'
import type { OutputCoordinates } from '../mobile/identity.js'
import type { MobileMeasurement } from '../mobile/types.js'
import {
  groveRuleIssue,
  groveRuleIssueFromParameters,
  type ClientRecordRule,
} from '../r4/diagnostics.js'

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

const refuse = (
  code: ClientRecordRule,
  path: ReadonlyArray<string | number>,
  message: string,
): Issue => groveRuleIssue(code, path, { message })

// A zod failure inside a source record is a refusal: the registry code says why, the zod
// text is the detail. Refinements name their own code; the built-in failures map here.
const refusalCodeFor = (issue: z.core.$ZodIssue): ClientRecordRule => {
  if (issue.code === 'invalid_type' && issue.input === undefined) {
    return 'mobile-input.required-metadata-missing'
  }
  if (issue.code === 'invalid_value' || issue.code === 'invalid_union') {
    return 'mobile-input.unsupported-source-value'
  }
  return 'mobile-input.value-shape-invalid'
}

const refusalIssue = (issue: z.core.$ZodIssue): readonly Issue[] => {
  const path = zodIssuePath(issue)
  if (issue.code === 'unrecognized_keys') {
    return issue.keys.map((key) =>
      refuse('mobile-input.value-shape-invalid', [...path, key], issue.message),
    )
  }
  const registered = groveRuleIssueFromParameters(
    issue.code === 'custom' ? issue.params : undefined,
    path,
  )
  return [registered ?? refuse(refusalCodeFor(issue), path, issue.message)]
}

/** Every refusal of one source record, from its zod failures. */
export const refusalIssues = (error: z.ZodError): readonly Issue[] =>
  error.issues.flatMap(refusalIssue)

const valueAt = (
  value: unknown,
  path: ReadonlyArray<string | number>,
): unknown =>
  path.reduce<unknown>(
    (current, segment) =>
      typeof current === 'object' && current !== null ?
        (current as Record<string | number, unknown>)[segment]
      : undefined,
    value,
  )

// The JSON snapshot refuses what zod never sees; a non-finite number is still a value.
const snapshotRefusal = (input: unknown, issue: Issue): Issue => {
  const offending = valueAt(input, issue.path)
  return typeof offending === 'number' && !Number.isFinite(offending) ?
      refuse(
        'mobile-input.value-outside-domain',
        issue.path,
        'A source value must be a finite number.',
      )
    : refuse('mobile-input.value-shape-invalid', issue.path, issue.message)
}

const sourceSchema = z.strictObject({
  adapter: z.strictObject({
    kind: z.custom<'providers'>(
      (value) => value === 'providers',
      refusal(
        'mobile-input.value-shape-invalid',
        'A provider record names the providers adapter.',
      ),
    ),
    provider: z.enum(
      Object.keys(providerScalarOutputRoles) as [
        ConnectedProvider,
        ...ConnectedProvider[],
      ],
    ),
  }),
  sourceType: nonBlankText,
  sourceNativeId: nativeIdentifierText,
  writer: writerSchema,
  recordingMethod: z
    .enum(['actively-recorded', 'automatically-recorded', 'manual-entry'])
    .optional(),
  recordingDevice: recordingDeviceSchema.optional(),
  writerRecord: writerRecordSchema.optional(),
})

const sharedKindsWithValue = (
  valueKind: 'codeableConcept' | 'quantity',
  ...excluded: SharedMobileMeasurementKind[]
): [SharedMobileMeasurementKind, ...SharedMobileMeasurementKind[]] =>
  (
    Object.keys(sharedMobileMeasurementCatalog) as SharedMobileMeasurementKind[]
  ).filter(
    (kind) =>
      sharedMobileMeasurementCatalog[kind].valueKind === valueKind &&
      !excluded.includes(kind),
  ) as [SharedMobileMeasurementKind, ...SharedMobileMeasurementKind[]]

// The catalog's effective[x] rule is enforced by refinement so that a mismatch is reported
// as the effective-period refusal rather than as a shape the union could not place.
const quantityMeasurementSchema = z.strictObject({
  kind: z.enum(sharedKindsWithValue('quantity')),
  value: z.number(),
  effective: effectiveTimeSchema,
})

const codedMeasurementSchema = z.strictObject({
  kind: z.enum(sharedKindsWithValue('codeableConcept', 'sleep-stage')),
  value: nonBlankText,
  effective: effectiveTimeSchema,
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
      system: sourceAbsoluteUri,
      code: nonBlankText,
      display: nonBlankText.optional(),
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
  effective: effectiveTimeSchema,
})

const exclusiveCodedMeasurementSchema = z.strictObject({
  kind: z.enum(exclusiveCodedKinds),
  value: nonBlankText,
  effective: effectiveTimeSchema,
})

const measurementSchema: z.ZodType<ParsedProviderMeasurement> =
  z.discriminatedUnion('kind', [
    quantityMeasurementSchema,
    codedMeasurementSchema,
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

const addRefusal = (
  context: z.core.$RefinementCtx,
  code: ClientRecordRule,
  path: ReadonlyArray<number | string>,
  message: string,
): void => {
  context.addIssue({
    code: 'custom',
    path: [...path],
    ...refusal(code, message),
  })
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
    addRefusal(
      context,
      'mobile-input.unsupported-source-value',
      [...path, 'kind'],
      `No closed Provider measurement definition exists for ${measurement.kind}.`,
    )
    return
  }
  if (
    !effectiveKindMatches(measurementDefinition, measurement.effective.kind)
  ) {
    addRefusal(
      context,
      'mobile-input.effective-period-invalid',
      [...path, 'effective'],
      `${measurement.kind} requires catalog effective[x] ${measurementDefinition.effective}.`,
    )
  }
  if (violatesRequiredPeriodOrdering(measurement, measurementDefinition)) {
    addRefusal(
      context,
      'mobile-input.effective-period-invalid',
      [...path, 'effective'],
      `The ${measurement.kind} Period must satisfy its catalog-owned nonzero-duration rule.`,
    )
  }
  const allowedValues: readonly string[] | undefined =
    measurementDefinition.allowedValues
  if (
    'value' in measurement &&
    typeof measurement.value === 'string' &&
    allowedValues?.includes(measurement.value) !== true
  ) {
    addRefusal(
      context,
      'mobile-input.unsupported-source-value',
      [...path, 'value'],
      `Expected a catalog-allowed coded result for ${measurement.kind}.`,
    )
  }
  if (
    'value' in measurement &&
    typeof measurement.value === 'number' &&
    violatesQuantityDomain(measurement.value, measurementDefinition)
  ) {
    addRefusal(
      context,
      'mobile-input.value-outside-domain',
      [...path, 'value'],
      `The ${measurement.kind} value is outside its catalog-owned value domain.`,
    )
  }
}

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
  .strictObject({
    source: sourceSchema,
    measurements: z.array(measurementSchema).nonempty(),
  })
  .superRefine(refineMeasurements)

type ParsedRecord = z.infer<typeof normalizedProviderRecordSchema>

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

const recordEffectiveIssues = (record: ParsedRecord): readonly Issue[] => {
  const rule = providerRecordEffectiveRule(
    record.source.adapter.provider,
    record.source.sourceType,
  )
  if (rule === undefined) return []
  const first = record.measurements[0]?.effective
  if (first?.kind !== 'period' || !isCompleteCivilDay(first.start, first.end)) {
    return [
      refuse(
        'mobile-input.effective-period-invalid',
        ['measurements', 0, 'effective'],
        'This source record requires the complete source civil day as a midnight-to-midnight Period.',
      ),
    ]
  }
  return record.measurements.flatMap((measurement, index) =>
    (
      measurement.effective.kind !== 'period' ||
      measurement.effective.start !== first.start ||
      measurement.effective.end !== first.end
    ) ?
      [
        refuse(
          'mobile-input.effective-period-invalid',
          ['measurements', index, 'effective'],
          'Every output from this source record must share the same complete civil-day Period.',
        ),
      ]
    : [],
  )
}

export const providerOutputRole = (
  provider: ConnectedProvider,
  sourceType: string,
  kind: string,
): string | undefined => providerSourceMapping(provider, sourceType)?.[kind]

/** The measurement kinds one catalog source row admits, in catalog order. */
export const providerSourceKinds = (
  provider: ConnectedProvider,
  sourceType: string,
): readonly string[] =>
  Object.keys(providerSourceMapping(provider, sourceType) ?? {})

/** Exact catalog-owned HMAC coordinates for one Provider Observation output. */
export const providerOutputCoordinates = (
  provider: ConnectedProvider,
  sourceType: string,
  kind: string,
): OutputCoordinates | undefined => {
  const role = providerSourceMapping(provider, sourceType)?.[kind]
  const discriminator = providerSourceDiscriminatorMapping(
    provider,
    sourceType,
  )?.[kind]
  return role === undefined || discriminator === undefined ?
      undefined
    : { role, discriminator }
}

const recordMappingIssues = (record: ParsedRecord): readonly Issue[] => {
  const mapping = providerSourceMapping(
    record.source.adapter.provider,
    record.source.sourceType,
  )
  if (mapping === undefined) {
    return [
      refuse(
        'mobile-input.unsupported-source-type',
        ['source', 'sourceType'],
        `${record.source.adapter.provider}/${record.source.sourceType} does not have a supported scalar mapping.`,
      ),
    ]
  }
  const findings: Issue[] = []
  const kinds = record.measurements.map(({ kind }) => kind)
  for (const [index, kind] of kinds.entries()) {
    if (!Object.hasOwn(mapping, kind)) {
      findings.push(
        refuse(
          'mobile-input.unsupported-source-value',
          ['measurements', index, 'kind'],
          `${record.source.adapter.provider}/${record.source.sourceType} does not have a supported scalar mapping for ${kind}.`,
        ),
      )
    }
  }
  if (new Set(kinds).size !== kinds.length) {
    findings.push(
      refuse(
        'mobile-input.value-shape-invalid',
        ['measurements'],
        'A source record may emit each admitted measurement kind at most once.',
      ),
    )
  }
  // A refused kind has no admitted effective time to hold to the record rule.
  return findings.length > 0 ? findings : recordEffectiveIssues(record)
}

const sortMeasurements = (record: ParsedRecord): ParsedRecord => {
  const mapping = providerSourceMapping(
    record.source.adapter.provider,
    record.source.sourceType,
  )
  if (mapping === undefined) return record
  const order = new Map(
    Object.keys(mapping).map((kind, index) => [kind, index] as const),
  )
  return {
    ...record,
    measurements: [...record.measurements].sort(
      (left, right) =>
        (order.get(left.kind) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(right.kind) ?? Number.MAX_SAFE_INTEGER),
    ),
  }
}

/**
 * Parses the provider-neutral handoff produced by an external provider adapter.
 * Raw provider payload fields are refused rather than retained or stripped, and every
 * refusal carries one `mobile-input.*` registry code.
 */
export const parseNormalizedProviderRecord = (
  input: unknown,
): Result<NormalizedProviderRecord> => {
  const snapshot = cloneJsonValue(input)
  if (!snapshot.ok) {
    return issues(snapshot.issues.map((issue) => snapshotRefusal(input, issue)))
  }
  const result = normalizedProviderRecordSchema.safeParse(snapshot.value, {
    reportInput: true,
  })
  if (!result.success) return issues(refusalIssues(result.error))
  const mappingIssues = recordMappingIssues(result.data)
  if (mappingIssues.length > 0) return issues(mappingIssues)
  return ok(
    deepFreeze(sortMeasurements(result.data)) as NormalizedProviderRecord,
  )
}

/** Strict boundary for the deployment policy of one conversion; faults, not refusals. */
export const parseProviderConversionOptions = (
  input: unknown,
): Result<ProviderConversionOptions> => {
  const snapshot = cloneJsonValue(input)
  if (!snapshot.ok) return snapshot
  const result = conversionOptionsSchema.safeParse(snapshot.value)
  if (!result.success) return issues(result.error.issues.map(zodIssueToIssue))
  return ok(deepFreeze(result.data))
}
