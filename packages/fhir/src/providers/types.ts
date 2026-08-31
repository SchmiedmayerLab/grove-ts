//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import type { SharedMobileMeasurementKind } from '../contract/measurement-catalog.generated.js'
import type {
  AdapterMeasurementCatalog,
  ProviderRawOutputRoles,
  ProviderScalarOutputRoles,
} from '../contract/providers.generated.js'
import type { AbsoluteUri, FhirId, FhirInstant } from '../core/index.js'
import type {
  ApplicationDeviceInput,
  CompleteIdentifierInput,
  DeploymentIdentityInput,
  GatewayApplicationInput,
  InstantEffectiveTime,
  MobileMeasurement,
  PeriodEffectiveTime,
  RecordingDeviceInput,
  RecordingMethod,
} from '../mobile/types.js'

type ScalarOutputRoles = ProviderScalarOutputRoles

/** Deployment-owned pseudonym for a provider whose native keys are account-scoped. */
export interface ProviderAccountScopeIdentifierInput extends CompleteIdentifierInput {
  readonly assurance: 'deployment-scoped-account-pseudonym'
}

/** Authoritative global provider key-space asserted for globally unique native keys. */
export interface ProviderGlobalScopeIdentifierInput extends CompleteIdentifierInput {
  readonly assurance: 'documented-global-key-space'
}

/** Identifier-only Patient reference; the pseudonym is intentionally carried in emitted FHIR. */
export interface ProviderPatientReferenceInput {
  readonly type: 'Patient'
  readonly identifier: CompleteIdentifierInput & {
    readonly assurance: 'deployment-scoped-pseudonym'
  }
}

/** Identifier-only ResearchStudy reference; no unresolved literal is emitted. */
export interface ProviderResearchStudyReferenceInput {
  readonly type: 'ResearchStudy'
  readonly identifier: CompleteIdentifierInput
}

/** Exact closed provider codes defined by the Provider IG. */
export type ConnectedProvider = keyof ScalarOutputRoles

/** Exact source tokens that contain at least one admitted scalar mapping. */
export type ConnectedSourceType<Provider extends ConnectedProvider> =
  keyof ScalarOutputRoles[Provider] & string

export type SupportedConnectedProviderMeasurementKind<
  Provider extends ConnectedProvider,
  SourceType extends ConnectedSourceType<Provider> =
    ConnectedSourceType<Provider>,
> = keyof ScalarOutputRoles[Provider][SourceType] & string

type ProviderContractRow<Provider extends ConnectedProvider> = Extract<
  (typeof import('../contract/providers.generated.js').providerAdapterCatalog)['providers'][number],
  { readonly id: Provider }
>

type ProviderIdentifierScope<Provider extends ConnectedProvider> =
  ProviderContractRow<Provider>['identifierScope']

type ProviderScopeMode<Provider extends ConnectedProvider> =
  ProviderContractRow<Provider> extends (
    {
      readonly providerScopeMode: infer Mode extends
        'deployment-scoped-account-pseudonym' | 'documented-global-key-space'
    }
  ) ?
    Mode
  : ProviderIdentifierScope<Provider> extends 'account' ?
    'deployment-scoped-account-pseudonym'
  : 'documented-global-key-space'

/**
 * Complete provider-scope pair required by the Provider identity protocol.
 * Account-scoped providers use a deployment pseudonym; globally unique providers use one
 * documented global key-space pair, so identity does not fragment across accounts.
 */
export type ProviderScopeIdentifierInput<
  Provider extends ConnectedProvider = ConnectedProvider,
> =
  Provider extends ConnectedProvider ?
    ProviderScopeMode<Provider> extends 'deployment-scoped-account-pseudonym' ?
      ProviderAccountScopeIdentifierInput
    : ProviderGlobalScopeIdentifierInput
  : never

type ProviderMeasurementOwner<Provider extends ConnectedProvider> =
  ProviderContractRow<Provider> extends (
    {
      readonly measurementOwner: infer Owner extends string
    }
  ) ?
    Owner
  : never

type ExclusiveCatalogFor<Provider extends ConnectedProvider> =
  ProviderMeasurementOwner<Provider> extends keyof AdapterMeasurementCatalog ?
    AdapterMeasurementCatalog[ProviderMeasurementOwner<Provider>]
  : never

