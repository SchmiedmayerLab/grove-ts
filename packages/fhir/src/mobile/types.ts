//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import type { SharedMobileMeasurementKind } from './measurement-catalog.generated.js'
import type {
  AbsoluteUri,
  FhirId,
  FhirInstant,
  UrnUuid,
} from '../core/index.js'

type SharedCatalog =
  typeof import('./measurement-catalog.generated.js').sharedMobileMeasurementCatalog

type OpaqueIdentityDefinition =
  (typeof import('./measurement-catalog.generated.js').groveExchangeProtocol)['opaqueIdentity']['identityKinds'][number]

/** Kinds whose catalog definition declares the given value kind and effective. */
type MeasurementKindsWhere<
  ValueKind extends string,
  Effective extends string,
> = {
  [Kind in SharedMobileMeasurementKind]: SharedCatalog[Kind] extends (
    { readonly valueKind: ValueKind; readonly effective: Effective }
  ) ?
    Kind
  : never
}[SharedMobileMeasurementKind]

/** Kinds whose profile explicitly admits either an instant or bounded Period. */
export type ChoiceQuantityMeasurementKind = MeasurementKindsWhere<
  'quantity',
  'dateTime-or-Period'
>

export type InstantQuantityMeasurementKind = MeasurementKindsWhere<
  'quantity',
  'dateTime' | 'dateTime-or-Period'
>

export type PeriodQuantityMeasurementKind = MeasurementKindsWhere<
  'quantity',
  'Period' | 'dateTime-or-Period'
>

export type InstantCodedMeasurementKind = MeasurementKindsWhere<
  'codeableConcept',
  'dateTime'
>

/** Sleep-stage keeps its bespoke shape with an optional source-native coding. */
export type PeriodCodedMeasurementKind = Exclude<
  MeasurementKindsWhere<'codeableConcept', 'Period'>,
  'sleep-stage'
>

export interface InstantEffectiveTime {
  readonly kind: 'date-time'
  readonly value: FhirInstant
}

export interface PeriodEffectiveTime {
  readonly kind: 'period'
  readonly start: FhirInstant
  readonly end: FhirInstant
}

export type InstantQuantityMeasurement = {
  readonly [Kind in InstantQuantityMeasurementKind]: {
    readonly kind: Kind
    /** Value expressed in the catalog's canonical UCUM unit. */
    readonly value: number
    readonly effective: InstantEffectiveTime
  }
}[InstantQuantityMeasurementKind]

export type PeriodQuantityMeasurement = {
  readonly [Kind in PeriodQuantityMeasurementKind]: {
    readonly kind: Kind
    /** Value expressed in the catalog's canonical UCUM unit. */
    readonly value: number
    readonly effective: PeriodEffectiveTime
  }
}[PeriodQuantityMeasurementKind]

export type ChoiceQuantityMeasurement = Extract<
  InstantQuantityMeasurement | PeriodQuantityMeasurement,
  { readonly kind: ChoiceQuantityMeasurementKind }
>

export type InstantCodedMeasurement = {
  readonly [Kind in InstantCodedMeasurementKind]: {
    readonly kind: Kind
    /** Shared code drawn from the catalog's closed allowed-value set. */
    readonly value: SharedCatalog[Kind]['allowedValues'][number]
    readonly effective: InstantEffectiveTime
  }
}[InstantCodedMeasurementKind]

export type PeriodCodedMeasurement = {
  readonly [Kind in PeriodCodedMeasurementKind]: {
    readonly kind: Kind
    /** Shared code drawn from the catalog's closed allowed-value set. */
    readonly value: SharedCatalog[Kind]['allowedValues'][number]
    readonly effective: PeriodEffectiveTime
  }
}[PeriodCodedMeasurementKind]

export interface BloodPressureMeasurement {
  readonly kind: 'blood-pressure'
  readonly systolic: number
  readonly diastolic: number
  readonly effective: InstantEffectiveTime
}

export type SleepStage = SharedCatalog['sleep-stage']['allowedValues'][number]

export interface SleepStageSourceCodingInput {
  readonly system: AbsoluteUri
  readonly code: string
  readonly display?: string
}

export interface SleepStageMeasurement {
  readonly kind: 'sleep-stage'
  readonly stage: SleepStage
  /** Source-native stage retained when it is more precise than the shared stage. */
  readonly sourceStageCoding?: SleepStageSourceCodingInput
  readonly effective: PeriodEffectiveTime
}

