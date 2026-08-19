//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type MedicationDispense } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import {
  FhirMedicationDispense,
  type untypedMedicationDispenseSchema,
} from '../../src/index.js'

describe('MedicationDispense Resource', () => {
  it('should validate FHIR medication dispenses from medicationDispenses.json', () => {
    type Schema = z.infer<typeof untypedMedicationDispenseSchema>
    expectTypeOf<Schema>().toExtend<MedicationDispense>()
    expectTypeOf<MedicationDispense>().toExtend<Schema>()

    const data = fs.readFileSync(
      'test/resources/medicationDispenses.json',
      'utf-8',
    )
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirMedicationDispense.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
