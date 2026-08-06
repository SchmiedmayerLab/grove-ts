//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type CodeSystem } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import {
  FhirCodeSystem,
  type untypedCodeSystemSchema,
} from '../../src/index.js'

describe('CodeSystem Resource', () => {
  it('should validate FHIR CodeSystems from codeSystems.json', () => {
    type Schema = z.infer<typeof untypedCodeSystemSchema>
    expectTypeOf<Schema>().toExtend<CodeSystem>()
    expectTypeOf<CodeSystem>().toExtend<Schema>()

    const data = fs.readFileSync('test/resources/codeSystems.json', 'utf-8')
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirCodeSystem.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
