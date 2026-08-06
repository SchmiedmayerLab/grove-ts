//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type Procedure } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import { FhirProcedure, type untypedProcedureSchema } from '../../src/index.js'

describe('Procedure Resource', () => {
  it('should validate FHIR Procedures from procedures.json', () => {
    type Schema = z.infer<typeof untypedProcedureSchema>
    expectTypeOf<Schema>().toExtend<Procedure>()
    expectTypeOf<Procedure>().toExtend<Schema>()

    const data = fs.readFileSync('test/resources/procedures.json', 'utf-8')
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirProcedure.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