/** Complete FHIR business Identifier pair; neither member may be omitted. */
export interface CompleteIdentifierInput {
  readonly system: AbsoluteUri
  readonly value: string
  /** Grove role carried in Identifier.type for deployment-owned v0 identities. */
  readonly role?: GroveIdentifierRole
}

/** Closed roles used to distinguish deployment-owned v0 identifier key spaces. */
export type GroveIdentifierRole =
  OpaqueIdentityDefinition['identifierRole'] | 'entry-node' | 'event'

/** Closed HMAC domains from the Grove exchange protocol. */
export type GroveOpaqueIdentityKind = OpaqueIdentityDefinition['kind']

export type GroveOpaqueIdentitySystems = Readonly<
  Record<GroveOpaqueIdentityKind, AbsoluteUri>
>

/**
 * Deployment-owned identity material.
 *
 * Every opaque system names exactly one deployment, identity kind, key id, and key epoch. The
 * secret is used only while a graph is built and is never retained in, or emitted with, FHIR.
 */
export interface DeploymentIdentityInput {
  readonly opaqueIdentifierSystems: GroveOpaqueIdentitySystems
  readonly eventIdentifierSystem: AbsoluteUri
  readonly entryNodeIdentifierSystem: AbsoluteUri
  readonly keyId: string
  /** Canonical positive decimal string; represented lexically to avoid JavaScript integer loss. */
  readonly keyEpoch: string
  /** Canonical unpadded base64url key material containing at least 32 bytes. */
  readonly secretBase64Url: string
  /** Canonical lowercase RFC 4122 UUID (versions 1 through 5). */
  readonly producerInstance: string
}

/** Caller-owned business identity with an optional repository-assigned Resource.id. */
export interface ResourceIdentityInput {
  readonly identifier: CompleteIdentifierInput
  readonly id?: FhirId
}

/** Closed union of normalized measurements defined by the shared Mobile IG. */
export type MobileMeasurement =
  | BloodPressureMeasurement
  | InstantCodedMeasurement
  | InstantQuantityMeasurement
  | PeriodCodedMeasurement
  | PeriodQuantityMeasurement
  | SleepStageMeasurement

/** Derived exchange identity returned by identity helpers, never required as input. */
export interface IdentifiedEntryIdentityInput extends ResourceIdentityInput {
  readonly fullUrl: UrnUuid
}

export interface ApplicationDeviceInput {
  /** Deployment-governed token for this source application/build; never emitted in clear. */
  readonly sourceDeviceToken: string
  readonly id?: FhirId
  readonly name: string
  readonly version?: string
  readonly build?: string
  readonly manufacturer?: string
  /** Optional immutable snapshot of the hardware/OS hosting this application. */
  readonly host?: HostDeviceInput
}

export interface HostDeviceInput {
  /** Event-time source token for this host snapshot; never emitted in clear. */
  readonly sourceDeviceToken: string
  readonly id?: FhirId
  readonly name?: string
  readonly manufacturer?: string
  readonly modelNumber?: string
  readonly operatingSystemVersion: string
}

interface RecordingDeviceBaseInput {
  /** Stable token for one physical unit; model, manufacturer, or subject are not substitutes. */
  readonly stableUnitToken: string
  /** Complete logical subject identity used only in the HMAC preimage. */
  readonly subjectIdentifier: CompleteIdentifierInput
  readonly id?: FhirId
  readonly name?: string
  readonly manufacturer?: string
  readonly modelNumber?: string
}

/** Recording-device identity must declare its privacy/disclosure scope. */
export type RecordingDeviceInput = RecordingDeviceBaseInput &
  (
    | { readonly identityScope: 'deployment-scoped' }
    | {
        readonly identityScope: 'authorized-hardware'
        readonly disclosureAuthorization: 'authorized-for-exchange'
      }
  )

/** Explicit evidence for an optional application gateway role. */
export type GatewayApplicationInput =
  | {
      readonly kind: 'converter-application'
      readonly roleAssurance: 'mediated-or-routed-measurement'
    }
  | {
      readonly kind: 'distinct-application'
      readonly roleAssurance: 'mediated-or-routed-measurement'
      readonly application: ApplicationDeviceInput
    }

export type RecordingMethod =
  'actively-recorded' | 'automatically-recorded' | 'manual-entry'
