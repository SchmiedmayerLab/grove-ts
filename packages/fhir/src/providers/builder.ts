//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  contextFault,
  makeConversionProvenance,
  occurredFor,
  resolveContextGraph,
  type ContextGraph,
} from './context-graph.js'
import {
  coding,
  concept,
  deduplicateIdentifiedEntries,
  governedSourceIdentifier,
  identifiedEntry,
  identifier,
  makeRecordingDevice,
  resourceId,
} from './graph.js'
import {
  deriveProviderIdentities,
  deriveRecordingDeviceEntryIdentity,
  deriveWriterRecordIdentifier,
  type ProviderIdentities,
  type RecordingDeviceGraphIdentity,
} from './identity.js'
import {
  providerMeasurementDefinition,
  providerMeasurementProfile,
  providerObservationProfile,
  type MeasurementDefinition,
} from './measurement-definition.js'
import { EXTENSIONS, PROFILES, SYSTEMS } from './profiles.js'
import { governedSourceIdentifierIssues } from './provider-input-schemas.js'
import {
  parseNormalizedProviderRecord,
  parseProviderConversionOptions,
  providerOutputCoordinates,
  providerSourceKinds,
  type ProviderOutputCoordinates,
} from './provider.js'
import type {
  NormalizedProviderRecord,
  ProviderConversion,
  ProviderConversionFailure,
  ProviderConversionOptions,
} from './types.js'
import { providerAdapterCatalog } from '../contract/providers.generated.js'
import { collectResults, issues, ok, type Result } from '../core/index.js'
import {
  createEntryIdentity,
  type EntryIdentity,
  type RoledIdentifier,
} from '../mobile/identity.js'
import type {
  ConversionBatch,
  ExchangeEventContext,
  ExchangeGraphIdentifiers,
  GovernedSourceIdentifierDisclosurePolicy,
} from '../mobile/types.js'
import {
  parseExchangeGraph,
  type CodeableConcept,
  type ExchangeGraph,
  type Observation,
} from '../r4/index.js'

type ConnectedMeasurement = NormalizedProviderRecord['measurements'][number]

const quantity = (
  value: number,
  definition: {
    readonly system: string
    readonly code: string
    readonly unit?: string
  },
) => ({
  value,
  unit: definition.unit ?? definition.code,
  system: definition.system,
  code: definition.code,
})

interface ResolvedGraphIdentities {
  readonly connected: ProviderIdentities
  readonly observations: readonly [EntryIdentity, ...EntryIdentity[]]
  readonly provenance: EntryIdentity
  readonly recordingDevice?: RecordingDeviceGraphIdentity
  readonly writerRecord?: RoledIdentifier
}

type ProviderGraphEntry = ExchangeGraph['entry'][number]

// A validated record names catalog rows the generator proved exist; a miss is a defect.
const definitionFor = (
  record: NormalizedProviderRecord,
  kind: ConnectedMeasurement['kind'],
): MeasurementDefinition => {
  const definition = providerMeasurementDefinition(
    record.source.adapter.provider,
    kind,
  )
  if (definition === undefined) {
    throw new Error(
      `Validated Provider record has no definition for ${record.source.adapter.provider}/${kind}.`,
    )
  }
  return definition
}

const categoryFor = (definition: MeasurementDefinition) =>
  definition.category === undefined ?
    undefined
  : [
      concept(
        definition.category.system,
        definition.category.code,
        definition.category.display,
      ),
    ]

const profileFor = (
  record: NormalizedProviderRecord,
  kind: ConnectedMeasurement['kind'],
): readonly string[] => {
  const semanticProfile = providerMeasurementProfile(
    record.source.adapter.provider,
    kind,
  )
  const adapterProfile = providerObservationProfile(
    record.source.adapter.provider,
  )
  if (semanticProfile === undefined || adapterProfile === undefined) {
    throw new Error(
      `Validated Provider record has no profile for ${record.source.adapter.provider}/${kind}.`,
    )
  }
  return [semanticProfile, adapterProfile]
}