/** Provider-owned measurement ids that intentionally have no source-neutral Mobile profile. */
export type ProviderExclusiveMeasurementKind<
  Provider extends ConnectedProvider,
> = keyof ExclusiveCatalogFor<Provider> & string

type ExclusiveDefinition<
  Provider extends ConnectedProvider,
  Kind extends ProviderExclusiveMeasurementKind<Provider>,
> = ExclusiveCatalogFor<Provider>[Kind]

type ExclusiveEffective<Definition> =
  Definition extends { readonly effective: 'Period' } ? PeriodEffectiveTime
  : Definition extends { readonly effective: 'dateTime' } ? InstantEffectiveTime
  : Definition extends { readonly effective: 'dateTime-or-Period' } ?
    InstantEffectiveTime | PeriodEffectiveTime
  : never

type ExclusiveResult<Definition> =
  Definition extends { readonly valueKind: 'quantity' } ?
    { readonly value: number }
  : Definition extends (
    {
      readonly valueKind: 'codeableConcept'
      readonly allowedValues: ReadonlyArray<infer Value extends string>
    }
  ) ?
    { readonly value: Value }
  : never

/** Exact normalized input for one provider-owned structured measurement profile. */
export type ProviderExclusiveMeasurement<
  Provider extends ConnectedProvider,
  Kind extends ProviderExclusiveMeasurementKind<Provider> =
    ProviderExclusiveMeasurementKind<Provider>,
> =
  Kind extends ProviderExclusiveMeasurementKind<Provider> ?
    {
      readonly kind: Kind
      readonly effective: ExclusiveEffective<
        ExclusiveDefinition<Provider, Kind>
      >
    } & ExclusiveResult<ExclusiveDefinition<Provider, Kind>>
  : never

type ProviderMeasurementForKind<
  Provider extends ConnectedProvider,
  Kind extends string,
> =
  | Extract<
      MobileMeasurement,
      { readonly kind: Kind & SharedMobileMeasurementKind }
    >
  | (Kind extends ProviderExclusiveMeasurementKind<Provider> ?
      ProviderExclusiveMeasurement<Provider, Kind>
    : never)

export type ConnectedProviderMeasurement<
  Provider extends ConnectedProvider,
  SourceType extends ConnectedSourceType<Provider>,
> = {
  readonly [
    Kind in SupportedConnectedProviderMeasurementKind<Provider, SourceType>
  ]: ProviderMeasurementForKind<Provider, Kind>
}[SupportedConnectedProviderMeasurementKind<Provider, SourceType>]

export interface ProviderAdapter<
  Provider extends ConnectedProvider = ConnectedProvider,
> {
  readonly kind: 'providers'
  readonly provider: Provider
}

interface NormalizedSourceRecordBase {
  readonly recordingMethod?: RecordingMethod
  readonly recordingDevice?: RecordingDeviceInput
  /** Optional logical identity assigned by the application that wrote the source record. */
  readonly writerRecord?: WriterRecordInput
}

export interface WriterRecordInput {
  readonly applicationIdentifier: CompleteIdentifierInput
  readonly nativeRecordId: string
  /** Canonical non-negative writer revision, when the source exposes one. */
  readonly version?: string
}

/** Optional FHIR type coding for a deliberately disclosed source-native Identifier. */
export interface GovernedSourceIdentifierTypeCodingInput {
  readonly system: AbsoluteUri
  readonly code: string
  readonly display?: string
}

/** Narrow CodeableConcept surface for an optional source-native Identifier.type. */
export interface GovernedSourceIdentifierTypeInput {
  readonly coding?: readonly [
    GovernedSourceIdentifierTypeCodingInput,
    ...GovernedSourceIdentifierTypeCodingInput[],
  ]
  readonly text?: string
}

/**
 * Explicit opt-in to place the exact source-native value under a caller-governed key-space URI.
 * This traceability Identifier supplements Grove identities and is never an entry/retraction key.
 */
export interface GovernedSourceIdentifierInput {
  readonly system: AbsoluteUri
  readonly nativeId: string
  readonly type?: GovernedSourceIdentifierTypeInput
}

