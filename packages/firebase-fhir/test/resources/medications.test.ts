//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type Medication } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import {
  FhirMedication,
  type untypedMedicationSchema,
} from '../../src/index.js'

describe('Medication Resource', () => {
  it('should validate FHIR medications from medications.json', () => {
    type Schema = z.infer<typeof untypedMedicationSchema>
    expectTypeOf<Schema>().toExtend<Medication>()
    expectTypeOf<Medication>().toExtend<Schema>()

    const data = fs.readFileSync('test/resources/medications.json', 'utf-8')
    const decodedJson: unknown = JSON.parse(data)

    if (
      typeof decodedJson !== 'object' ||
      decodedJson === null ||
      Array.isArray(decodedJson)
    ) {
      throw new TypeError('Expected medication categories to be an object')
    }

    // drugs.json contains nested structure: {categoryId: {drugId: medicationResource}}
    Object.values(decodedJson).forEach((categoryData: unknown) => {
      if (
        typeof categoryData !== 'object' ||
        categoryData === null ||
        Array.isArray(categoryData)
      ) {
        throw new TypeError('Expected a medication category to be an object')
      }

      Object.values(categoryData).forEach((medicationData: unknown) => {
        const fhirResource = FhirMedication.parse(medicationData).value
        expect(jsonStringifyDeterministically(medicationData)).toBe(
          jsonStringifyDeterministically(fhirResource),
        )
      })
    })
  })
})