// A measurement with a methodChoice states its aggregation per adapter source element,
// because the same shared meaning is a daily mean for one provider and a session
// statistic for another.
const declaredAggregationMethods = new Map<string, string>()
for (const provider of providerAdapterCatalog.providers) {
  for (const sourceType of provider.sourceTypes) {
    for (const element of sourceType.elements) {
      if (!('aggregationMethod' in element)) {
        continue
      }
      for (const [kind, method] of Object.entries(element.aggregationMethod)) {
        declaredAggregationMethods.set(
          `${provider.id}|${sourceType.token}|${kind}`,
          method,
        )
      }
    }
  }
}

/** The aggregation a measurement carries, or `undefined` when the catalog declares none. */
const aggregationMethodFor = (
  record: NormalizedProviderRecord,
  kind: ConnectedMeasurement['kind'],
): CodeableConcept | undefined => {
  const definition = definitionFor(record, kind)
  if (definition.method !== undefined) {
    return concept(
      SYSTEMS.groveAggregationMethod,
      definition.method.code,
      definition.method.display,
    )
  }
  if (definition.methodChoice === undefined) {
    return undefined
  }
  const declared = declaredAggregationMethods.get(
    `${record.source.adapter.provider}|${record.source.sourceType}|${kind}`,
  )
  return declared === undefined ? undefined : (
      concept(SYSTEMS.groveAggregationMethod, declared)
    )
}

// A measurement whose catalog entry admits more than one aggregation must have one declared
// for this exact provider and source type, otherwise the emitted Observation would omit the
// method its profile requires.
const missingAggregationMethod = (
  record: NormalizedProviderRecord,
  kind: ConnectedMeasurement['kind'],
): boolean =>
  definitionFor(record, kind).methodChoice !== undefined &&
  aggregationMethodFor(record, kind) === undefined

const effectiveFor = (measurement: ConnectedMeasurement) =>
  measurement.effective.kind === 'date-time' ?
    { effectiveDateTime: measurement.effective.value }
  : {
      effectivePeriod: {
        start: measurement.effective.start,
        end: measurement.effective.end,
      },
    }

const resultFor = (
  record: NormalizedProviderRecord,
  measurement: ConnectedMeasurement,
) => {
  if (measurement.kind === 'blood-pressure') {
    const definition = definitionFor(record, 'blood-pressure')
    const systolic = definition.components?.[0]
    const diastolic = definition.components?.[1]
    if (systolic?.quantity === undefined || diastolic?.quantity === undefined) {
      throw new Error(
        'The validated blood-pressure definition has no two-component result.',
      )
    }
    return {
      component: [
        {
          code: concept(systolic.system, systolic.code),
          valueQuantity: quantity(measurement.systolic, systolic.quantity),
        },
        {
          code: concept(diastolic.system, diastolic.code),
          valueQuantity: quantity(measurement.diastolic, diastolic.quantity),
        },
      ],
    }
  }

  const definition = definitionFor(record, measurement.kind)

  if (typeof measurement.value === 'string') {
    const { resultCodeSystem } = definition as {
      readonly resultCodeSystem: string
    }
    return {
      valueCodeableConcept: concept(resultCodeSystem, measurement.value),
    }
  }
  const { quantity: unit } = definition as {
    readonly quantity: {
      readonly system: string
      readonly code: string
      readonly unit?: string
    }
  }
  return {
    valueQuantity: quantity(measurement.value, unit),
  }
}

interface ObservationInput {
  readonly record: NormalizedProviderRecord
  readonly measurement: ConnectedMeasurement
  readonly identity: EntryIdentity
  readonly identities: ResolvedGraphIdentities
  readonly graph: ContextGraph
  readonly disclosure: GovernedSourceIdentifierDisclosurePolicy
}

