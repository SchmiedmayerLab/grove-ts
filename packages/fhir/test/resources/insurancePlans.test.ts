// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type InsurancePlan } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import {
  FhirInsurancePlan,
  type untypedInsurancePlanSchema,
} from '../../src/index.js'

describe('InsurancePlan Resource', () => {
  it('should validate FHIR InsurancePlans from insurancePlans.json', () => {
    type Schema = z.infer<typeof untypedInsurancePlanSchema>
    expectTypeOf<Schema>().toExtend<InsurancePlan>()
    expectTypeOf<InsurancePlan>().toExtend<Schema>()

    const data = fs.readFileSync('test/resources/insurancePlans.json', 'utf-8')
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirInsurancePlan.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
