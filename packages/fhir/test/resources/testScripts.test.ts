//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type TestScript } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import {
  FhirTestScript,
  type untypedTestScriptSchema,
} from '../../src/index.js'

describe('TestScript Resource', () => {
  it('should validate FHIR test script from testScripts.json', () => {
    type Schema = z.infer<typeof untypedTestScriptSchema>
    expectTypeOf<Schema>().toExtend<TestScript>()
    expectTypeOf<TestScript>().toExtend<Schema>()

    const data = fs.readFileSync('test/resources/testScripts.json', 'utf-8')
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirTestScript.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
