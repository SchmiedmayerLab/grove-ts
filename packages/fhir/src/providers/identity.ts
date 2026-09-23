//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import type { ConnectedProvider, Writer, WriterRecord } from './types.js'
import { groveProfileClaims } from '../contract/measurement-catalog.generated.js'
import {
  providerAdapterCatalog,
  providerRawOutputDiscriminators,
  providerRawOutputRoles,
  providerScalarOutputDiscriminators,
  providerScalarOutputRoles,
} from '../contract/providers.generated.js'
import {
  collectResults,
  deepFreeze,
  err,
  issues,
  ok,
  parseIdentifierSystem,
  type EntryNodeOrdinal,
  type FhirId,
  type Issue,
  type Result,
} from '../core/index.js'
import {
  containsIsolatedSurrogate,
  createEntryIdentity,
  deriveEntryNodeIdentifier,
  deriveOpaqueIdentifier,
  deriveRecordIdentity,
  isEventOfScope,
  isOpaqueIdentityScope,
  parseRecordCoordinates,
  type ArtifactCoordinates,
  type BusinessIdentifier,
  type EntryIdentity,
  type EntryNodeIdentifier,
  type ExchangeEventIdentifier,
  type OpaqueIdentityScope,
  type OutputCoordinates,
  type RoledIdentifier,
} from '../mobile/identity.js'
import type {
  ApplicationDevice,
  HostDevice,
  RecordingDevice,
} from '../mobile/types.js'
import { groveRuleIssue } from '../r4/diagnostics.js'

/** Resource kind only; graph participation roles never partition Device identity. */
export type DeviceSnapshotRole = 'application' | 'host' | 'recording-device'

const PROVIDER_CODES: ReadonlySet<string> = new Set(
  providerAdapterCatalog.providers.map(({ id }) => id),
)

const recordingDeviceAdapters: ReadonlySet<string> = new Set([
  ...groveProfileClaims.adapterConversionProvenanceClaims.map(
    ({ adapter }) => adapter,
  ),
  ...PROVIDER_CODES,
])

const isNonBlank = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.trim() !== '' &&
  !containsIsolatedSurrogate(value)

const ordinal = (index: number): EntryNodeOrdinal =>
  String(index) as EntryNodeOrdinal

/**
 * The provider coordinate guard: a provider record opens with one catalog provider code, and a
 * provider code never opens a generic source record.
 */
export const providerCoordinateIssue = (
  kind: 'provider-record' | 'source-record',
  adapter: string,
): Issue | undefined => {
  if (kind === 'provider-record' && !PROVIDER_CODES.has(adapter)) {
    return {
      severity: 'error',
      code: 'invalid-code',
      path: ['providerCode'],
      message: 'A provider record requires one exact catalog provider code.',
    }
  }
  if (kind === 'source-record' && PROVIDER_CODES.has(adapter)) {
    return {
      severity: 'error',
      code: 'invalid-code',
      path: ['adapterId'],
      message: 'Provider coordinates require a provider record.',
    }
  }
  return undefined
}

/** The coordinates of one record at a connected provider. */
export interface ProviderRecordCoordinates {
  readonly providerCode: ConnectedProvider
  readonly sourceType: string
  readonly providerScope: BusinessIdentifier
  readonly nativeRecordId: string
}

/**
 * The opaque identity of one provider record, which its output and artifact identities extend.
 *
 * The scope and the record's coordinates stay private to it; only the identifier serializes.
 */
export interface ProviderRecordIdentity {
  /** The `provider-record` identifier, typed in the `source-record` role. */
  readonly identifier: RoledIdentifier
  /** Mints the `provider-output` identifier of one output this record yields. */
  readonly output: (coordinates: OutputCoordinates) => Result<RoledIdentifier>
  /** Mints the `provider-artifact` identifier of one part of a recording this record carries. */
  readonly artifact: (
    coordinates: ArtifactCoordinates,
  ) => Result<RoledIdentifier>
}

