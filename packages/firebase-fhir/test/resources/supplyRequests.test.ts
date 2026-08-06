//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type SupplyRequest } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import {
  FhirSupplyRequest,
  type untypedSupplyRequestSchema,
} from '../../src/index.js'

describe('SupplyRequest Resource', () => {
  it('should validate FHIR supply request from supplyRequests.json', () => {
    type Schema = z.infer<typeof untypedSupplyRequestSchema>
    expectTypeOf<Schema>().toExtend<SupplyRequest>()
    expectTypeOf<SupplyRequest>().toExtend<Schema>()

    const data = fs.readFileSync('test/resources/supplyRequests.json', 'utf-8')
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirSupplyRequest.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
