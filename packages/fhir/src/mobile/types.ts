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

export type InstantQuantityMeasurementKind = MeasurementKindsWhere<
  'quantity',
  'dateTime'
>

export type PeriodQuantityMeasurementKind = MeasurementKindsWhere<
  'quantity',
  'Period'
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
  readonly identity: ResourceIdentityInput
  readonly name: string
  readonly version?: string
  readonly manufacturer?: string
}

interface RecordingDeviceBaseInput {
  readonly identity: ResourceIdentityInput
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
