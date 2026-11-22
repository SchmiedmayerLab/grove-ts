//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type MedicationStatement } from 'fhir/r4b.js'
import { type z } from 'zod'
import {
  FhirMedicationStatement,
  type untypedMedicationStatementSchema,
} from '../../src/index.js'
import { jsonStringifyDeterministically } from './testHelpers.js'

describe('MedicationStatement Resource', () => {
  it('should validate FHIR medication statements from medicationStatements.json', () => {
    type Schema = z.infer<typeof untypedMedicationStatementSchema>
    expectTypeOf<Schema>().toExtend<MedicationStatement>()
    expectTypeOf<MedicationStatement>().toExtend<Schema>()

    const data = fs.readFileSync(
      'test/resources/medicationStatements.json',
      'utf-8',
    )
    const decodedJson = JSON.parse(data) as Record<string, unknown>

    Object.values(decodedJson).forEach((jsonValue) => {
      const parsedResource = FhirMedicationStatement.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