/** Derives the identity of one provider record; its outputs and artifacts mint through it. */
export const deriveProviderRecordIdentity = (
  scope: OpaqueIdentityScope,
  record: ProviderRecordCoordinates,
): Result<ProviderRecordIdentity> => {
  const components = parseRecordCoordinates('provider-record', record)
  if (!components.ok) return components
  const guard = providerCoordinateIssue('provider-record', components.value[0])
  if (guard !== undefined) return issues([guard])
  return deriveRecordIdentity(scope, 'provider-record', components.value)
}

/** Derives an immutable event-scoped Device snapshot identity. */
const deriveDeviceSnapshotEntryIdentity = (
  scope: OpaqueIdentityScope,
  event: ExchangeEventIdentifier,
  sourceDeviceToken: string,
  role: DeviceSnapshotRole,
  id?: FhirId,
): Result<EntryIdentity> => {
  if (!isNonBlank(sourceDeviceToken)) {
    return err(
      'invalid-identifier',
      'Device snapshot identity requires a non-blank source device token.',
    )
  }
  if (!isOpaqueIdentityScope(scope) || !isEventOfScope(scope, event)) {
    return err(
      'invalid-identifier',
      "Device snapshot identity requires this producer's complete typed event Identifier.",
    )
  }
  const identifier = deriveOpaqueIdentifier(scope, 'device-snapshot', [
    event.system,
    event.value,
    role,
    sourceDeviceToken,
  ])
  if (!identifier.ok) return identifier
  return createEntryIdentity(identifier.value, id)
}

export const deriveApplicationEntryIdentity = (
  scope: OpaqueIdentityScope,
  event: ExchangeEventIdentifier,
  application: ApplicationDevice | Writer,
  id?: FhirId,
): Result<EntryIdentity> =>
  deriveDeviceSnapshotEntryIdentity(
    scope,
    event,
    application.sourceDeviceToken,
    'application',
    id,
  )

export const deriveHostEntryIdentity = (
  scope: OpaqueIdentityScope,
  event: ExchangeEventIdentifier,
  host: HostDevice,
  id?: FhirId,
): Result<EntryIdentity> =>
  deriveDeviceSnapshotEntryIdentity(
    scope,
    event,
    host.sourceDeviceToken,
    'host',
    id,
  )

export interface RecordingDeviceGraphIdentity {
  readonly stableIdentifier: RoledIdentifier
  /** Selected Bundle entry key for this immutable event-time Device snapshot. */
  readonly snapshot: EntryIdentity
}

/** Derives a stable per-unit recording Device identity and its event snapshot. */
export const deriveRecordingDeviceEntryIdentity = (
  scope: OpaqueIdentityScope,
  event: ExchangeEventIdentifier,
  adapterId: string,
  subject: BusinessIdentifier,
  device: RecordingDevice,
  id?: FhirId,
): Result<RecordingDeviceGraphIdentity> => {
  if (
    !recordingDeviceAdapters.has(adapterId) ||
    !isNonBlank(device.stableUnitToken) ||
    !parseIdentifierSystem(subject.system).ok ||
    !isNonBlank(subject.value)
  ) {
    return err(
      'invalid-identifier',
      'Recording Device identity requires an adapter, a complete subject Identifier, and stable per-unit token.',
    )
  }
  const stableIdentifier = deriveOpaqueIdentifier(scope, 'recording-device', [
    adapterId,
    subject.system,
    subject.value,
    device.stableUnitToken,
  ])
  if (!stableIdentifier.ok) return stableIdentifier
  const snapshot = deriveDeviceSnapshotEntryIdentity(
    scope,
    event,
    device.stableUnitToken,
    'recording-device',
    id,
  )
  if (!snapshot.ok) return snapshot
  return ok({
    stableIdentifier: stableIdentifier.value,
    snapshot: snapshot.value,
  })
}

/** Optional writer-record lineage identity for a logical record assigned by an application. */
export const deriveWriterRecordIdentifier = (
  scope: OpaqueIdentityScope,
  writer: WriterRecord,
): Result<RoledIdentifier> =>
  deriveOpaqueIdentifier(scope, 'writer-record', [
    writer.applicationIdentifier.system,
    writer.applicationIdentifier.value,
    writer.nativeRecordId,
  ])

export type ProviderOutputIdentityInput =
  | (ArtifactCoordinates & { readonly kind: 'provider-artifact' })
  | (OutputCoordinates & { readonly kind: 'provider-output' })

