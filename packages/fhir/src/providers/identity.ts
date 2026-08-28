//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  providerAdapterCatalog,
  providerRawOutputDiscriminators,
  providerRawOutputRoles,
  providerScalarOutputDiscriminators,
  providerScalarOutputRoles,
} from './contract.generated.js'
import type {
  ConnectedProvider,
  ProviderScopeIdentifierInput,
} from './types.js'
import {
  cloneJsonValue,
  deepFreeze,
  err,
  ok,
  parseAbsoluteUri,
  type FhirId,
  type JsonValue,
  type Result,
} from '../core/index.js'
import {
  createEntryIdentity,
  deriveEntryNodeIdentifier,
  deriveEventIdentifier,
  deriveOpaqueIdentifier,
  isEventIdentityValue,
  validateDeploymentIdentity,
} from '../mobile/identity.js'
import { groveProfileClaims } from '../mobile/measurement-catalog.generated.js'
import type {
  ApplicationDeviceInput,
  CompleteIdentifierInput,
  DeploymentIdentityInput,
  IdentifiedEntryIdentityInput,
  RecordingDeviceInput,
} from '../mobile/types.js'

/** Resource kind only; graph participation roles never partition Device identity. */
export type DeviceSnapshotRole = 'application' | 'host' | 'recording-device'

const deviceSnapshotRoles: ReadonlySet<string> = new Set([
  'application',
  'host',
  'recording-device',
])

type JsonObject = Readonly<Record<string, JsonValue>>

const asJsonObject = (value: JsonValue | undefined): JsonObject | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ?
    (value as JsonObject)
  : undefined

const snapshotObject = (input: unknown): Result<JsonObject> => {
  const snapshot = cloneJsonValue(input)
  if (!snapshot.ok) return snapshot
  if (
    typeof snapshot.value !== 'object' ||
    snapshot.value === null ||
    Array.isArray(snapshot.value)
  ) {
    return err('invalid-type', 'Expected a complete identity input object.')
  }
  return ok(snapshot.value as JsonObject)
}

/** Derives an immutable event-scoped Device snapshot identity. */
export const deriveDeviceSnapshotEntryIdentity = (
  deployment: DeploymentIdentityInput,
  event: CompleteIdentifierInput,
  sourceDeviceToken: string,
  role: DeviceSnapshotRole,
  id?: import('../core/index.js').FhirId,
): Result<IdentifiedEntryIdentityInput> => {
  const safeDeployment = validateDeploymentIdentity(deployment)
  if (!safeDeployment.ok) return safeDeployment
  const safeEvent = snapshotObject(event)
  if (!safeEvent.ok) return safeEvent
  const eventSystem = safeEvent.value.system
  const eventValue = safeEvent.value.value
  const eventRole = safeEvent.value.role
  if (
    typeof sourceDeviceToken !== 'string' ||
    sourceDeviceToken.trim() === '' ||
    !deviceSnapshotRoles.has(role) ||
    eventSystem !== safeDeployment.value.eventIdentifierSystem ||
    eventRole !== 'event' ||
    typeof eventValue !== 'string' ||
    !isEventIdentityValue(eventValue) ||
    !eventValue.startsWith(`e2:${safeDeployment.value.producerInstance}:`)
  ) {
    return err(
      'invalid-identifier',
      "Device snapshot identity requires a nonblank token and this producer's complete typed event Identifier.",
    )
  }
  const identifier = deriveOpaqueIdentifier(
    safeDeployment.value,
    'device-snapshot',
    [eventSystem, eventValue, role, sourceDeviceToken],
  )
  if (!identifier.ok) return identifier
  return createEntryIdentity(identifier.value, id)
}

