//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type RegulatedAuthorization } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import {
  FhirRegulatedAuthorization,
  type untypedRegulatedAuthorizationSchema,
} from '../../src/index.js'

describe('RegulatedAuthorization Resource', () => {
  it('should validate FHIR regulatedAuthorization from regulatedAuthorizations.json', () => {
    type Schema = z.infer<typeof untypedRegulatedAuthorizationSchema>
    expectTypeOf<Schema>().toExtend<RegulatedAuthorization>()
    expectTypeOf<RegulatedAuthorization>().toExtend<Schema>()

    const data = fs.readFileSync(
      'test/resources/regulatedAuthorizations.json',
      'utf-8',
    )
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirRegulatedAuthorization.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
