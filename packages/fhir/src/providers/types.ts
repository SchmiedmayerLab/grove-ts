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
import type { Branded, Issue } from '../core/index.js'
import type { BusinessIdentifier } from '../mobile/identity.js'
import type {
  ApplicationDevice,
  ExchangeGraphIdentifiers,
  GovernedSourceIdentifierDisclosurePolicy,
  InstantEffectiveTime,
  MobileMeasurement,
  PeriodEffectiveTime,
  RecordingDevice,
  RecordingMethod,
} from '../mobile/types.js'
import type { ExchangeGraph } from '../r4/types.js'

type ScalarOutputRoles = ProviderScalarOutputRoles

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

/** The logical record identity the application that wrote the source record assigned. */
export interface WriterRecord {
  readonly applicationIdentifier: BusinessIdentifier
  readonly nativeRecordId: string
  /** Canonical non-negative writer revision, when the source exposes one. */
  readonly version?: string | undefined
}

interface NormalizedSourceRecordBase {
  readonly recordingMethod?: RecordingMethod | undefined
  readonly recordingDevice?: RecordingDevice | undefined
  readonly writerRecord?: WriterRecord | undefined
}

/**
 * Source identity fields. The native id is HMAC input and omitted by default; an eligible
 * graph discloses it only through the conversion options' disclosure policy. The record's
 * provider scope is the context's repository scope: a deployment-owned account pseudonym
 * for account-scoped keys, or the documented global key-space pair for globally unique keys.
 */
export interface ProviderSourceRecord<
  Provider extends ConnectedProvider,
  SourceType extends ConnectedSourceType<Provider>,
> extends NormalizedSourceRecordBase {
  readonly adapter: ProviderAdapter<Provider>
  readonly sourceType: SourceType
  readonly sourceNativeId: string
  /** The application that entered the record at the connected provider. */
  readonly writer: ApplicationDevice
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

/** Canonically padded RFC 4648 base64 containing at least one byte. */
export type CanonicalBase64 = Branded<'CanonicalBase64'>

/** Base64-encoded 20-byte SHA-1 digest required by FHIR R4 Attachment.hash. */
export type Sha1Base64 = Branded<'Sha1Base64'>

/** A syntactically valid media type without content-transfer parameters. */
export type MediaType = Branded<'MediaType'>

/** Caller-asserted immutable, version-specific HTTP(S) recording URL. */
export type ImmutableRecordingUrl = Branded<'ImmutableRecordingUrl'>

export interface ProviderRecordingSourceRecord<
  Provider extends ConnectedRawProvider,
  SourceType extends ConnectedRawSourceType<Provider>,
> {
  readonly adapter: ProviderAdapter<Provider>
  readonly sourceType: SourceType
  /** Opaque-identity digest input, disclosed only through the conversion options. */
  readonly sourceNativeId: string
  /** The application that entered the already-obtained record at the provider. */
  readonly writer: ApplicationDevice
  /** The source activity time the recording covers. */
  readonly effective: InstantEffectiveTime | PeriodEffectiveTime
  readonly writerRecord?: WriterRecord | undefined
}

interface RecordingAttachmentBase {
  readonly contentType: MediaType
  /** Optional human-facing presentation text; it never participates in identity. */
  readonly title?: string | undefined
  /** Registered payload format the recording bytes conform to. */
  readonly format: ProviderRecordingFormat
  /** Required deployment assertion for opaque content Grove cannot inspect. */
  readonly payloadAssertion: RawPayloadAdmissionAssertion
}

export type ProviderRecordingFormat =
  import('../contract/providers.generated.js').ProviderRecordingFormat

export type RawPayloadAdmissionAssertion =
  (typeof import('../contract/providers.generated.js').providerAdapterCatalog)['rawPayloadAdmission']['allowedAssertions'][number]

export interface EmbeddedRecordingAttachment extends RecordingAttachmentBase {
  readonly kind: 'embedded'
  /** Exact caller-supplied bytes represented as canonical RFC 4648 base64. */
  readonly dataBase64: CanonicalBase64
}

export interface ExternalRecordingAttachment extends RecordingAttachmentBase {
  readonly kind: 'external'
  readonly url: ImmutableRecordingUrl
  readonly size: number
  readonly hash: Sha1Base64
  readonly immutabilityAssurance: 'immutable-version-specific'
}

export type ProviderRecordingAttachment =
  EmbeddedRecordingAttachment | ExternalRecordingAttachment

export type ProviderRecordingSource = {
  readonly [Provider in ConnectedRawProvider]: {
    readonly [
      SourceType in ConnectedRawSourceType<Provider>
    ]: ProviderRecordingSourceRecord<Provider, SourceType>
  }[ConnectedRawSourceType<Provider>]
}[ConnectedRawProvider]

/** Every shared or provider-owned measurement kind admitted by a connected source row. */
export type ConnectedProviderMeasurementKind = {
  readonly [Provider in ConnectedProvider]: {
    readonly [
      SourceType in ConnectedSourceType<Provider>
    ]: SupportedConnectedProviderMeasurementKind<Provider, SourceType>
  }[ConnectedSourceType<Provider>]
}[ConnectedProvider]

/** Deployment policy for one conversion; every disclosure defaults to omit. */
export interface ProviderConversionOptions {
  readonly nativeIdentifierDisclosure?:
    GovernedSourceIdentifierDisclosurePolicy | undefined
}

/** One converted provider record: what it converted, what it minted, and the graph. */
export interface ProviderConversion {
  readonly source: NormalizedSourceRecord
  readonly identifiers: ExchangeGraphIdentifiers
  readonly graph: ExchangeGraph
  /** Registry warnings about what the accepted record lost; empty when nothing was. */
  readonly warnings: readonly Issue[]
}

export interface ProviderRecordingConversion {
  readonly source: ProviderRecordingSource
  readonly identifiers: ExchangeGraphIdentifiers
  readonly graph: ExchangeGraph
  readonly warnings: readonly Issue[]
}

/** One record a batch refused, with the registry codes that say why. */
export interface ProviderConversionFailure {
  readonly record: NormalizedProviderRecord
  readonly issues: readonly Issue[]
}
