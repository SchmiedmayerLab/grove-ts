//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import type {
  Attachment as R4Attachment,
  Bundle as R4Bundle,
  CodeableConcept as R4CodeableConcept,
  Coding as R4Coding,
  Device as R4Device,
  DocumentReference as R4DocumentReference,
  Extension as R4Extension,
  Identifier as R4Identifier,
  MedicationAdministration as R4MedicationAdministration,
  MedicationStatement as R4MedicationStatement,
  Observation as R4Observation,
  Patient as R4Patient,
  Period as R4Period,
  PlanDefinition as R4PlanDefinition,
  Provenance as R4Provenance,
  Questionnaire as R4Questionnaire,
  QuestionnaireResponse as R4QuestionnaireResponse,
  Quantity as R4Quantity,
  Reference as R4Reference,
  ResearchStudy as R4ResearchStudy,
  ResearchSubject as R4ResearchSubject,
  SampledData as R4SampledData,
  Specimen as R4Specimen,
  VisionPrescription as R4VisionPrescription,
} from 'fhir/r4.js'
import type { FhirJson } from './json.js'
import type { ReadonlyDeep } from '../core/index.js'

export type Attachment = ReadonlyDeep<FhirJson<R4Attachment>>
export type Coding = ReadonlyDeep<FhirJson<R4Coding>>
export type CodeableConcept = ReadonlyDeep<FhirJson<R4CodeableConcept>>
export type Device = ReadonlyDeep<FhirJson<R4Device>>
export type DocumentReference = ReadonlyDeep<FhirJson<R4DocumentReference>>
export type Extension = ReadonlyDeep<FhirJson<R4Extension>>
export type Identifier = ReadonlyDeep<FhirJson<R4Identifier>>
export type MedicationAdministration = ReadonlyDeep<
  FhirJson<R4MedicationAdministration>
>
export type MedicationStatement = ReadonlyDeep<FhirJson<R4MedicationStatement>>
export type Observation = ReadonlyDeep<FhirJson<R4Observation>>
export type Patient = ReadonlyDeep<FhirJson<R4Patient>>
export type Period = ReadonlyDeep<FhirJson<R4Period>>
export type PlanDefinition = ReadonlyDeep<FhirJson<R4PlanDefinition>>
export type Provenance = ReadonlyDeep<FhirJson<R4Provenance>>
export type Questionnaire = ReadonlyDeep<FhirJson<R4Questionnaire>>
export type QuestionnaireResponse = ReadonlyDeep<
  FhirJson<R4QuestionnaireResponse>
>
export type Quantity = ReadonlyDeep<FhirJson<R4Quantity>>
export type Reference = ReadonlyDeep<FhirJson<R4Reference>>
export type SampledData = ReadonlyDeep<FhirJson<R4SampledData>>
export type ResearchStudy = ReadonlyDeep<FhirJson<R4ResearchStudy>>
export type ResearchSubject = ReadonlyDeep<FhirJson<R4ResearchSubject>>
export type Specimen = ReadonlyDeep<FhirJson<R4Specimen>>
export type VisionPrescription = ReadonlyDeep<FhirJson<R4VisionPrescription>>

/** Every resource a Grove exchange graph may carry, as the guides publish them. */
export type GraphResource =
  | Device
  | DocumentReference
  | MedicationAdministration
  | MedicationStatement
  | Observation
  | Patient
  | PlanDefinition
  | Provenance
  | QuestionnaireResponse
  | ResearchStudy
  | ResearchSubject
  | Specimen
  | VisionPrescription

type BundleEntry = ReadonlyDeep<
  FhirJson<NonNullable<R4Bundle['entry']>[number]>
>

/** Bounded base-R4 collection Bundle; base fields and entries remain optional. */
export type R4CollectionBundle = ReadonlyDeep<
  FhirJson<Omit<R4Bundle, 'type'>> & {
    readonly type: 'collection'
  }
>

/** Grove-profiled event graph with complete event and entry identity. */
export type GroveMobileExchangeBundle = ReadonlyDeep<
  Omit<R4CollectionBundle, 'entry' | 'identifier' | 'timestamp'> & {
    readonly identifier: Identifier
    readonly timestamp: string
    readonly entry: readonly [
      Omit<BundleEntry, 'fullUrl' | 'resource'> & {
        readonly fullUrl: string
        readonly resource: GraphResource
      },
      ...Array<
        Omit<BundleEntry, 'fullUrl' | 'resource'> & {
          readonly fullUrl: string
          readonly resource: GraphResource
        }
      >,
    ]
  }
>

/** Grove-profiled retraction assertion containing Provenance and optional Device agents only. */
export type GroveMobileRetractionBundle = ReadonlyDeep<
  Omit<R4CollectionBundle, 'entry' | 'identifier' | 'timestamp'> & {
    readonly identifier: Identifier
    readonly timestamp: string
    readonly entry: readonly [
      Omit<BundleEntry, 'fullUrl' | 'resource'> & {
        readonly fullUrl: string
        readonly resource: Device | Provenance
      },
      ...Array<
        Omit<BundleEntry, 'fullUrl' | 'resource'> & {
          readonly fullUrl: string
          readonly resource: Device | Provenance
        }
      >,
    ]
  }
>

export type SupportedR4Resource = R4CollectionBundle | GraphResource
