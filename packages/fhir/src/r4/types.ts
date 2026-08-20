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
  Extension as R4Extension,
  Identifier as R4Identifier,
  Observation as R4Observation,
  Period as R4Period,
  Provenance as R4Provenance,
  Questionnaire as R4Questionnaire,
  QuestionnaireResponse as R4QuestionnaireResponse,
  Quantity as R4Quantity,
  Reference as R4Reference,
  SampledData as R4SampledData,
  Specimen as R4Specimen,
} from 'fhir/r4.js'
import type { ReadonlyDeep } from '../core/index.js'

export type Attachment = ReadonlyDeep<R4Attachment>
export type Coding = ReadonlyDeep<R4Coding>
export type CodeableConcept = ReadonlyDeep<R4CodeableConcept>
export type Device = ReadonlyDeep<R4Device>
export type Extension = ReadonlyDeep<R4Extension>
export type Identifier = ReadonlyDeep<R4Identifier>
export type Observation = ReadonlyDeep<R4Observation>
export type Period = ReadonlyDeep<R4Period>
export type Provenance = ReadonlyDeep<R4Provenance>
export type Questionnaire = ReadonlyDeep<R4Questionnaire>
export type QuestionnaireResponse = ReadonlyDeep<R4QuestionnaireResponse>
export type Quantity = ReadonlyDeep<R4Quantity>
export type Reference = ReadonlyDeep<R4Reference>
export type SampledData = ReadonlyDeep<R4SampledData>
export type Specimen = ReadonlyDeep<R4Specimen>

export type GraphResource = Device | Observation | Provenance | Specimen

type BundleEntry = ReadonlyDeep<NonNullable<R4Bundle['entry']>[number]>

export type CollectionBundle = ReadonlyDeep<
  Omit<R4Bundle, 'entry' | 'type'> & {
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