const makeObservation = (input: ObservationInput): Observation => {
  const { record, measurement, identity, identities, graph } = input
  const definition = definitionFor(record, measurement.kind)
  const category = categoryFor(definition)
  const method = aggregationMethodFor(record, measurement.kind)
  return {
    resourceType: 'Observation' as const,
    ...resourceId(identity),
    meta: { profile: profileFor(record, measurement.kind) },
    extension: [
      {
        url: EXTENSIONS.provider,
        valueCode: record.source.adapter.provider,
      },
      {
        url: EXTENSIONS.providerSourceType,
        valueCode: `${record.source.adapter.provider}/${record.source.sourceType}`,
      },
      ...(graph.gatewayReference === undefined ?
        []
      : [
          {
            url: EXTENSIONS.gatewayDevice,
            valueReference: { reference: graph.gatewayReference },
          },
        ]),
      ...(record.source.recordingMethod === undefined ?
        []
      : [
          {
            url: EXTENSIONS.recordingMethod,
            valueCoding: coding(
              SYSTEMS.groveRecordingMethod,
              record.source.recordingMethod,
            ),
          },
        ]),
      ...graph.researchStudyExtensions,
      ...(record.source.writerRecord?.version === undefined ?
        []
      : [
          {
            url: EXTENSIONS.writerRecordVersion,
            valueString: record.source.writerRecord.version,
          },
        ]),
    ],
    identifier: [
      identifier(identities.connected.sourceRecord),
      identifier(identity.identifier),
      ...(identities.writerRecord === undefined ?
        []
      : [identifier(identities.writerRecord)]),
      ...(input.disclosure.kind === 'omit' ?
        []
      : [
          governedSourceIdentifier(
            input.disclosure,
            record.source.sourceNativeId,
          ),
        ]),
    ],
    status: 'final' as const,
    ...(category === undefined ? {} : { category }),
    code: {
      coding: [coding(definition.code.system, definition.code.code)],
    },
    subject: graph.subject,
    ...effectiveFor(measurement),
    ...resultFor(record, measurement),
    ...(method === undefined ? {} : { method }),
    ...(identities.recordingDevice === undefined ?
      {}
    : { device: { reference: identities.recordingDevice.snapshot.fullUrl } }),
  }
}

const outputCoordinates = (
  record: NormalizedProviderRecord,
): Result<
  readonly [ProviderOutputCoordinates, ...ProviderOutputCoordinates[]]
> => {
  const coordinates = record.measurements.map(({ kind }) =>
    providerOutputCoordinates(
      record.source.adapter.provider,
      record.source.sourceType,
      kind,
    ),
  )
  const [first, ...rest] = coordinates
  if (first === undefined || coordinates.some((entry) => entry === undefined)) {
    throw new Error('Validated Provider measurements name no catalog output.')
  }
  return ok([first, ...(rest as ProviderOutputCoordinates[])])
}

// A disclosure is admitted only where the catalog row designates one one-to-one output.
const disclosureIssues = (
  record: NormalizedProviderRecord,
  disclosure: GovernedSourceIdentifierDisclosurePolicy,
  graph: ContextGraph,
): Result<undefined> => {
  if (disclosure.kind === 'omit') return ok(undefined)
  const scopeIssues = governedSourceIdentifierIssues(
    disclosure,
    graph.context.identityScope,
  )
  if (scopeIssues.length > 0) return issues(scopeIssues)
  const rowKinds = providerSourceKinds(
    record.source.adapter.provider,
    record.source.sourceType,
  )
  return rowKinds.length === 1 && record.measurements.length === 1 ?
      ok(undefined)
    : contextFault(
        ['nativeIdentifierDisclosure'],
        'The Provider catalog must designate one unique one-to-one Observation before a governed source Identifier may be disclosed; ambiguous multi-output records must omit it.',
      )
}

