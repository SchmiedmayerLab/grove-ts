//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type SupplyDelivery } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import {
  FhirSupplyDelivery,
  type untypedSupplyDeliverySchema,
} from '../../src/index.js'

describe('SupplyDelivery Resource', () => {
  it('should validate FHIR supply delivery from supplyDeliveries.json', () => {
    type Schema = z.infer<typeof untypedSupplyDeliverySchema>
    expectTypeOf<Schema>().toExtend<SupplyDelivery>()
    expectTypeOf<SupplyDelivery>().toExtend<Schema>()

    const data = fs.readFileSync(
      'test/resources/supplyDeliveries.json',
      'utf-8',
    )
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirSupplyDelivery.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
