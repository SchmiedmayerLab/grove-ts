//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  groveProviderProfileCanonicals,
  providerAdapterCatalog,
} from './contract.generated.js'
import {
  assemblerAgent,
  coding,
  concept,
  identifiedEntry,
  identifier,
  makeApplicationDevice,
  makeRecordingDevice,
  provenanceActivity,
  resourceId,
  sourceEntityAgent,
} from './graph.js'
import { deriveProviderIdentities } from './identity.js'
import { EXTENSIONS, PROFILES, SYSTEMS } from './profiles.js'
import {
  providerOutputDiscriminator,
  parseProviderMeasurementBundleInput,
} from './provider.js'
import type { ProviderMeasurementBundleInput } from './types.js'
import { issues, ok, type Result, type UrnUuid } from '../core/index.js'
import { createEntryIdentity } from '../mobile/identity.js'
import { sharedMobileMeasurementCatalog } from '../mobile/measurement-catalog.generated.js'
import type {
  CompleteIdentifierInput,
  IdentifiedEntryIdentityInput,
  ResourceIdentityInput,
} from '../mobile/types.js'
import { parseCollectionBundle, type CollectionBundle } from '../r4/index.js'

const VITAL_SIGNS = new Set([
  'blood-pressure',
  'body-height',
  'body-temperature',
  'body-weight',
  'heart-rate',
  'oxygen-saturation',
  'respiratory-rate',
])

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
  readonly exchange: CompleteIdentifierInput
  readonly observations: readonly IdentifiedEntryIdentityInput[]
  readonly provenance: IdentifiedEntryIdentityInput
  readonly application: IdentifiedEntryIdentityInput
  readonly dataOrigin: IdentifiedEntryIdentityInput
  readonly gatewayReference?: UrnUuid
  readonly distinctGatewayApplication?: IdentifiedEntryIdentityInput
  readonly recordingDevice?: IdentifiedEntryIdentityInput
}

const categoryFor = (kind: ConnectedMeasurement['kind']) => {
  if (VITAL_SIGNS.has(kind)) {
    return [concept(SYSTEMS.observationCategory, 'vital-signs', 'Vital Signs')]
  }
  return [concept(SYSTEMS.observationCategory, 'activity', 'Activity')]
}

const profileFor = (kind: ConnectedMeasurement['kind']): readonly string[] => {
  const definition = sharedMobileMeasurementCatalog[kind]
  return [
    groveProviderProfileCanonicals[definition.profile],
    PROFILES.providerObservation,
  ]
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

const methodFor = (
  input: ProviderMeasurementBundleInput,
  kind: ConnectedMeasurement['kind'],
) => {
  const definition = sharedMobileMeasurementCatalog[kind]
  if ('method' in definition) {
    return {
      method: concept(
        SYSTEMS.groveAggregationMethod,
        definition.method.code,
        definition.method.display,
      ),
    }
  }
  if (!('methodChoice' in definition)) {
    return {}
  }
  const { provider } = input.source.adapter
  const declared = declaredAggregationMethods.get(
    `${provider}|${input.source.sourceType}|${kind}`,
  )
  if (declared === undefined) {
    throw new Error(
      `${provider}/${input.source.sourceType} does not declare which aggregation ${kind} carries.`,
    )
  }
  return { method: concept(SYSTEMS.groveAggregationMethod, declared) }
}

const effectiveFor = (measurement: ConnectedMeasurement) =>
  measurement.effective.kind === 'date-time' ?
    { effectiveDateTime: measurement.effective.value }
  : {
      effectivePeriod: {
        start: measurement.effective.start,
        end: measurement.effective.end,
      },
    }

const resultFor = (measurement: ConnectedMeasurement) => {
  if (measurement.kind === 'blood-pressure') {
    const definition = sharedMobileMeasurementCatalog['blood-pressure']
    const systolic = definition.components[0]
    const diastolic = definition.components[1]
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

  const definition = sharedMobileMeasurementCatalog[measurement.kind]

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
) => {
  const definition = sharedMobileMeasurementCatalog[measurement.kind]
  const category = categoryFor(measurement.kind)
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
      valueReference: { reference },
    })),
  ]

  return {
    resourceType: 'Observation' as const,
    ...resourceId(observationIdentity),
    meta: { profile: profileFor(measurement.kind) },
    extension: extensions,
    identifier: [
      identifier(identities.sourceRecord),
      identifier(observationIdentity.identifier),
    ],
    status: 'final' as const,
    category,
    code: {
      coding: [coding(definition.code.system, definition.code.code)],
    },
    subject: { reference: input.subject },
    ...effectiveFor(measurement),
    issued: input.issued,
    ...resultFor(measurement),
    ...methodFor(input, measurement.kind),
    ...(input.source.recordingDevice === undefined ?
      {}
    : { device: { reference: identities.recordingDevice?.fullUrl } }),
  }
}