const resolveGraphIdentities = (
  record: NormalizedProviderRecord,
  graph: ContextGraph,
): Result<ResolvedGraphIdentities> => {
  const { context } = graph
  const repositoryIds = context.repositoryIds ?? {}
  const coordinates = outputCoordinates(record)
  if (!coordinates.ok) return coordinates
  const connected = deriveProviderIdentities({
    provider: record.source.adapter.provider,
    repositoryScope: context.repositoryScope,
    sourceType: record.source.sourceType,
    sourceNativeId: record.source.sourceNativeId,
    outputs: coordinates.value.map((output) => ({
      kind: 'provider-output' as const,
      ...output,
    })),
    event: context.event,
    scope: context.identityScope,
  })
  if (!connected.ok) return connected
  if (
    repositoryIds['primary-output'] !== undefined &&
    connected.value.outputs.length !== 1
  ) {
    return contextFault(
      ['repositoryIds', 'primary-output'],
      'A primary-output repository id names the sole output of a one-output record.',
    )
  }
  const observations = collectResults(
    connected.value.outputs.map((output) =>
      createEntryIdentity(output, repositoryIds['primary-output']),
    ),
  )
  if (!observations.ok) return observations
  const [firstObservation, ...otherObservations] = observations.value
  if (firstObservation === undefined) {
    throw new Error('Validated Provider record derived no output identity.')
  }
  const provenance = createEntryIdentity(
    connected.value.provenanceNode,
    repositoryIds.provenance,
  )
  if (!provenance.ok) return provenance
  const recordingDevice =
    record.source.recordingDevice === undefined ?
      ok(undefined)
    : deriveRecordingDeviceEntryIdentity(
        context.identityScope,
        context.event,
        record.source.adapter.provider,
        context.subject.identifier,
        record.source.recordingDevice,
        repositoryIds['recording-device'],
      )
  if (!recordingDevice.ok) return recordingDevice
  const writerRecord =
    record.source.writerRecord === undefined ?
      ok(undefined)
    : deriveWriterRecordIdentifier(
        context.identityScope,
        record.source.writerRecord,
      )
  if (!writerRecord.ok) return writerRecord
  return ok({
    connected: connected.value,
    observations: [firstObservation, ...otherObservations],
    provenance: provenance.value,
    ...(recordingDevice.value === undefined ?
      {}
    : { recordingDevice: recordingDevice.value }),
    ...(writerRecord.value === undefined ?
      {}
    : { writerRecord: writerRecord.value }),
  })
}

const graphIdentifiers = (
  identities: ResolvedGraphIdentities,
  graph: ContextGraph,
): ExchangeGraphIdentifiers => {
  const [first, ...rest] = identities.connected.outputs
  if (first === undefined) {
    throw new Error('Validated Provider record derived no output identity.')
  }
  return {
    event: identities.connected.event,
    sourceRecord: identities.connected.sourceRecord,
    outputs: [first, ...rest],
    provenance: identities.provenance.identifier,
    applicationSnapshot: graph.application.identifier,
    hostSnapshot: graph.host.identifier,
    writerSnapshot: graph.writer.identifier,
    ...(identities.recordingDevice === undefined ?
      {}
    : {
        recordingDevice: identities.recordingDevice.stableIdentifier,
        recordingDeviceSnapshot: identities.recordingDevice.snapshot.identifier,
      }),
    ...(graph.gatewayApplication === undefined ?
      {}
    : { gatewayApplicationSnapshot: graph.gatewayApplication.identifier }),
    ...(identities.writerRecord === undefined ?
      {}
    : { writerRecord: identities.writerRecord }),
  }
}

const buildEntries = (
  record: NormalizedProviderRecord,
  identities: ResolvedGraphIdentities,
  graph: ContextGraph,
  disclosure: GovernedSourceIdentifierDisclosurePolicy,
): Result<readonly ProviderGraphEntry[]> => {
  const observations = record.measurements.map((measurement, index) => {
    const identity = identities.observations[index]
    if (identity === undefined) {
      throw new Error(
        'Provider output identities do not align with the measurements they were derived from.',
      )
    }
    return identifiedEntry(
      identity,
      makeObservation({
        record,
        measurement,
        identity,
        identities,
        graph,
        disclosure,
      }),
    )
  })
  const [firstMeasurement, ...otherMeasurements] = record.measurements
  const provenance = makeConversionProvenance({
    identity: identities.provenance,
    profile: PROFILES.providerConversionProvenance,
    targets: identities.observations.map(({ fullUrl }) => fullUrl),
    occurred: occurredFor([
      firstMeasurement.effective,
      ...otherMeasurements.map(({ effective }) => effective),
    ]),
    recorded: graph.context.conversionInstant,
    sourceRecord: identities.connected.sourceRecord,
    graph,
  })
  const recordingDevice =
    (
      record.source.recordingDevice === undefined ||
      identities.recordingDevice === undefined
    ) ?
      []
    : [
        identifiedEntry(
          identities.recordingDevice.snapshot,
          makeRecordingDevice({
            ...record.source.recordingDevice,
            identity: identities.recordingDevice.snapshot,
            stableIdentifier: identities.recordingDevice.stableIdentifier,
          }),
        ),
      ]
  return deduplicateIdentifiedEntries([
    ...graph.leadingEntries,
    ...observations,
    ...recordingDevice,
    ...graph.supportingEntries,
    identifiedEntry(identities.provenance, provenance),
  ])
}

