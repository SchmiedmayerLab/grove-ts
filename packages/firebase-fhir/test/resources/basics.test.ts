//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type Basic } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import { FhirBasic, type untypedBasicSchema } from '../../src/index.js'

describe('Basic Resource', () => {
  it('should validate FHIR basic from basics.json', () => {
    type Schema = z.infer<typeof untypedBasicSchema>
    expectTypeOf<Schema>().toExtend<Basic>()
    expectTypeOf<Basic>().toExtend<Schema>()

    const data = fs.readFileSync('test/resources/basics.json', 'utf-8')
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirBasic.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