/** Derives an immutable event-scoped application Device snapshot identity. */
export const deriveApplicationEntryIdentity = (
  deployment: DeploymentIdentityInput,
  event: CompleteIdentifierInput,
  input: ApplicationDeviceInput,
): Result<IdentifiedEntryIdentityInput> => {
  const safeInput = snapshotObject(input)
  if (!safeInput.ok) return safeInput
  const sourceDeviceToken = safeInput.value.sourceDeviceToken
  const id = safeInput.value.id
  if (
    typeof sourceDeviceToken !== 'string' ||
    (id !== undefined && typeof id !== 'string')
  ) {
    return err(
      'invalid-identifier',
      'Application identity requires a source Device token and optional valid FHIR id.',
    )
  }
  return deriveDeviceSnapshotEntryIdentity(
    deployment,
    event,
    sourceDeviceToken,
    'application',
    id as FhirId | undefined,
  )
}

export interface RecordingDeviceGraphIdentity {
  readonly stableIdentifier: CompleteIdentifierInput
  /** Selected Bundle entry key for this immutable event-time Device snapshot. */
  readonly snapshot: IdentifiedEntryIdentityInput
}

/** Derives a stable per-unit recording Device identity from admitted instance evidence. */
export const deriveRecordingDeviceEntryIdentity = (
  deployment: DeploymentIdentityInput,
  event: CompleteIdentifierInput,
  adapterId: string,
  input: RecordingDeviceInput,
): Result<RecordingDeviceGraphIdentity> => {
  const safeInput = snapshotObject(input)
  if (!safeInput.ok) return safeInput
  const stableUnitToken = safeInput.value.stableUnitToken
  const subjectIdentifier = asJsonObject(safeInput.value.subjectIdentifier)
  const subjectSystem = subjectIdentifier?.system
  const subjectValue = subjectIdentifier?.value
  const id = safeInput.value.id
  const identityScope = safeInput.value.identityScope
  const disclosureAuthorization = safeInput.value.disclosureAuthorization
  const validIdentityScope =
    identityScope === 'deployment-scoped' ||
    (identityScope === 'authorized-hardware' &&
      disclosureAuthorization === 'authorized-for-exchange')
  if (
    typeof adapterId !== 'string' ||
    adapterId.trim() === '' ||
    !recordingDeviceAdapters.has(adapterId) ||
    typeof stableUnitToken !== 'string' ||
    stableUnitToken.trim() === '' ||
    typeof subjectSystem !== 'string' ||
    typeof subjectValue !== 'string' ||
    subjectValue.trim() === '' ||
    !parseAbsoluteUri(subjectSystem).ok ||
    (id !== undefined && typeof id !== 'string') ||
    !validIdentityScope
  ) {
    return err(
      'invalid-identifier',
      'Recording Device identity requires an adapter, a complete subject Identifier, and stable per-unit token.',
    )
  }
  const stableIdentifier = deriveOpaqueIdentifier(
    deployment,
    'recording-device',
    [adapterId, subjectSystem, subjectValue, stableUnitToken],
  )
  if (!stableIdentifier.ok) return stableIdentifier
  const snapshot = deriveDeviceSnapshotEntryIdentity(
    deployment,
    event,
    stableUnitToken,
    'recording-device',
    id as FhirId | undefined,
  )
  if (!snapshot.ok) return snapshot
  return ok({
    stableIdentifier: stableIdentifier.value,
    snapshot: snapshot.value,
  })
}

/** Optional writer-record lineage identity for a logical record assigned by an application. */
export const deriveWriterRecordIdentifier = (
  deployment: DeploymentIdentityInput,
  writerApplication: CompleteIdentifierInput,
  writerRecordId: string,
): Result<CompleteIdentifierInput> => {
  const safeWriter = snapshotObject(writerApplication)
  if (!safeWriter.ok) return safeWriter
  const writerSystem = safeWriter.value.system
  const writerValue = safeWriter.value.value
  const parsedWriterSystem = parseAbsoluteUri(writerSystem)
  if (
    !parsedWriterSystem.ok ||
    typeof writerValue !== 'string' ||
    writerValue.trim() === '' ||
    typeof writerRecordId !== 'string' ||
    writerRecordId.trim() === ''
  ) {
    return err(
      'invalid-identifier',
      'Writer identity requires a complete application Identifier and writer record id.',
    )
  }
  return deriveOpaqueIdentifier(deployment, 'writer-record', [
    parsedWriterSystem.value,
    writerValue,
    writerRecordId,
  ])
}