/**
 * Converts one normalized provider record into its exchange graph.
 *
 * The context needs the subject, the event this scope minted, the identity scope, the
 * repository scope, the application and the host; the conversion instant defaults to now,
 * the converter role to the assembler, and the studies to none. A refused record returns
 * `mobile-input.*` issues; a context or option fault returns the package's schema codes.
 * Every output shares one conversion Provenance whose occurred time spans the outputs'
 * effective times and whose recorded time is the conversion instant. A catalog
 * inconsistency the generator should have caught throws, because no input can cause it.
 */
export const buildProviderExchangeGraph = (
  record: NormalizedProviderRecord,
  context: ExchangeEventContext,
  options: ProviderConversionOptions = {},
): Result<ProviderConversion> => {
  const parsedRecord = parseNormalizedProviderRecord(record)
  if (!parsedRecord.ok) return parsedRecord
  const parsedOptions = parseProviderConversionOptions(options)
  if (!parsedOptions.ok) return parsedOptions
  const graph = resolveContextGraph(
    context,
    parsedRecord.value.source.writer,
    true,
  )
  if (!graph.ok) return graph
  const disclosure = parsedOptions.value.nativeIdentifierDisclosure ?? {
    kind: 'omit',
  }
  const admitted = disclosureIssues(parsedRecord.value, disclosure, graph.value)
  if (!admitted.ok) return admitted
  const aggregation = parsedRecord.value.measurements.flatMap(
    (measurement, index) =>
      missingAggregationMethod(parsedRecord.value, measurement.kind) ?
        [
          {
            severity: 'error' as const,
            code: 'mobile-input.unsupported-source-value' as const,
            path: ['measurements', index],
            message: `${parsedRecord.value.source.adapter.provider}/${parsedRecord.value.source.sourceType} declares no aggregation for ${measurement.kind}, so its Observation would omit the method its profile requires.`,
          },
        ]
      : [],
  )
  if (aggregation.length > 0) return issues(aggregation)
  const identities = resolveGraphIdentities(parsedRecord.value, graph.value)
  if (!identities.ok) return identities
  const entries = buildEntries(
    parsedRecord.value,
    identities.value,
    graph.value,
    disclosure,
  )
  if (!entries.ok) return entries
  const { repositoryIds = {} } = graph.value.context
  const parsed = parseExchangeGraph({
    resourceType: 'Bundle',
    ...(repositoryIds.bundle === undefined ? {} : { id: repositoryIds.bundle }),
    meta: { profile: [PROFILES.mobileBundle] },
    identifier: identifier(identities.value.connected.event),
    type: 'collection',
    timestamp: graph.value.context.conversionInstant,
    entry: entries.value,
  })
  if (!parsed.ok) return parsed
  return ok({
    source: parsedRecord.value.source,
    identifiers: graphIdentifiers(identities.value, graph.value),
    graph: parsed.value,
    warnings: [],
  })
}

/**
 * Converts several records, each under the context its callback reserves for it.
 *
 * A refused record becomes a failure with its registry codes; the callback's own errors
 * propagate, because a failed reservation is the caller's exception and never a refusal.
 */
export const buildProviderExchangeGraphs = (
  records: readonly NormalizedProviderRecord[],
  context: (record: NormalizedProviderRecord) => ExchangeEventContext,
  options: ProviderConversionOptions = {},
): ConversionBatch<ProviderConversion, ProviderConversionFailure> => {
  const conversions: ProviderConversion[] = []
  const failures: ProviderConversionFailure[] = []
  for (const record of records) {
    const result = buildProviderExchangeGraph(record, context(record), options)
    if (result.ok) conversions.push(result.value)
    else failures.push({ record, issues: result.issues })
  }
  return { conversions, failures }
}
