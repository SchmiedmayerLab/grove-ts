//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type VerificationResult } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import {
  FhirVerificationResult,
  type untypedVerificationResultSchema,
} from '../../src/index.js'

describe('VerificationResult Resource', () => {
  it('should validate FHIR VerificationResults from verificationResults.json', () => {
    type Schema = z.infer<typeof untypedVerificationResultSchema>
    expectTypeOf<Schema>().toExtend<VerificationResult>()
    expectTypeOf<VerificationResult>().toExtend<Schema>()

    const data = fs.readFileSync(
      'test/resources/verificationResults.json',
      'utf-8',
    )
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirVerificationResult.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
