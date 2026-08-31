//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { providerAdapterCatalog } from '../contract/providers.generated.js'
import {
  assemblerAgent,
  coding,
  concept,
  deduplicateIdentifiedEntries,
  governedSourceIdentifier,
  identifiedEntry,
  identifier,
  makeApplicationDevice,
  makeHostDevice,
  makeRecordingDevice,
  provenanceActivity,
  resourceId,
  sourceEntityAgent,
} from './graph.js'
import {
  deriveApplicationEntryIdentity,
  deriveDeviceSnapshotEntryIdentity,
  deriveProviderIdentities,
  deriveRecordingDeviceEntryIdentity,
  deriveWriterRecordIdentifier,
  type RecordingDeviceGraphIdentity,
} from './identity.js'
import {
  providerMeasurementDefinition,
  providerMeasurementProfile,
  providerObservationProfile,
  type ProviderMeasurementDefinition,
} from './measurement-definition.js'
import { EXTENSIONS, PROFILES, SYSTEMS } from './profiles.js'
import {
  providerOutputCoordinates,
  type ProviderOutputCoordinates,
  parseProviderMeasurementBundleInput,
} from './provider.js'
import type { ProviderMeasurementBundleInput } from './types.js'
import { issues, ok, type Result, type UrnUuid } from '../core/index.js'
import { createEntryIdentity } from '../mobile/identity.js'
import type {
  CompleteIdentifierInput,
  IdentifiedEntryIdentityInput,
} from '../mobile/types.js'
import {
  parseGroveMobileExchangeBundle,
  type CodeableConcept,
  type GroveMobileExchangeBundle,
} from '../r4/index.js'

type ConnectedMeasurement =
  ProviderMeasurementBundleInput['measurements'][number]

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
  readonly sourceRecord: CompleteIdentifierInput
  readonly event: CompleteIdentifierInput
  readonly observations: readonly IdentifiedEntryIdentityInput[]
  readonly provenance: IdentifiedEntryIdentityInput
  readonly application: IdentifiedEntryIdentityInput
  readonly applicationHost?: IdentifiedEntryIdentityInput
  readonly dataOrigin: IdentifiedEntryIdentityInput
  readonly dataOriginHost?: IdentifiedEntryIdentityInput
  readonly gatewayReference?: UrnUuid
  readonly distinctGatewayApplication?: IdentifiedEntryIdentityInput
  readonly distinctGatewayHost?: IdentifiedEntryIdentityInput
  readonly recordingDevice?: RecordingDeviceGraphIdentity
  readonly writerRecord?: CompleteIdentifierInput
}

type ProviderGraphEntry = GroveMobileExchangeBundle['entry'][number]
type ProviderGraphResource = Parameters<typeof identifiedEntry>[1]

const definitionFor = (
  input: ProviderMeasurementBundleInput,
  kind: ConnectedMeasurement['kind'],
): ProviderMeasurementDefinition => {
  const definition = providerMeasurementDefinition(
    input.source.adapter.provider,
    kind,
  )
  if (definition === undefined) {
    throw new Error(
      `Validated Provider input has no definition for ${input.source.adapter.provider}/${kind}.`,
    )
  }
  return definition
}

const categoryFor = (definition: ProviderMeasurementDefinition) => {
  if (definition.category === undefined) return undefined
  return [
    concept(
      definition.category.system,
      definition.category.code,
      definition.category.display,
    ),
  ]
}