export interface ProviderIdentityInput<
  Provider extends ConnectedProvider = ConnectedProvider,
> {
  readonly provider: Provider
  readonly repositoryScope: BusinessIdentifier
  readonly sourceType: string
  readonly sourceNativeId: string
  /** Closed catalog selectors; callers do not supply arbitrary values. */
  readonly outputs: readonly ProviderOutputIdentityInput[]
  readonly event: ExchangeEventIdentifier
  readonly scope: OpaqueIdentityScope
  readonly provenanceNodeRole?:
    'conversion-provenance' | 'retraction-provenance' | undefined
}

export interface ProviderIdentities {
  readonly sourceRecord: RoledIdentifier
  readonly outputs: readonly RoledIdentifier[]
  /** Sole business identifier for the exchange event and its Bundle. */
  readonly event: ExchangeEventIdentifier
  /** Typed event-scoped node key for Provenance; not a business identifier. */
  readonly provenanceNode: EntryNodeIdentifier
}

type StringTable = Readonly<
  Record<string, Readonly<Record<string, string>> | undefined>
>
type NestedStringTable = Readonly<Record<string, StringTable | undefined>>

const scalarRoles = providerScalarOutputRoles as NestedStringTable
const scalarDiscriminators =
  providerScalarOutputDiscriminators as NestedStringTable
const rawRoles = providerRawOutputRoles as StringTable
const rawDiscriminators = providerRawOutputDiscriminators as StringTable

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const OUTPUT_SELECTOR_KEYS: Readonly<Record<string, readonly string[]>> = {
  'provider-artifact': ['kind', 'formatCode', 'partIndex'],
  'provider-output': ['kind', 'role', 'discriminator'],
}

const isClosedSelector = (candidate: Record<string, unknown>): boolean => {
  const keys = OUTPUT_SELECTOR_KEYS[String(candidate.kind)]
  return (
    keys !== undefined &&
    Object.keys(candidate).every((key) => keys.includes(key)) &&
    keys.every((key) => typeof candidate[key] === 'string')
  )
}

const admittedProviderOutput = (
  provider: string,
  sourceType: string,
  output: ProviderOutputIdentityInput,
): boolean => {
  const candidate: unknown = output
  if (!isRecord(candidate) || !isClosedSelector(candidate)) return false
  const rawRole = rawRoles[provider]?.[sourceType]
  if (output.kind === 'provider-artifact') {
    return (
      rawRole !== undefined &&
      output.formatCode === 'provider-recording' &&
      output.partIndex === '0'
    )
  }
  if (rawRole === output.role) {
    return rawDiscriminators[provider]?.[sourceType] === output.discriminator
  }
  const mapping = scalarRoles[provider]?.[sourceType]
  const discriminators = scalarDiscriminators[provider]?.[sourceType]
  return (
    mapping !== undefined &&
    discriminators !== undefined &&
    Object.keys(mapping).some(
      (measurementId) =>
        mapping[measurementId] === output.role &&
        discriminators[measurementId] === output.discriminator,
    )
  )
}

const admittedProviderSource = (
  provider: string,
  sourceType: string,
): boolean =>
  scalarRoles[provider]?.[sourceType] !== undefined ||
  rawRoles[provider]?.[sourceType] !== undefined