/**
 * Source identity fields. The native id is HMAC input and omitted by default;
 * an eligible graph may disclose it only through the explicit governed
 * top-level configuration. The provider scope must match the catalog: a deployment-owned
 * account pseudonym for account-scoped keys, or the documented global key-space pair for
 * globally unique keys. An email, access credential, or inferred scope is invalid.
 */
export interface ProviderSourceRecord<
  Provider extends ConnectedProvider,
  SourceType extends ConnectedSourceType<Provider>,
> extends NormalizedSourceRecordBase {
  readonly adapter: ProviderAdapter<Provider>
  readonly providerScopeIdentifier: ProviderScopeIdentifierInput<Provider>
  readonly sourceType: SourceType
  readonly sourceNativeId: string
  /** Application that entered the record into the connected provider. */
  readonly dataOrigin: ApplicationDeviceInput
}

export type ConnectedProviderMeasurements<
  Provider extends ConnectedProvider,
  SourceType extends ConnectedSourceType<Provider>,
> = readonly [
  ConnectedProviderMeasurement<Provider, SourceType>,
  ...Array<ConnectedProviderMeasurement<Provider, SourceType>>,
]

export interface ConnectedProviderRecord<
  Provider extends ConnectedProvider,
  SourceType extends ConnectedSourceType<Provider>,
> {
  /** Non-empty unique subset of catalog-admitted outputs for one source record. */
  readonly measurements: ConnectedProviderMeasurements<Provider, SourceType>
  readonly source: ProviderSourceRecord<Provider, SourceType>
}

type ConnectedProviderRecordFor<Provider extends ConnectedProvider> = {
  readonly [
    SourceType in ConnectedSourceType<Provider>
  ]: ConnectedProviderRecord<Provider, SourceType>
}[ConnectedSourceType<Provider>]

/** Provider-neutral output of an external adapter, before FHIR construction. */
export type NormalizedProviderRecord = {
  readonly [Provider in ConnectedProvider]: ConnectedProviderRecordFor<Provider>
}[ConnectedProvider]

export type NormalizedSourceRecord = NormalizedProviderRecord['source']

type RawOutputRoles = ProviderRawOutputRoles

/** Providers with at least one source admitted as a native Sensor recording. */
export type ConnectedRawProvider = keyof RawOutputRoles

/** Exact provider source tokens admitted by the Provider raw contract. */
export type ConnectedRawSourceType<Provider extends ConnectedRawProvider> =
  keyof RawOutputRoles[Provider] & string

declare const recordingInputBrand: unique symbol

/** Canonically padded RFC 4648 base64 containing at least one byte. */
export type CanonicalBase64 = string & {
  readonly [recordingInputBrand]: 'CanonicalBase64'
}

/** Base64-encoded 20-byte SHA-1 digest required by FHIR R4 Attachment.hash. */
export type Sha1Base64 = string & {
  readonly [recordingInputBrand]: 'Sha1Base64'
}

/** A syntactically valid media type without content-transfer parameters. */
export type MediaType = string & {
  readonly [recordingInputBrand]: 'MediaType'
}

/** Caller-asserted immutable, version-specific HTTP(S) recording URL. */
export type ImmutableRecordingUrl = string & {
  readonly [recordingInputBrand]: 'ImmutableRecordingUrl'
}

export interface ProviderRecordingSourceRecord<
  Provider extends ConnectedRawProvider,
  SourceType extends ConnectedRawSourceType<Provider>,
> {
  readonly adapter: ProviderAdapter<Provider>
  readonly providerScopeIdentifier: ProviderScopeIdentifierInput<Provider>
  readonly sourceType: SourceType
  /**
   * Opaque-identity digest input. Omitted from FHIR by default; governed
   * disclosure may place it on the sole source DocumentReference.
   */
  readonly sourceNativeId: string
  /** Application that entered the already-obtained record at the provider. */
  readonly dataOrigin: ApplicationDeviceInput
  readonly writerRecord?: WriterRecordInput
}

interface RecordingAttachmentBaseInput {
  readonly contentType: MediaType
  /** Optional human-facing presentation text; it never participates in identity. */
  readonly title?: string
  /** Registered payload format the recording bytes conform to. */
  readonly format: ProviderRecordingFormat
  /** Required deployment assertion for opaque content Grove cannot inspect. */
  readonly payloadAssertion: RawPayloadAdmissionAssertion
}