export type ProviderOutputIdentityInput =
  | {
      readonly kind: 'provider-artifact'
      readonly formatCode: string
      readonly partIndex: string
    }
  | {
      readonly kind: 'provider-output'
      readonly outputRole: string
      readonly outputDiscriminator: string
    }

export interface ProviderIdentityInput<
  Provider extends ConnectedProvider = ConnectedProvider,
> {
  readonly provider: Provider
  readonly providerScopeIdentifier: ProviderScopeIdentifierInput<Provider>
  readonly sourceType: string
  readonly sourceNativeId: string
  /** Closed catalog selectors; callers do not supply arbitrary values. */
  readonly outputs: readonly ProviderOutputIdentityInput[]
  readonly eventSequence: string
  readonly deployment: DeploymentIdentityInput
  readonly provenanceNodeRole?:
    'conversion-provenance' | 'retraction-provenance'
}

export interface ProviderIdentities {
  readonly sourceRecord: CompleteIdentifierInput
  readonly outputs: readonly CompleteIdentifierInput[]
  /** Sole business identifier for the exchange event and its Bundle. */
  readonly event: CompleteIdentifierInput
  /** Typed event-scoped node key for Provenance; not a business identifier. */
  readonly provenanceNode: CompleteIdentifierInput
}

const providerCodes: ReadonlySet<string> = new Set(
  providerAdapterCatalog.providers.map(({ id }) => id),
)

const recordingDeviceAdapters: ReadonlySet<string> = new Set([
  ...groveProfileClaims.adapterConversionProvenanceClaims.map(
    ({ adapter }) => adapter,
  ),
  ...providerCodes,
])

const providerOutputIdentity = (
  value: JsonValue,
): ProviderOutputIdentityInput | undefined => {
  const output = asJsonObject(value)
  if (output === undefined) return undefined
  const keys = Object.keys(output)
    .sort((left, right) => left.localeCompare(right))
    .join(',')
  if (
    output.kind === 'provider-output' &&
    keys === 'kind,outputDiscriminator,outputRole' &&
    typeof output.outputRole === 'string' &&
    output.outputRole.trim() !== '' &&
    typeof output.outputDiscriminator === 'string' &&
    output.outputDiscriminator.trim() !== ''
  ) {
    return {
      kind: output.kind,
      outputRole: output.outputRole,
      outputDiscriminator: output.outputDiscriminator,
    }
  }
  if (
    output.kind === 'provider-artifact' &&
    keys === 'formatCode,kind,partIndex' &&
    typeof output.formatCode === 'string' &&
    output.formatCode.trim() !== '' &&
    typeof output.partIndex === 'string' &&
    /^(?:0|[1-9]\d*)$/u.test(output.partIndex)
  ) {
    return {
      kind: output.kind,
      formatCode: output.formatCode,
      partIndex: output.partIndex,
    }
  }
  return undefined
}

const isProvenanceNodeRole = (
  value: JsonValue | undefined,
): value is 'conversion-provenance' | 'retraction-provenance' =>
  value === 'conversion-provenance' || value === 'retraction-provenance'

