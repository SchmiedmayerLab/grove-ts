// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type EnrollmentResponse } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import {
  FhirEnrollmentResponse,
  type untypedEnrollmentResponseSchema,
} from '../../src/index.js'

describe('EnrollmentResponse Resource', () => {
  it('should validate FHIR EnrollmentResponses from enrollmentResponses.json', () => {
    type Schema = z.infer<typeof untypedEnrollmentResponseSchema>
    expectTypeOf<Schema>().toExtend<EnrollmentResponse>()
    expectTypeOf<EnrollmentResponse>().toExtend<Schema>()

    const data = fs.readFileSync(
      'test/resources/enrollmentResponses.json',
      'utf-8',
    )
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirEnrollmentResponse.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