export type ProviderRecordingFormat =
  import('../contract/providers.generated.js').ProviderRecordingFormat

export type RawPayloadAdmissionAssertion =
  (typeof import('../contract/providers.generated.js').providerAdapterCatalog)['rawPayloadAdmission']['allowedAssertions'][number]

export interface EmbeddedRecordingAttachmentInput extends RecordingAttachmentBaseInput {
  readonly kind: 'embedded'
  /** Exact caller-supplied bytes represented as canonical RFC 4648 base64. */
  readonly dataBase64: CanonicalBase64
}

export interface ExternalRecordingAttachmentInput extends RecordingAttachmentBaseInput {
  readonly kind: 'external'
  readonly url: ImmutableRecordingUrl
  readonly size: number
  readonly hash: Sha1Base64
  readonly immutabilityAssurance: 'immutable-version-specific'
}

export type ProviderRecordingAttachmentInput =
  EmbeddedRecordingAttachmentInput | ExternalRecordingAttachmentInput

export type ProviderRecordingSource = {
  readonly [Provider in ConnectedRawProvider]: {
    readonly [
      SourceType in ConnectedRawSourceType<Provider>
    ]: ProviderRecordingSourceRecord<Provider, SourceType>
  }[ConnectedRawSourceType<Provider>]
}[ConnectedRawProvider]

export interface RecordingRepositoryAssignedResourceIds {
  readonly bundle?: FhirId
  readonly document?: FhirId
  readonly provenance?: FhirId
}

/** Closed input for one mapped-standard Provider native recording. */
export interface ProviderRecordingBundleInput {
  readonly source: ProviderRecordingSource
  readonly attachment: ProviderRecordingAttachmentInput
  readonly subject: ProviderPatientReferenceInput
  readonly application: ApplicationDeviceInput
  /** Durable caller-owned sequence for a new conversion/exchange event. */
  readonly eventSequence: string
  /** Deployment-owned, key-epoch-specific HMAC identity configuration. */
  readonly deploymentIdentity: DeploymentIdentityInput
  readonly nativeIdentifierDisclosure?: GovernedSourceIdentifierInput
  readonly documentDate: FhirInstant
  /** Source activity time carried on conversion Provenance.occurred[x]. */
  readonly occurred: FhirInstant
  readonly recorded: FhirInstant
  /** Time the immutable exchange graph was assembled (Bundle.timestamp). */
  readonly assembled: FhirInstant
  readonly repositoryIds?: RecordingRepositoryAssignedResourceIds
}

export interface MeasurementRepositoryAssignedResourceIds {
  readonly bundle?: FhirId
  readonly observations?: Readonly<
    Partial<Record<ConnectedProviderMeasurementKind, FhirId>>
  >
  readonly provenance?: FhirId
}

/** Every shared or provider-owned measurement kind admitted by a connected source row. */
export type ConnectedProviderMeasurementKind = {
  readonly [Provider in ConnectedProvider]: {
    readonly [
      SourceType in ConnectedSourceType<Provider>
    ]: SupportedConnectedProviderMeasurementKind<Provider, SourceType>
  }[ConnectedSourceType<Provider>]
}[ConnectedProvider]

interface ProviderMeasurementGraphInput {
  readonly subject: ProviderPatientReferenceInput
  readonly application: ApplicationDeviceInput
  readonly gatewayApplication?: GatewayApplicationInput
  /** Durable caller-owned sequence for a new conversion/exchange event. */
  readonly eventSequence: string
  /** Deployment-owned, key-epoch-specific HMAC identity configuration. */
  readonly deploymentIdentity: DeploymentIdentityInput
  readonly nativeIdentifierDisclosure?: GovernedSourceIdentifierInput
  /** Source activity time carried on conversion Provenance.occurred[x]. */
  readonly occurred: FhirInstant
  readonly recorded: FhirInstant
  /** Time the immutable exchange graph was assembled (Bundle.timestamp). */
  readonly assembled: FhirInstant
  readonly repositoryIds?: MeasurementRepositoryAssignedResourceIds
  readonly researchStudyReferences?: readonly ProviderResearchStudyReferenceInput[]
}

export type ProviderMeasurementBundleInput = NormalizedProviderRecord &
  ProviderMeasurementGraphInput
