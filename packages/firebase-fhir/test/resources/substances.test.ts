//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type Substance } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import { FhirSubstance, type untypedSubstanceSchema } from '../../src/index.js'

describe('Substance Resource', () => {
  it('should validate FHIR substance from substances.json', () => {
    type Schema = z.infer<typeof untypedSubstanceSchema>
    expectTypeOf<Schema>().toExtend<Substance>()
    expectTypeOf<Substance>().toExtend<Schema>()

    const data = fs.readFileSync('test/resources/substances.json', 'utf-8')
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirSubstance.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
