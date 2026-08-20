//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import type { ImplementedMeasurementKind } from './measurement-catalog.generated.js'
import type {
  AbsoluteUri,
  FhirId,
  FhirInstant,
  PatientReference,
  UrnUuid,
} from '../core/index.js'
import type { CollectionBundle } from '../r4/index.js'

export type InstantQuantityMeasurementKind = Exclude<
  ImplementedMeasurementKind,
  | 'active-energy'
  | 'blood-pressure'
  | 'distance'
  | 'sleep-duration'
  | 'sleep-stage'
  | 'step-count'
  | GlucoseMeasurementKind
>

export type GlucoseMeasurementKind = Extract<
  ImplementedMeasurementKind,
  | 'blood-glucose'
  | 'capillary-blood-glucose'
  | 'interstitial-glucose'
  | 'serum-plasma-glucose'
>

export type PeriodQuantityMeasurementKind = Extract<
  ImplementedMeasurementKind,
  'active-energy' | 'distance' | 'sleep-duration' | 'step-count'
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

export interface BloodPressureMeasurement {
  readonly kind: 'blood-pressure'
  readonly systolic: number
  readonly diastolic: number
  readonly effective: InstantEffectiveTime
}

export type SleepStage =
  (typeof import('./measurement-catalog.generated.js').implementedMeasurementCatalog)['sleep-stage']['allowedValues'][number]

export interface SourceCodingInput {
  readonly system: AbsoluteUri
  readonly code: string
  readonly display?: string
}

export interface SleepStageMeasurement {
  readonly kind: 'sleep-stage'
  readonly stage: SleepStage
  /** Source-native stage retained when it is more precise than the shared stage. */
  readonly sourceStageCoding?: SourceCodingInput
  readonly effective: PeriodEffectiveTime
}

export interface SpecimenIdentityInput {
  readonly identity: IdentifiedEntryIdentityInput
}

type GlucoseSpecimenInput<Kind extends GlucoseMeasurementKind> =
  SpecimenIdentityInput &
    (Kind extends 'serum-plasma-glucose' ?
      { readonly specimenKind: 'plasma' | 'serum' }
    : { readonly specimenKind?: never })

/** Glucose concentration with an explicit, graph-addressable specimen. */
export type GlucoseMeasurement = {
  readonly [Kind in GlucoseMeasurementKind]: {
    readonly kind: Kind
    /** Value expressed as UCUM mg/dL. */
    readonly value: number
    readonly effective: InstantEffectiveTime
    readonly specimen: GlucoseSpecimenInput<Kind>
  }
}[GlucoseMeasurementKind]

/** Closed union of measurements constructible under the shared Mobile IG. */
export type MobileMeasurement =
  | BloodPressureMeasurement
  | GlucoseMeasurement
  | InstantQuantityMeasurement
  | PeriodQuantityMeasurement
  | SleepStageMeasurement

/** Complete FHIR business Identifier pair; neither member may be omitted. */
export interface CompleteIdentifierInput {
  readonly system: AbsoluteUri
  readonly value: string
}

export interface BundleIdentityInput {
  readonly identifier: CompleteIdentifierInput
  readonly id?: FhirId
}

export interface EntryIdentityInput {
  readonly fullUrl: UrnUuid
  readonly id?: FhirId
}

export interface IdentifiedEntryIdentityInput extends EntryIdentityInput {
  readonly identifier: CompleteIdentifierInput
}

export interface ApplicationDeviceInput {
  readonly identity: IdentifiedEntryIdentityInput
  readonly name: string
  readonly version?: string
  readonly manufacturer?: string
}

export interface RecordingDeviceInput {
  readonly identity: IdentifiedEntryIdentityInput
  readonly name?: string
  readonly manufacturer?: string
  readonly modelNumber?: string
  readonly serialNumber?: string
}

/** Connected providers accepted by the normalized handoff contract. */
export type ConnectedProvider = 'google-health' | 'oura' | 'withings'

export type SourceAdapter =
  | { readonly kind: 'mobile' }
  | {
      readonly kind: 'connected-health'
      readonly provider: ConnectedProvider
    }

export type RecordingMethod =
  'actively-recorded' | 'automatically-recorded' | 'manual-entry'

interface NormalizedSourceRecordBase {
  /** Stable native-record identifier in a source-owned absolute namespace. */
  readonly identifier: CompleteIdentifierInput
  readonly display?: string
  readonly recordingMethod?: RecordingMethod
  readonly recordingDevice?: RecordingDeviceInput
  /** Source-native sample or record type retained as an additional code Coding. */
  readonly sourceTypeCoding?: SourceCodingInput
}

export interface MobileSourceRecord extends NormalizedSourceRecordBase {
  readonly adapter: Extract<SourceAdapter, { readonly kind: 'mobile' }>
  readonly dataOrigin?: ApplicationDeviceInput
}

export interface ConnectedHealthSourceRecord extends NormalizedSourceRecordBase {
  readonly adapter: Extract<
    SourceAdapter,
    { readonly kind: 'connected-health' }
  >
  /** Application that entered the record into the connected provider. */
  readonly dataOrigin: ApplicationDeviceInput
}

export type NormalizedSourceRecord =
  ConnectedHealthSourceRecord | MobileSourceRecord

/** Provider-neutral output of an external adapter, before FHIR construction. */
export interface NormalizedProviderMeasurement {
  readonly measurement: MobileMeasurement
  readonly source: NormalizedSourceRecord
}

export interface MobileBundleInput extends NormalizedProviderMeasurement {
  readonly subject: PatientReference
  readonly application: ApplicationDeviceInput
  readonly bundle: BundleIdentityInput
  readonly observation: IdentifiedEntryIdentityInput
  readonly provenance: IdentifiedEntryIdentityInput
  readonly issued: FhirInstant
  readonly recorded: FhirInstant
  readonly researchStudyReferences?: readonly string[]
}

export type MobileBundleResult = CollectionBundle
