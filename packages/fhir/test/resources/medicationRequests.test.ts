//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type MedicationRequest } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import {
  FhirMedicationRequest,
  type untypedMedicationRequestSchema,
} from '../../src/index.js'

describe('MedicationRequest Resource', () => {
  it('should validate FHIR medicationRequest from medicationRequests.json', () => {
    type Schema = z.infer<typeof untypedMedicationRequestSchema>
    expectTypeOf<Schema>().toExtend<MedicationRequest>()
    expectTypeOf<MedicationRequest>().toExtend<Schema>()

    const data = fs.readFileSync(
      'test/resources/medicationRequests.json',
      'utf-8',
    )
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirMedicationRequest.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
