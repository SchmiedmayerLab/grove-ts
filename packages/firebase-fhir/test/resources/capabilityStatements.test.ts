//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type CapabilityStatement } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import {
  FhirCapabilityStatement,
  type untypedCapabilityStatementSchema,
} from '../../src/index.js'

describe('CapabilityStatement Resource', () => {
  it('should validate FHIR capability statement from capabilityStatements.json', () => {
    type Schema = z.infer<typeof untypedCapabilityStatementSchema>
    expectTypeOf<Schema>().toExtend<CapabilityStatement>()
    expectTypeOf<CapabilityStatement>().toExtend<Schema>()

    const data = fs.readFileSync(
      'test/resources/capabilityStatements.json',
      'utf-8',
    )
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirCapabilityStatement.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
