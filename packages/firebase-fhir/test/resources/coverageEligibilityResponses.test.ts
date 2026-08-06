// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type CoverageEligibilityResponse } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import {
  FhirCoverageEligibilityResponse,
  type untypedCoverageEligibilityResponseSchema,
} from '../../src/index.js'

describe('CoverageEligibilityResponse Resource', () => {
  it('should validate FHIR CoverageEligibilityResponses from coverageEligibilityResponses.json', () => {
    type Schema = z.infer<typeof untypedCoverageEligibilityResponseSchema>
    expectTypeOf<Schema>().toExtend<CoverageEligibilityResponse>()
    expectTypeOf<CoverageEligibilityResponse>().toExtend<Schema>()

    const data = fs.readFileSync(
      'test/resources/coverageEligibilityResponses.json',
      'utf-8',
    )
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource =
        FhirCoverageEligibilityResponse.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