const admittedProviderOutput = (
  provider: string,
  sourceType: string,
  output: ProviderOutputIdentityInput,
): boolean => {
  const scalarMapping = (
    providerScalarOutputRoles as Readonly<
      Record<
        string,
        Readonly<Record<string, Readonly<Record<string, string>> | undefined>>
      >
    >
  )[provider]?.[sourceType]
  const rawRole = (
    providerRawOutputRoles as Readonly<
      Record<string, Readonly<Record<string, string>> | undefined>
    >
  )[provider]?.[sourceType]
  const rawDiscriminator = (
    providerRawOutputDiscriminators as Readonly<
      Record<string, Readonly<Record<string, string>> | undefined>
    >
  )[provider]?.[sourceType]
  if (output.kind === 'provider-artifact') {
    return (
      rawRole !== undefined &&
      output.formatCode === 'provider-recording' &&
      output.partIndex === '0'
    )
  }
  const scalarDiscriminators = (
    providerScalarOutputDiscriminators as Readonly<
      Record<
        string,
        Readonly<Record<string, Readonly<Record<string, string>> | undefined>>
      >
    >
  )[provider]?.[sourceType]
  if (rawRole === output.outputRole) {
    return rawDiscriminator === output.outputDiscriminator
  }
  if (scalarMapping === undefined || scalarDiscriminators === undefined) {
    return false
  }
  return Object.keys(scalarMapping).some(
    (measurementId) =>
      scalarMapping[measurementId] === output.outputRole &&
      scalarDiscriminators[measurementId] === output.outputDiscriminator,
  )
}

const admittedProviderSource = (
  provider: string,
  sourceType: string,
): boolean =>
  (
    providerScalarOutputRoles as Readonly<
      Record<string, Readonly<Record<string, unknown>> | undefined>
    >
  )[provider]?.[sourceType] !== undefined ||
  (
    providerRawOutputRoles as Readonly<
      Record<string, Readonly<Record<string, unknown>> | undefined>
    >
  )[provider]?.[sourceType] !== undefined

const providerSourceComponents = (
  input: ProviderIdentityInput,
): readonly [string, string, string, string, string] => [
  input.provider,
  input.sourceType,
  input.providerScopeIdentifier.system,
  input.providerScopeIdentifier.value,
  input.sourceNativeId,
]

interface AdmittedProviderSelector {
  readonly provider: ConnectedProvider
  readonly sourceType: string
}

const admittedProviderSelector = (
  provider: JsonValue | undefined,
  sourceType: JsonValue | undefined,
): AdmittedProviderSelector | undefined =>
  (
    typeof provider === 'string' &&
    providerCodes.has(provider) &&
    typeof sourceType === 'string' &&
    admittedProviderSource(provider, sourceType)
  ) ?
    { provider: provider as ConnectedProvider, sourceType }
  : undefined

const providerOutputsAreAdmitted = (
  provider: ConnectedProvider,
  sourceType: string,
  outputs: ReadonlyArray<ProviderOutputIdentityInput | undefined>,
  provenanceNodeRole: JsonValue | undefined,
): outputs is readonly ProviderOutputIdentityInput[] =>
  (outputs.length > 0 || provenanceNodeRole === 'retraction-provenance') &&
  outputs.every(
    (output) =>
      output !== undefined &&
      admittedProviderOutput(provider, sourceType, output),
  )

