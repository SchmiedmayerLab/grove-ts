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
import type { ReadonlyDeep } from '../core/index.js'

export type Attachment = ReadonlyDeep<R4Attachment>
export type Coding = ReadonlyDeep<R4Coding>
export type CodeableConcept = ReadonlyDeep<R4CodeableConcept>
export type Device = ReadonlyDeep<R4Device>
export type DocumentReference = ReadonlyDeep<R4DocumentReference>
export type Extension = ReadonlyDeep<R4Extension>
export type Identifier = ReadonlyDeep<R4Identifier>
export type MedicationAdministration = ReadonlyDeep<R4MedicationAdministration>
export type MedicationStatement = ReadonlyDeep<R4MedicationStatement>
export type Observation = ReadonlyDeep<R4Observation>
export type Patient = ReadonlyDeep<R4Patient>
export type Period = ReadonlyDeep<R4Period>
export type PlanDefinition = ReadonlyDeep<R4PlanDefinition>
export type Provenance = ReadonlyDeep<R4Provenance>
export type Questionnaire = ReadonlyDeep<R4Questionnaire>
export type QuestionnaireResponse = ReadonlyDeep<R4QuestionnaireResponse>
export type Quantity = ReadonlyDeep<R4Quantity>
export type Reference = ReadonlyDeep<R4Reference>
export type SampledData = ReadonlyDeep<R4SampledData>
export type ResearchStudy = ReadonlyDeep<R4ResearchStudy>
export type ResearchSubject = ReadonlyDeep<R4ResearchSubject>
export type Specimen = ReadonlyDeep<R4Specimen>
export type VisionPrescription = ReadonlyDeep<R4VisionPrescription>

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
  | Questionnaire
  | QuestionnaireResponse
  | ResearchStudy
  | ResearchSubject
  | Specimen
  | VisionPrescription

type BundleEntry = ReadonlyDeep<NonNullable<R4Bundle['entry']>[number]>

export type CollectionBundle = ReadonlyDeep<
  Omit<R4Bundle, '_total' | 'entry' | 'total' | 'type'> & {
    readonly type: 'collection'
    readonly entry: ReadonlyArray<
      Omit<BundleEntry, 'fullUrl' | 'resource'> & {
        readonly fullUrl: string
        readonly resource: GraphResource
      }
    >
  }
>

export type SupportedR4Resource = CollectionBundle | GraphResource
