//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import type {
  ProviderRawMappings,
  ProviderScalarMappings,
} from './contract.generated.js'
import type {
  AbsoluteUri,
  FhirId,
  FhirInstant,
  PatientReference,
  PositiveInteger,
  ResearchStudyReference,
} from '../core/index.js'
import type { SharedMobileMeasurementKind } from '../mobile/measurement-catalog.generated.js'
import type {
  ApplicationDeviceInput,
  CompleteIdentifierInput,
  GatewayApplicationInput,
  MobileMeasurement,
  RecordingDeviceInput,
  RecordingMethod,
} from '../mobile/types.js'

type ScalarMappings = ProviderScalarMappings

/** Explicit assertion that this account key is a deployment-owned pseudonym. */
export interface ProviderAccountPseudonymInput extends CompleteIdentifierInput {
  readonly assurance: 'deployment-scoped-pseudonym'
}

/** Exact closed provider codes defined by the Provider IG. */
export type ConnectedProvider = keyof ScalarMappings

/** Exact source tokens that contain at least one admitted scalar mapping. */
export type ConnectedSourceType<Provider extends ConnectedProvider> =
  keyof ScalarMappings[Provider] & string

export type SupportedConnectedProviderMeasurementKind<
  Provider extends ConnectedProvider,
  SourceType extends ConnectedSourceType<Provider> =
    ConnectedSourceType<Provider>,
> = keyof ScalarMappings[Provider][SourceType] & SharedMobileMeasurementKind

export interface ProviderAdapter<
  Provider extends ConnectedProvider = ConnectedProvider,
> {
  readonly kind: 'providers'
  readonly provider: Provider
}

interface NormalizedSourceRecordBase {
  readonly recordingMethod?: RecordingMethod
  readonly recordingDevice?: RecordingDeviceInput
}

/**
 * Identity-only source fields. The native id is hashed and never copied into
 * FHIR output. The account identifier must be deployment-scoped and
 * pseudonymous; an email, vendor account id, or access credential is invalid.
 */
export interface ProviderSourceRecord<
  Provider extends ConnectedProvider,
  SourceType extends ConnectedSourceType<Provider>,
> extends NormalizedSourceRecordBase {
  readonly adapter: ProviderAdapter<Provider>
  readonly providerAccountIdentifier: ProviderAccountPseudonymInput
  readonly sourceType: SourceType
  readonly sourceNativeId: string
  /** Application that entered the record into the connected provider. */
  readonly dataOrigin: ApplicationDeviceInput
}

export type ConnectedProviderMeasurements<
  Provider extends ConnectedProvider,
  SourceType extends ConnectedSourceType<Provider>,
> = readonly [
  Extract<
    MobileMeasurement,
    {
      readonly kind: SupportedConnectedProviderMeasurementKind<
        Provider,
        SourceType
      >
    }
  >,
  ...Array<
    Extract<
      MobileMeasurement,
      {
        readonly kind: SupportedConnectedProviderMeasurementKind<
          Provider,
          SourceType
        >
      }
    >
  >,
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

type RawMappings = ProviderRawMappings

/** Providers with at least one source admitted as a native Sensor recording. */
export type ConnectedRawProvider = keyof RawMappings

/** Exact provider source tokens admitted by the Provider raw contract. */
export type ConnectedRawSourceType<Provider extends ConnectedRawProvider> =
  keyof RawMappings[Provider] & string

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
  readonly providerAccountIdentifier: ProviderAccountPseudonymInput
  readonly sourceType: SourceType
  /** Digest input only. It is never copied into emitted FHIR metadata. */
  readonly sourceNativeId: string
  /** Application that entered the already-obtained record at the provider. */
  readonly dataOrigin: ApplicationDeviceInput
}

interface RecordingAttachmentBaseInput {
  readonly contentType: MediaType
  readonly title: string
  /** Registered payload format the recording bytes conform to. */
  readonly format: ProviderRecordingFormat
  /** Required deployment assertion for opaque content Grove cannot inspect. */
  readonly payloadAssertion: RawPayloadAdmissionAssertion
}

export type ProviderRecordingFormat =
  import('./contract.generated.js').ProviderRecordingFormat

export type RawPayloadAdmissionAssertion =
  (typeof import('./contract.generated.js').providerAdapterCatalog)['rawPayloadAdmission']['allowedAssertions'][number]

export interface EmbeddedRecordingAttachmentInput extends RecordingAttachmentBaseInput {
  readonly kind: 'embedded'
  /** Exact caller-supplied bytes represented as canonical RFC 4648 base64. */
  readonly dataBase64: CanonicalBase64
}

export interface ExternalRecordingAttachmentInput extends RecordingAttachmentBaseInput {
  readonly kind: 'external'
  readonly url: ImmutableRecordingUrl
  readonly size: PositiveInteger
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
  readonly subject: PatientReference
  readonly application: ApplicationDeviceInput
  /** Durable caller-owned sequence for a new conversion/exchange event. */
  readonly eventSequence: PositiveInteger
  /**
   * The namespace this deployment owns for graph nodes the export creates.
   *
   * The conversion Provenance and the exchange Bundle record an export event rather than anything
   * read from the provider, so they are named here rather than in a namespace this guide owns.
   */
  readonly graphIdentifierSystem: AbsoluteUri
  readonly documentDate: FhirInstant
  readonly recorded: FhirInstant
  readonly repositoryIds?: RecordingRepositoryAssignedResourceIds
}

export interface MeasurementRepositoryAssignedResourceIds {
  readonly bundle?: FhirId
  readonly observations?: Readonly<
    Partial<Record<SharedMobileMeasurementKind, FhirId>>
  >
  readonly provenance?: FhirId
}

interface ProviderMeasurementGraphInput {
  readonly subject: PatientReference
  readonly application: ApplicationDeviceInput
  readonly gatewayApplication?: GatewayApplicationInput
  /** Durable caller-owned sequence for a new conversion/exchange event. */
  readonly eventSequence: PositiveInteger
  /**
   * The namespace this deployment owns for graph nodes the export creates.
   *
   * The conversion Provenance and the exchange Bundle record an export event rather than anything
   * read from the provider, so they are named here rather than in a namespace this guide owns.
   */
  readonly graphIdentifierSystem: AbsoluteUri
  readonly issued: FhirInstant
  readonly recorded: FhirInstant
  readonly repositoryIds?: MeasurementRepositoryAssignedResourceIds
  readonly researchStudyReferences?: readonly ResearchStudyReference[]
}

export type ProviderMeasurementBundleInput = NormalizedProviderRecord &
  ProviderMeasurementGraphInput