const selectorIssues = (input: ProviderIdentityInput): readonly Issue[] => {
  if (
    !PROVIDER_CODES.has(input.provider) ||
    !admittedProviderSource(input.provider, input.sourceType)
  ) {
    return [
      groveRuleIssue(
        'mobile-input.unsupported-source-type',
        ['source', 'sourceType'],
        {
          message: `${input.provider}/${input.sourceType} is not a source the Provider catalog admits.`,
        },
      ),
    ]
  }
  const findings: Issue[] = []
  const nodeRole: unknown = input.provenanceNodeRole
  if (
    nodeRole !== undefined &&
    nodeRole !== 'conversion-provenance' &&
    nodeRole !== 'retraction-provenance'
  ) {
    return [
      groveRuleIssue(
        'mobile-input.value-shape-invalid',
        ['provenanceNodeRole'],
        { message: 'The Provenance node role is one of the two closed roles.' },
      ),
    ]
  }
  const outputs: unknown = input.outputs
  if (
    !Array.isArray(outputs) ||
    (outputs.length === 0 &&
      input.provenanceNodeRole !== 'retraction-provenance')
  ) {
    findings.push(
      groveRuleIssue('mobile-input.unsupported-source-value', ['outputs'], {
        message:
          'An active event derives at least one catalog-admitted output.',
      }),
    )
    return findings
  }
  for (const [index, output] of input.outputs.entries()) {
    if (!admittedProviderOutput(input.provider, input.sourceType, output)) {
      findings.push(
        groveRuleIssue(
          'mobile-input.unsupported-source-value',
          ['outputs', index],
          {
            message: `${input.provider}/${input.sourceType} does not admit the selected output.`,
          },
        ),
      )
    }
  }
  const keys = input.outputs.map((output) => JSON.stringify(output))
  if (new Set(keys).size !== keys.length) {
    findings.push(
      groveRuleIssue('mobile-input.value-shape-invalid', ['outputs'], {
        message: 'Provider output identity selectors must be unique.',
      }),
    )
  }
  if (!isNonBlank(input.sourceNativeId)) {
    findings.push(
      groveRuleIssue(
        'mobile-input.native-identifier-invalid',
        ['source', 'sourceNativeId'],
        {
          message: 'The source-native record identifier is blank.',
        },
      ),
    )
  }
  return findings
}

/** Internal closed-facade derivation of Provider business and graph-node identifiers. */
export const deriveProviderIdentities = (
  input: ProviderIdentityInput,
): Result<ProviderIdentities> => {
  const candidate: unknown = input
  if (
    !isRecord(candidate) ||
    !isRecord(candidate.repositoryScope) ||
    !isRecord(candidate.event)
  ) {
    return err(
      'invalid-type',
      'Provider identity derivation takes one complete input object.',
    )
  }
  const findings = selectorIssues(input)
  if (findings.length > 0) return issues(findings)
  if (
    !parseIdentifierSystem(input.repositoryScope.system).ok ||
    !isNonBlank(input.repositoryScope.value)
  ) {
    return err(
      'invalid-identifier',
      'The repository scope must be one complete absolute-system Identifier.',
      ['repositoryScope'],
    )
  }
  if (
    !isOpaqueIdentityScope(input.scope) ||
    !isEventOfScope(input.scope, input.event)
  ) {
    return err(
      'invalid-identifier',
      "The event identifier must be one this context's identity scope minted.",
      ['event'],
    )
  }
  const record = deriveProviderRecordIdentity(input.scope, {
    providerCode: input.provider,
    sourceType: input.sourceType,
    providerScope: input.repositoryScope,
    nativeRecordId: input.sourceNativeId,
  })
  if (!record.ok) return record
  const outputs = collectResults(
    input.outputs.map((output) =>
      output.kind === 'provider-output' ?
        record.value.output({
          role: output.role,
          discriminator: output.discriminator,
        })
      : record.value.artifact({
          formatCode: output.formatCode,
          partIndex: output.partIndex,
        }),
    ),
  )
  if (!outputs.ok) return outputs
  const provenanceNode = deriveEntryNodeIdentifier(input.scope, {
    event: input.event,
    role: input.provenanceNodeRole ?? 'conversion-provenance',
    ordinal: ordinal(0),
  })
  if (!provenanceNode.ok) return provenanceNode
  return ok(
    deepFreeze({
      sourceRecord: record.value.identifier,
      outputs: outputs.value,
      event: input.event,
      provenanceNode: provenanceNode.value,
    }),
  )
}

/** The entry-node identity of the ordinal-th entry keyed by one node role. */
export const deriveEntryNodeEntryIdentity = (
  scope: OpaqueIdentityScope,
  event: ExchangeEventIdentifier,
  role: string,
  index: number,
  id?: FhirId,
): Result<EntryIdentity> => {
  const identifier = deriveEntryNodeIdentifier(scope, {
    event,
    role,
    ordinal: ordinal(index),
  })
  if (!identifier.ok) return identifier
  return createEntryIdentity(identifier.value, id)
}
