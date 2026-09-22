//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import type {
  BusinessIdentifier,
  ExchangeEventIdentifier,
  OpaqueIdentityScope,
  RoledIdentifier,
} from './identity.js'
import type { SharedMobileMeasurementKind } from '../contract/measurement-catalog.generated.js'
import type { AbsoluteUri, FhirId, FhirInstant } from '../core/index.js'
import type { Patient } from '../r4/types.js'

type SharedCatalog =
  typeof import('../contract/measurement-catalog.generated.js').sharedMobileMeasurementCatalog

/** Kinds whose catalog definition declares the given value kind and effective. */
export type MeasurementKindsWhere<
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
  readonly display?: string | undefined
}

export interface SleepStageMeasurement {
  readonly kind: 'sleep-stage'
  readonly stage: SleepStage
  /** Source-native stage retained when it is more precise than the shared stage. */
  readonly sourceStageCoding?: SleepStageSourceCodingInput | undefined
  readonly effective: PeriodEffectiveTime
}

/** Closed union of normalized measurements defined by the shared Mobile IG. */
export type MobileMeasurement =
  | BloodPressureMeasurement
  | InstantCodedMeasurement
  | InstantQuantityMeasurement
  | PeriodCodedMeasurement
  | PeriodQuantityMeasurement
  | SleepStageMeasurement

export type RecordingMethod =
  'actively-recorded' | 'automatically-recorded' | 'manual-entry'

/**
 * The participant an output describes.
 *
 * A logical subject is the identifier-only pseudonym reference and needs no Patient entry;
 * a bundled subject adds the deployment's own Patient entry, which must carry the same
 * identifier, and outputs reference that entry.
 */
export type Subject =
  | { readonly kind: 'logical'; readonly identifier: BusinessIdentifier }
  | {
      readonly kind: 'bundled'
      readonly identifier: BusinessIdentifier
      readonly patient: Patient
    }

/** One ResearchStudy, its exact-revision PlanDefinition and one ResearchSubject. */
export interface StudyEnrollment {
  readonly study: BusinessIdentifier
  readonly protocol: {
    readonly url: AbsoluteUri
    readonly version: string
  }
  readonly enrollment: BusinessIdentifier
}

/** The immutable snapshot of one application build; the token never appears in clear. */
export interface ApplicationDevice {
  readonly sourceDeviceToken: string
  readonly name: string
  readonly version?: string | undefined
  readonly build?: string | undefined
}

/** The immutable snapshot of the hardware and OS hosting the converter. */
export interface HostDevice {
  readonly sourceDeviceToken: string
  readonly operatingSystemVersion: string
  readonly name?: string | undefined
  readonly manufacturer?: string | undefined
  readonly modelNumber?: string | undefined
}

/** One physical recording unit; model, manufacturer, or subject are not substitutes for the token. */
export interface RecordingDevice {
  readonly stableUnitToken: string
  readonly name?: string | undefined
  readonly manufacturer?: string | undefined
  readonly modelNumber?: string | undefined
}

/**
 * How the converter application relates to the measurement.
 *
 * Conversion alone makes it the assembler; a gateway mediated or routed the measurement,
 * either the converter itself or a distinct application emitted as a second snapshot.
 */
export type ConverterRole =
  | { readonly kind: 'assembler' }
  | { readonly kind: 'gateway' }
  | {
      readonly kind: 'gateway-application'
      readonly application: ApplicationDevice
    }

/** The graph nodes a repository may have assigned a Resource.id to. */
export type ExchangeGraphNode =
  | 'bundle'
  | 'primary-output'
  | 'source-artifact'
  | 'recording-device'
  | 'application-device'
  | 'host-device'
  | 'writer'
  | 'provenance'

/**
 * Everything one exchange event needs beyond the source record.
 *
 * `converterRole` defaults to the assembler, `studies` to none, and `repositoryIds` to
 * none; Provenance.recorded and Bundle.timestamp are the conversion instant.
 */
export interface ExchangeEventContext {
  readonly subject: Subject
  readonly event: ExchangeEventIdentifier
  readonly identityScope: OpaqueIdentityScope
  readonly repositoryScope: BusinessIdentifier
  readonly application: ApplicationDevice
  /** Required here: a server states its own facts, where a phone reads them from the OS. */
  readonly host: HostDevice
  /** Defaults to the instant the builder runs. */
  readonly conversionInstant?: FhirInstant | undefined
  readonly converterRole?: ConverterRole | undefined
  readonly studies?: readonly StudyEnrollment[] | undefined
  readonly repositoryIds?:
    Readonly<Partial<Record<ExchangeGraphNode, FhirId>>> | undefined
}

/** A context after parsing, with every default applied. */
export interface ResolvedExchangeEventContext extends ExchangeEventContext {
  readonly conversionInstant: FhirInstant
  readonly converterRole: ConverterRole
  readonly studies: readonly StudyEnrollment[]
}

export interface GovernedSourceIdentifierTypeCoding {
  readonly system: AbsoluteUri
  readonly code: string
  readonly display?: string | undefined
}

/** Narrow CodeableConcept surface for a disclosed source-native Identifier.type. */
export interface GovernedSourceIdentifierType {
  readonly coding?:
    | readonly [
        GovernedSourceIdentifierTypeCoding,
        ...GovernedSourceIdentifierTypeCoding[],
      ]
    | undefined
  readonly text?: string | undefined
}

/**
 * Whether the designated primary output discloses the source-native record identifier in
 * clear under a caller-governed key-space URI; it supplements Grove identities and never
 * becomes an entry or retraction key.
 */
export type GovernedSourceIdentifierDisclosurePolicy =
  | { readonly kind: 'omit' }
  | {
      readonly kind: 'authorized'
      readonly system: AbsoluteUri
      readonly type?: GovernedSourceIdentifierType | undefined
    }

/** Every identifier one exchange graph minted, in the roles the graph carries them. */
export interface ExchangeGraphIdentifiers {
  readonly event: ExchangeEventIdentifier
  readonly sourceRecord: RoledIdentifier
  /** Every output identity in Bundle order; a provider record has no child outputs. */
  readonly outputs: readonly [RoledIdentifier, ...RoledIdentifier[]]
  readonly provenance: RoledIdentifier
  readonly applicationSnapshot: RoledIdentifier
  readonly hostSnapshot: RoledIdentifier
  readonly writerSnapshot: RoledIdentifier
  readonly sourceArtifact?: RoledIdentifier
  readonly recordingDevice?: RoledIdentifier
  readonly recordingDeviceSnapshot?: RoledIdentifier
  readonly gatewayApplicationSnapshot?: RoledIdentifier
  readonly writerRecord?: RoledIdentifier
}

/** The outcome of converting several records: what converted and what was refused. */
export interface ConversionBatch<Conversion, Failure> {
  readonly conversions: readonly Conversion[]
  readonly failures: readonly Failure[]
}
