// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type ExplanationOfBenefit } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import {
  FhirExplanationOfBenefit,
  type untypedExplanationOfBenefitSchema,
} from '../../src/index.js'

describe('ExplanationOfBenefit Resource', () => {
  it('should validate FHIR ExplanationOfBenefits from explanationOfBenefits.json', () => {
    type Schema = z.infer<typeof untypedExplanationOfBenefitSchema>
    expectTypeOf<Schema>().toExtend<ExplanationOfBenefit>()
    expectTypeOf<ExplanationOfBenefit>().toExtend<Schema>()

    const data = fs.readFileSync(
      'test/resources/explanationOfBenefits.json',
      'utf-8',
    )
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirExplanationOfBenefit.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