const profileFor = (
  input: ProviderMeasurementBundleInput,
  kind: ConnectedMeasurement['kind'],
): readonly string[] => {
  const semanticProfile = providerMeasurementProfile(
    input.source.adapter.provider,
    kind,
  )
  if (semanticProfile === undefined) {
    throw new Error(
      `Validated Provider input has no semantic profile for ${input.source.adapter.provider}/${kind}.`,
    )
  }
  const adapterProfile = providerObservationProfile(
    input.source.adapter.provider,
  )
  if (adapterProfile === undefined) {
    throw new Error(
      `Validated Provider input has no adapter profile for ${input.source.adapter.provider}.`,
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
  input: ProviderMeasurementBundleInput,
  kind: ConnectedMeasurement['kind'],
): CodeableConcept | undefined => {
  const definition = definitionFor(input, kind)
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
    `${input.source.adapter.provider}|${input.source.sourceType}|${kind}`,
  )
  return declared === undefined ? undefined : (
      concept(SYSTEMS.groveAggregationMethod, declared)
    )
}

/**
 * A measurement whose catalog entry admits more than one aggregation must have one declared for
 * this exact provider and source type, otherwise the emitted Observation would silently omit the
 * method its profile requires.
 */
const missingAggregationMethod = (
  input: ProviderMeasurementBundleInput,
  kind: ConnectedMeasurement['kind'],
): boolean =>
  definitionFor(input, kind).methodChoice !== undefined &&
  aggregationMethodFor(input, kind) === undefined

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
  input: ProviderMeasurementBundleInput,
  measurement: ConnectedMeasurement,
) => {
  if (measurement.kind === 'blood-pressure') {
    const definition = definitionFor(input, 'blood-pressure')
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

  const definition = definitionFor(input, measurement.kind)

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

const makeObservation = (
  input: ProviderMeasurementBundleInput,
  measurement: ConnectedMeasurement,
  observationIdentity: IdentifiedEntryIdentityInput,
  identities: ResolvedGraphIdentities,
  method: CodeableConcept | undefined,
) => {
  const definition = definitionFor(input, measurement.kind)
  const category = categoryFor(definition)
  const extensions = [
    {
      url: EXTENSIONS.provider,
      valueCode: input.source.adapter.provider,
    },
    {
      url: EXTENSIONS.providerSourceType,
      valueCode: `${input.source.adapter.provider}/${input.source.sourceType}`,
    },
    ...(identities.gatewayReference === undefined ?
      []
    : [
        {
          url: EXTENSIONS.gatewayDevice,
          valueReference: { reference: identities.gatewayReference },
        },
      ]),
    ...(input.source.recordingMethod === undefined ?
      []
    : [
        {
          url: EXTENSIONS.recordingMethod,
          valueCoding: coding(
            SYSTEMS.groveRecordingMethod,
            input.source.recordingMethod,
          ),
        },
      ]),
    ...(input.researchStudyReferences ?? []).map((reference) => ({
      url: EXTENSIONS.researchStudy,
      valueReference: {
        type: reference.type,
        identifier: {
          system: reference.identifier.system,
          value: reference.identifier.value,
        },
      },
    })),
  ]

  return {
    resourceType: 'Observation' as const,
    ...resourceId(observationIdentity),
    meta: { profile: profileFor(input, measurement.kind) },
    extension: [
      ...extensions,
      ...(input.source.writerRecord?.version === undefined ?
        []
      : [
          {
            url: EXTENSIONS.writerRecordVersion,
            valueString: input.source.writerRecord.version,
          },
        ]),
    ],
    identifier: [
      identifier(identities.sourceRecord),
      identifier(observationIdentity.identifier),
      ...(identities.writerRecord === undefined ?
        []
      : [identifier(identities.writerRecord)]),
      ...(input.nativeIdentifierDisclosure === undefined ?
        []
      : [governedSourceIdentifier(input.nativeIdentifierDisclosure)]),
    ],
    status: 'final' as const,
    ...(category === undefined ? {} : { category }),
    code: {
      coding: [coding(definition.code.system, definition.code.code)],
    },
    subject: {
      type: input.subject.type,
      identifier: {
        system: input.subject.identifier.system,
        value: input.subject.identifier.value,
      },
    },
    ...effectiveFor(measurement),
    ...resultFor(input, measurement),
    ...(method === undefined ? {} : { method }),
    ...(input.source.recordingDevice === undefined ?
      {}
    : { device: { reference: identities.recordingDevice?.snapshot.fullUrl } }),
  }
}

const makeProvenance = (
  input: ProviderMeasurementBundleInput,
  identities: ResolvedGraphIdentities,
) => {
  return {
    resourceType: 'Provenance' as const,
    ...resourceId(identities.provenance),
    meta: {
      profile: [PROFILES.providerConversionProvenance],
    },
    target: identities.observations.map(({ fullUrl }) => ({
      reference: fullUrl,
    })),
    occurredDateTime: input.occurred,
    recorded: input.recorded,
    activity: provenanceActivity(),
    agent: [assemblerAgent(identities.application.fullUrl)],
    entity: [
      {
        role: 'source' as const,
        what: {
          identifier: identifier(identities.sourceRecord),
        },
        agent: [sourceEntityAgent(identities.dataOrigin.fullUrl)],
      },
    ],
  }
}

const optionalRecordingDeviceIdentity = (
  input: ProviderMeasurementBundleInput['source']['recordingDevice'],
  deployment: ProviderMeasurementBundleInput['deploymentIdentity'],
  event: CompleteIdentifierInput,
  adapterId: string,
): Result<RecordingDeviceGraphIdentity | undefined> =>
  input === undefined ?
    ok(undefined)
  : deriveRecordingDeviceEntryIdentity(deployment, event, adapterId, input)

type ResolvedGatewayIdentity = Pick<
  ResolvedGraphIdentities,
  'distinctGatewayApplication' | 'distinctGatewayHost' | 'gatewayReference'
>

const resolveHostIdentity = (
  application: ProviderMeasurementBundleInput['application'],
  deployment: ProviderMeasurementBundleInput['deploymentIdentity'],
  event: CompleteIdentifierInput,
): Result<IdentifiedEntryIdentityInput | undefined> =>
  application.host === undefined ?
    ok(undefined)
  : deriveDeviceSnapshotEntryIdentity(
      deployment,
      event,
      application.host.sourceDeviceToken,
      'host',
      application.host.id,
    )

const resolveGatewayIdentity = (
  input: ProviderMeasurementBundleInput['gatewayApplication'],
  converter: IdentifiedEntryIdentityInput,
  deployment: ProviderMeasurementBundleInput['deploymentIdentity'],
  event: CompleteIdentifierInput,
): Result<ResolvedGatewayIdentity> => {
  if (input === undefined) return ok({})
  if (input.kind === 'converter-application') {
    return ok({ gatewayReference: converter.fullUrl })
  }
  const application = deriveApplicationEntryIdentity(
    deployment,
    event,
    input.application,
  )
  if (!application.ok) return application
  const host = resolveHostIdentity(input.application, deployment, event)
  if (!host.ok) return host
  return ok({
    gatewayReference: application.value.fullUrl,
    distinctGatewayApplication: application.value,
    ...(host.value === undefined ? {} : { distinctGatewayHost: host.value }),
  })
}

const resolveProviderOutputCoordinates = (
  input: ProviderMeasurementBundleInput,
): Result<readonly ProviderOutputCoordinates[]> => {
  for (const [index, measurement] of input.measurements.entries()) {
    if (missingAggregationMethod(input, measurement.kind)) {
      return issues([
        {
          severity: 'error',
          code: 'unsupported-measurement',
          path: ['measurements', index],
          message:
            `${input.source.adapter.provider}/${input.source.sourceType} declares no aggregation ` +
            `for ${measurement.kind}, so its Observation would omit the method its profile requires.`,
        },
      ])
    }
  }
  const outputCoordinates = input.measurements.map(({ kind }) =>
    providerOutputCoordinates(
      input.source.adapter.provider,
      input.source.sourceType,
      kind,
    ),
  )
  if (outputCoordinates.some((coordinates) => coordinates === undefined)) {
    return issues([
      {
        severity: 'error',
        code: 'unsupported-measurement',
        path: ['measurements'],
        message: 'No catalog-owned Provider output role exists.',
      },
    ])
  }
  return ok(outputCoordinates as readonly ProviderOutputCoordinates[])
}

const resolveObservationIdentities = (
  input: ProviderMeasurementBundleInput,
  outputs: readonly CompleteIdentifierInput[],
): Result<readonly IdentifiedEntryIdentityInput[]> => {
  const observations: IdentifiedEntryIdentityInput[] = []
  for (const [index, output] of outputs.entries()) {
    const measurement = input.measurements[index]
    if (measurement === undefined) {
      return issues([
        {
          severity: 'error',
          code: 'value-mismatch',
          path: ['measurements'],
          message: 'Provider output identities are incomplete.',
        },
      ])
    }
    const observation = createEntryIdentity(
      output,
      input.repositoryIds?.observations?.[measurement.kind],
    )
    if (!observation.ok) return observation
    observations.push(observation.value)
  }
  return ok(observations)
}

const resolveGraphIdentities = (
  input: ProviderMeasurementBundleInput,
): Result<ResolvedGraphIdentities> => {
  const outputCoordinates = resolveProviderOutputCoordinates(input)
  if (!outputCoordinates.ok) return outputCoordinates
  const connected = deriveProviderIdentities({
    provider: input.source.adapter.provider,
    providerScopeIdentifier: input.source.providerScopeIdentifier,
    sourceType: input.source.sourceType,
    sourceNativeId: input.source.sourceNativeId,
    outputs: outputCoordinates.value.map(
      ({ outputRole, outputDiscriminator }) => ({
        kind: 'provider-output' as const,
        outputRole,
        outputDiscriminator,
      }),
    ),
    eventSequence: input.eventSequence,
    deployment: input.deploymentIdentity,
  })
  if (!connected.ok) return connected

  const observations = resolveObservationIdentities(
    input,
    connected.value.outputs,
  )
  if (!observations.ok) return observations
  const provenance = createEntryIdentity(
    connected.value.provenanceNode,
    input.repositoryIds?.provenance,
  )
  if (!provenance.ok) return provenance
  const application = deriveApplicationEntryIdentity(
    input.deploymentIdentity,
    connected.value.event,
    input.application,
  )
  if (!application.ok) return application
  const applicationHost = resolveHostIdentity(
    input.application,
    input.deploymentIdentity,
    connected.value.event,
  )
  if (!applicationHost.ok) return applicationHost
  const gateway = resolveGatewayIdentity(
    input.gatewayApplication,
    application.value,
    input.deploymentIdentity,
    connected.value.event,
  )
  if (!gateway.ok) return gateway
  const dataOrigin = deriveApplicationEntryIdentity(
    input.deploymentIdentity,
    connected.value.event,
    input.source.dataOrigin,
  )
  if (!dataOrigin.ok) return dataOrigin
  const dataOriginHost = resolveHostIdentity(
    input.source.dataOrigin,
    input.deploymentIdentity,
    connected.value.event,
  )
  if (!dataOriginHost.ok) return dataOriginHost

  const recordingDevice = optionalRecordingDeviceIdentity(
    input.source.recordingDevice,
    input.deploymentIdentity,
    connected.value.event,
    input.source.adapter.provider,
  )
  if (!recordingDevice.ok) return recordingDevice

  const writerRecord =
    input.source.writerRecord === undefined ?
      undefined
    : deriveWriterRecordIdentifier(
        input.deploymentIdentity,
        input.source.writerRecord.applicationIdentifier,
        input.source.writerRecord.nativeRecordId,
      )
  if (writerRecord !== undefined && !writerRecord.ok) return writerRecord

  const resolved: ResolvedGraphIdentities = {
    sourceRecord: connected.value.sourceRecord,
    event: connected.value.event,
    observations: observations.value,
    provenance: provenance.value,
    application: application.value,
    dataOrigin: dataOrigin.value,
    ...(applicationHost.value === undefined ?
      {}
    : { applicationHost: applicationHost.value }),
    ...(dataOriginHost.value === undefined ?
      {}
    : { dataOriginHost: dataOriginHost.value }),
    ...gateway.value,
    ...(writerRecord === undefined ? {} : { writerRecord: writerRecord.value }),
    ...(recordingDevice.value === undefined ?
      {}
    : { recordingDevice: recordingDevice.value }),
  }
  return { ok: true, value: resolved }
}

const buildProviderObservationEntries = (
  input: ProviderMeasurementBundleInput,
  identities: ResolvedGraphIdentities,
): Result<readonly ProviderGraphEntry[]> => {
  const entries: ProviderGraphEntry[] = []
  for (const [index, measurement] of input.measurements.entries()) {
    const identity = identities.observations[index]
    if (identity === undefined) {
      return issues([
        {
          severity: 'error',
          code: 'value-mismatch',
          path: ['measurements', index],
          message: 'Provider output identities are incomplete.',
        },
      ])
    }
    entries.push(
      identifiedEntry(
        identity,
        makeObservation(
          input,
          measurement,
          identity,
          identities,
          aggregationMethodFor(input, measurement.kind),
        ),
      ),
    )
  }
  return ok(entries)
}

const optionalIdentifiedEntry = (
  identity: IdentifiedEntryIdentityInput | undefined,
  resource: ProviderGraphResource | undefined,
): readonly ProviderGraphEntry[] =>
  identity === undefined || resource === undefined ?
    []
  : [identifiedEntry(identity, resource)]

const buildProviderSupportingEntries = (
  input: ProviderMeasurementBundleInput,
  identities: ResolvedGraphIdentities,
): readonly ProviderGraphEntry[] => {
  const applicationHostInput = input.application.host
  const applicationHost =
    (
      applicationHostInput === undefined ||
      identities.applicationHost === undefined
    ) ?
      undefined
    : makeHostDevice({
        ...applicationHostInput,
        identity: identities.applicationHost,
      })
  const application = makeApplicationDevice({
    ...input.application,
    identity: identities.application,
    ...(identities.applicationHost === undefined ?
      {}
    : { parentReference: identities.applicationHost.fullUrl }),
  })
  const gatewayApplicationInput =
    input.gatewayApplication?.kind === 'distinct-application' ?
      input.gatewayApplication.application
    : undefined
  const gatewayApplication =
    (
      gatewayApplicationInput === undefined ||
      identities.distinctGatewayApplication === undefined
    ) ?
      undefined
    : makeApplicationDevice({
        ...gatewayApplicationInput,
        identity: identities.distinctGatewayApplication,
        ...(identities.distinctGatewayHost === undefined ?
          {}
        : { parentReference: identities.distinctGatewayHost.fullUrl }),
      })
  const gatewayHostInput = gatewayApplicationInput?.host
  const gatewayHost =
    (
      gatewayHostInput === undefined ||
      identities.distinctGatewayHost === undefined
    ) ?
      undefined
    : makeHostDevice({
        ...gatewayHostInput,
        identity: identities.distinctGatewayHost,
      })
  const recordingDeviceInput = input.source.recordingDevice
  const recordingDevice =
    (
      recordingDeviceInput === undefined ||
      identities.recordingDevice === undefined
    ) ?
      undefined
    : makeRecordingDevice({
        ...recordingDeviceInput,
        identity: identities.recordingDevice.snapshot,
        stableIdentifier: identities.recordingDevice.stableIdentifier,
      })
  const dataOriginHostInput = input.source.dataOrigin.host
  const dataOriginHost =
    (
      dataOriginHostInput === undefined ||
      identities.dataOriginHost === undefined
    ) ?
      undefined
    : makeHostDevice({
        ...dataOriginHostInput,
        identity: identities.dataOriginHost,
      })
  const dataOrigin = makeApplicationDevice({
    ...input.source.dataOrigin,
    identity: identities.dataOrigin,
    ...(identities.dataOriginHost === undefined ?
      {}
    : { parentReference: identities.dataOriginHost.fullUrl }),
  })
  const provenance = makeProvenance(input, identities)
  return [
    ...optionalIdentifiedEntry(
      identities.recordingDevice?.snapshot,
      recordingDevice,
    ),
    ...optionalIdentifiedEntry(identities.dataOriginHost, dataOriginHost),
    identifiedEntry(identities.dataOrigin, dataOrigin),
    ...optionalIdentifiedEntry(identities.distinctGatewayHost, gatewayHost),
    ...optionalIdentifiedEntry(
      identities.distinctGatewayApplication,
      gatewayApplication,
    ),
    ...optionalIdentifiedEntry(identities.applicationHost, applicationHost),
    identifiedEntry(identities.application, application),
    identifiedEntry(identities.provenance, provenance),
  ]
}

const buildProviderGraphEntries = (
  input: ProviderMeasurementBundleInput,
  identities: ResolvedGraphIdentities,
): Result<readonly ProviderGraphEntry[]> => {
  const observations = buildProviderObservationEntries(input, identities)
  if (!observations.ok) return observations
  return deduplicateIdentifiedEntries([
    ...observations.value,
    ...buildProviderSupportingEntries(input, identities),
  ])
}

/**
 * Builds one deterministic, profile-stamped R4 resource graph for the non-empty
 * subset of catalog-admitted outputs present in a connected-provider source
 * record. Every output shares one conversion Provenance. Native ids are digest
 * input by default and may appear only through the explicit governed disclosure
 * policy. Times, repository ids, and the durable event sequence remain
 * caller-owned; malformed inputs return structured issues and no partial graph.
 */
export const buildProviderMeasurementBundle = (
  input: ProviderMeasurementBundleInput,
): Result<GroveMobileExchangeBundle> => {
  const parsed = parseProviderMeasurementBundleInput(input)
  if (!parsed.ok) return parsed
  const validatedInput = parsed.value

  const identities = resolveGraphIdentities(validatedInput)
  if (!identities.ok) return identities

  const entry = buildProviderGraphEntries(validatedInput, identities.value)
  if (!entry.ok) return entry

  return parseGroveMobileExchangeBundle({
    resourceType: 'Bundle',
    ...(validatedInput.repositoryIds?.bundle === undefined ?
      {}
    : { id: validatedInput.repositoryIds.bundle }),
    meta: { profile: [PROFILES.mobileBundle] },
    identifier: identifier(identities.value.event),
    type: 'collection',
    timestamp: validatedInput.assembled,
    entry: entry.value,
  })
}
