//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type AllergyIntolerance } from 'fhir/r4b.js'
import { type z } from 'zod'
import {
  FhirAllergyIntolerance,
  type untypedAllergyIntoleranceSchema,
} from '../../src/index.js'
import { jsonStringifyDeterministically } from './testHelpers.js'

describe('AllergyIntolerance Resource', () => {
  it('should validate FHIR allergyIntolerance from allergyIntolerances.json', () => {
    type Schema = z.infer<typeof untypedAllergyIntoleranceSchema>
    expectTypeOf<Schema>().toExtend<AllergyIntolerance>()
    expectTypeOf<AllergyIntolerance>().toExtend<Schema>()

    const data = fs.readFileSync(
      'test/resources/allergyIntolerances.json',
      'utf-8',
    )
    const decodedJson = JSON.parse(data) as Record<string, unknown>

    Object.values(decodedJson).forEach((jsonValue) => {
      const parsedResource = FhirAllergyIntolerance.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
