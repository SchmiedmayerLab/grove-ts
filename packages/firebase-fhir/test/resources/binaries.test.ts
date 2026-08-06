//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type Binary } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import { FhirBinary, type untypedBinarySchema } from '../../src/index.js'

describe('Binary Resource', () => {
  it('should validate FHIR binary from binaries.json', () => {
    type Schema = z.infer<typeof untypedBinarySchema>
    expectTypeOf<Schema>().toExtend<Binary>()
    expectTypeOf<Binary>().toExtend<Schema>()

    const data = fs.readFileSync('test/resources/binaries.json', 'utf-8')
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirBinary.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