const makeProvenance = (
  input: ProviderMeasurementBundleInput,
  identities: ResolvedGraphIdentities,
) => {
  return {
    resourceType: 'Provenance' as const,
    ...resourceId(identities.provenance),
    meta: { profile: [PROFILES.providerConversionProvenance] },
    target: identities.observations.map(({ fullUrl }) => ({
      reference: fullUrl,
    })),
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

const optionalEntryIdentity = (
  input: ResourceIdentityInput | undefined,
): Result<IdentifiedEntryIdentityInput | undefined> =>
  input === undefined ?
    ok(undefined)
  : createEntryIdentity(input.identifier, input.id)

type ResolvedGatewayIdentity = Pick<
  ResolvedGraphIdentities,
  'distinctGatewayApplication' | 'gatewayReference'
>

const resolveGatewayIdentity = (
  input: ProviderMeasurementBundleInput['gatewayApplication'],
  converter: IdentifiedEntryIdentityInput,
): Result<ResolvedGatewayIdentity> => {
  if (input === undefined) return ok({})
  if (input.kind === 'converter-application') {
    return ok({ gatewayReference: converter.fullUrl })
  }
  const application = createEntryIdentity(
    input.application.identity.identifier,
    input.application.identity.id,
  )
  if (!application.ok) return application
  return ok({
    gatewayReference: application.value.fullUrl,
    distinctGatewayApplication: application.value,
  })
}

const resolveGraphIdentities = (
  input: ProviderMeasurementBundleInput,
): Result<ResolvedGraphIdentities> => {
  const outputDiscriminators = input.measurements.map(({ kind }) =>
    providerOutputDiscriminator(
      input.source.adapter.provider,
      input.source.sourceType,
      kind,
    ),
  )
  if (outputDiscriminators.some((value) => value === undefined)) {
    return issues([
      {
        severity: 'error',
        code: 'unsupported-measurement',
        path: ['measurements'],
        message: 'No catalog-owned Provider output discriminator exists.',
      },
    ])
  }
  const connected = deriveProviderIdentities({
    provider: input.source.adapter.provider,
    providerAccountIdentifier: input.source.providerAccountIdentifier,
    sourceType: input.source.sourceType,
    sourceNativeId: input.source.sourceNativeId,
    outputDiscriminators: outputDiscriminators as [string, ...string[]],
    eventSequence: input.eventSequence,
  })
  if (!connected.ok) return connected

  const observations: IdentifiedEntryIdentityInput[] = []
  for (const [index, output] of connected.value.outputs.entries()) {
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
  const provenance = createEntryIdentity(
    connected.value.conversion,
    input.repositoryIds?.provenance,
  )
  if (!provenance.ok) return provenance
  const application = createEntryIdentity(
    input.application.identity.identifier,
    input.application.identity.id,
  )
  if (!application.ok) return application
  const gateway = resolveGatewayIdentity(
    input.gatewayApplication,
    application.value,
  )
  if (!gateway.ok) return gateway
  const dataOrigin = createEntryIdentity(
    input.source.dataOrigin.identity.identifier,
    input.source.dataOrigin.identity.id,
  )
  if (!dataOrigin.ok) return dataOrigin

  const recordingDevice = optionalEntryIdentity(
    input.source.recordingDevice?.identity,
  )
  if (!recordingDevice.ok) return recordingDevice

  const resolved: ResolvedGraphIdentities = {
    sourceRecord: connected.value.sourceRecord,
    exchange: connected.value.exchange,
    observations,
    provenance: provenance.value,
    application: application.value,
    dataOrigin: dataOrigin.value,
    ...gateway.value,
    ...(recordingDevice.value === undefined ?
      {}
    : { recordingDevice: recordingDevice.value }),
  }
  const fullUrls = [
    ...resolved.observations.map(({ fullUrl }) => fullUrl),
    resolved.provenance.fullUrl,
    resolved.application.fullUrl,
    resolved.dataOrigin.fullUrl,
    resolved.distinctGatewayApplication?.fullUrl,
    resolved.recordingDevice?.fullUrl,
  ].filter((value) => value !== undefined)
  if (new Set(fullUrls).size !== fullUrls.length) {
    return issues([
      {
        severity: 'error',
        code: 'duplicate-identifier',
        path: [],
        message: 'Every Bundle entry requires a distinct business identifier.',
      },
    ])
  }
  return { ok: true, value: resolved }
}

/**
 * Builds one deterministic, profile-stamped R4 resource graph for the non-empty
 * subset of catalog-admitted outputs present in a connected-provider source
 * record. Every output shares one conversion Provenance. Raw native ids are
 * used only as digest input and are never emitted. Times, repository ids, and
 * the durable event sequence remain caller-owned; malformed inputs return
 * structured issues and no partial graph.
 */
export const buildProviderMeasurementBundle = (
  input: ProviderMeasurementBundleInput,
): Result<CollectionBundle> => {
  const parsed = parseProviderMeasurementBundleInput(input)
  if (!parsed.ok) return parsed
  const validatedInput = parsed.value

  const identities = resolveGraphIdentities(validatedInput)
  if (!identities.ok) return identities

  const observationEntries = []
  for (const [index, measurement] of validatedInput.measurements.entries()) {
    const identity = identities.value.observations[index]
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
    observationEntries.push(
      identifiedEntry(
        identity,
        makeObservation(
          validatedInput,
          measurement,
          identity,
          identities.value,
        ),
      ),
    )
  }
  const application = makeApplicationDevice(validatedInput.application)
  const distinctGatewayApplicationInput =
    validatedInput.gatewayApplication?.kind === 'distinct-application' ?
      validatedInput.gatewayApplication.application
    : undefined
  const distinctGatewayApplication =
    distinctGatewayApplicationInput === undefined ? undefined : (
      makeApplicationDevice(distinctGatewayApplicationInput)
    )
  const recordingDeviceInput = validatedInput.source.recordingDevice
  const recordingDevice =
    recordingDeviceInput === undefined ? undefined : (
      makeRecordingDevice(recordingDeviceInput)
    )
  const dataOrigin = makeApplicationDevice(validatedInput.source.dataOrigin)
  const provenance = makeProvenance(validatedInput, identities.value)
  const recordingDeviceEntries =
    (
      recordingDevice === undefined ||
      identities.value.recordingDevice === undefined
    ) ?
      []
    : [identifiedEntry(identities.value.recordingDevice, recordingDevice)]
  const entry = [
    ...observationEntries,
    ...recordingDeviceEntries,
    identifiedEntry(identities.value.dataOrigin, dataOrigin),
    ...((
      distinctGatewayApplication === undefined ||
      identities.value.distinctGatewayApplication === undefined
    ) ?
      []
    : [
        identifiedEntry(
          identities.value.distinctGatewayApplication,
          distinctGatewayApplication,
        ),
      ]),
    identifiedEntry(identities.value.application, application),
    identifiedEntry(identities.value.provenance, provenance),
  ]

  return parseCollectionBundle({
    resourceType: 'Bundle',
    ...(validatedInput.repositoryIds?.bundle === undefined ?
      {}
    : { id: validatedInput.repositoryIds.bundle }),
    meta: { profile: [PROFILES.mobileBundle] },
    identifier: identifier(identities.value.exchange),
    type: 'collection',
    timestamp: validatedInput.recorded,
    entry,
  })
}