/** Internal closed-facade derivation of Provider business and graph-node identifiers. */
export const deriveProviderIdentities = (
  input: ProviderIdentityInput,
): Result<ProviderIdentities> => {
  const safeInput = snapshotObject(input)
  if (!safeInput.ok) return safeInput
  const value = safeInput.value
  const selector = admittedProviderSelector(value.provider, value.sourceType)
  const rawOutputs = value.outputs
  if (selector === undefined || !Array.isArray(rawOutputs)) {
    return err(
      'unsupported-measurement',
      'Provider identity selectors must match one exact pinned provider catalog row.',
      ['outputs'],
    )
  }
  const { provider, sourceType } = selector
  const parsedOutputs = rawOutputs.map(providerOutputIdentity)
  const provenanceNodeRole = value.provenanceNodeRole
  if (
    !providerOutputsAreAdmitted(
      provider,
      sourceType,
      parsedOutputs,
      provenanceNodeRole,
    )
  ) {
    return err(
      'unsupported-measurement',
      'Provider identity selectors must match one exact pinned provider catalog row.',
      ['outputs'],
    )
  }
  const typedOutputs = parsedOutputs
  const providerScope = asJsonObject(value.providerScopeIdentifier)
  const providerScopeSystem = parseAbsoluteUri(providerScope?.system)
  if (!providerScopeSystem.ok) {
    return err(
      'invalid-uri',
      'Provider scope Identifier.system must be an absolute URI.',
      ['providerScopeIdentifier', 'system'],
    )
  }
  const providerRow = providerAdapterCatalog.providers.find(
    ({ id }) => id === provider,
  )
  if (providerRow === undefined) {
    return err(
      'unsupported-measurement',
      'Provider identity selectors must match one exact pinned provider catalog row.',
      ['provider'],
    )
  }
  const expectedAssurance = providerRow.providerScopeMode
  if (
    typeof providerScope?.value !== 'string' ||
    providerScope.value.trim() === '' ||
    providerScope.assurance !== expectedAssurance ||
    sourceType.trim() === '' ||
    typeof value.sourceNativeId !== 'string' ||
    value.sourceNativeId.trim() === '' ||
    (provenanceNodeRole !== undefined &&
      !isProvenanceNodeRole(provenanceNodeRole))
  ) {
    return err(
      'invalid-identifier',
      'Provider identity inputs must be complete canonical values.',
    )
  }
  const normalizedProvenanceNodeRole =
    isProvenanceNodeRole(provenanceNodeRole) ? provenanceNodeRole : undefined
  const outputKeys = typedOutputs.map((output) => JSON.stringify(output))
  if (new Set(outputKeys).size !== outputKeys.length) {
    return err(
      'duplicate-identifier',
      'Provider output identity selectors must be unique.',
      ['outputs'],
    )
  }
  const deployment = validateDeploymentIdentity(value.deployment)
  if (!deployment.ok) return deployment

  const normalizedInput: ProviderIdentityInput = {
    provider: provider,
    providerScopeIdentifier: {
      system: providerScopeSystem.value,
      value: providerScope.value,
      assurance: expectedAssurance,
    },
    sourceType,
    sourceNativeId: value.sourceNativeId,
    outputs: typedOutputs,
    eventSequence:
      typeof value.eventSequence === 'string' ? value.eventSequence : '',
    deployment: deployment.value,
    ...(normalizedProvenanceNodeRole === undefined ?
      {}
    : { provenanceNodeRole: normalizedProvenanceNodeRole }),
  }
  const source = providerSourceComponents(normalizedInput)
  const sourceRecord = deriveOpaqueIdentifier(
    deployment.value,
    'provider-record',
    source,
  )
  if (!sourceRecord.ok) return sourceRecord

  const derivedOutputs: CompleteIdentifierInput[] = []
  for (const output of typedOutputs) {
    const derived =
      output.kind === 'provider-output' ?
        deriveOpaqueIdentifier(deployment.value, 'provider-output', [
          ...source,
          output.outputRole,
          output.outputDiscriminator,
        ])
      : deriveOpaqueIdentifier(deployment.value, 'provider-artifact', [
          ...source,
          output.formatCode,
          output.partIndex,
        ])
    if (!derived.ok) return derived
    derivedOutputs.push(derived.value)
  }

  const event = deriveEventIdentifier(
    deployment.value,
    normalizedInput.eventSequence,
  )
  if (!event.ok) return event
  const provenanceNode = deriveEntryNodeIdentifier(
    deployment.value,
    event.value,
    normalizedInput.provenanceNodeRole ?? 'conversion-provenance',
    '0',
  )
  if (!provenanceNode.ok) return provenanceNode

  return ok(
    deepFreeze({
      sourceRecord: sourceRecord.value,
      outputs: derivedOutputs,
      event: event.value,
      provenanceNode: provenanceNode.value,
    }) as unknown as ProviderIdentities,
  )
}
