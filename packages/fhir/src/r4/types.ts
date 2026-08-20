//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import type {
  Bundle as R4Bundle,
  CodeableConcept as R4CodeableConcept,
  Coding as R4Coding,
  Device as R4Device,
  Identifier as R4Identifier,
  Observation as R4Observation,
  Period as R4Period,
  Provenance as R4Provenance,
  Quantity as R4Quantity,
  Reference as R4Reference,
  SampledData as R4SampledData,
} from 'fhir/r4.js'
import type { ReadonlyDeep } from '../core/index.js'

export type Coding = ReadonlyDeep<R4Coding>
export type CodeableConcept = ReadonlyDeep<R4CodeableConcept>
export type Device = ReadonlyDeep<R4Device>
export type Identifier = ReadonlyDeep<R4Identifier>
export type Observation = ReadonlyDeep<R4Observation>
export type Period = ReadonlyDeep<R4Period>
export type Provenance = ReadonlyDeep<R4Provenance>
export type Quantity = ReadonlyDeep<R4Quantity>
export type Reference = ReadonlyDeep<R4Reference>
export type SampledData = ReadonlyDeep<R4SampledData>

export type GraphResource = Device | Observation | Provenance

export type CollectionBundle = ReadonlyDeep<
  Omit<R4Bundle, 'entry' | 'type'> & {
    readonly type: 'collection'
    readonly entry: ReadonlyArray<{
      readonly fullUrl: string
      readonly resource: GraphResource
    }>
  }
>

export type SupportedR4Resource = CollectionBundle | GraphResource
