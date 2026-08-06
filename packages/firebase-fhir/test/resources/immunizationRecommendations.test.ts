//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type ImmunizationRecommendation } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import {
  FhirImmunizationRecommendation,
  type untypedImmunizationRecommendationSchema,
} from '../../src/index.js'

describe('ImmunizationRecommendation Resource', () => {
  it('should validate FHIR immunization recommendations from immunizationRecommendations.json', () => {
    type Schema = z.infer<typeof untypedImmunizationRecommendationSchema>
    expectTypeOf<Schema>().toExtend<ImmunizationRecommendation>()
    expectTypeOf<ImmunizationRecommendation>().toExtend<Schema>()

    const data = fs.readFileSync(
      'test/resources/immunizationRecommendations.json',
      'utf-8',
    )
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource =
        FhirImmunizationRecommendation.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
