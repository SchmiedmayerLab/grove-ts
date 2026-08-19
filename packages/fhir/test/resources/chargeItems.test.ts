// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type ChargeItem } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import {
  FhirChargeItem,
  type untypedChargeItemSchema,
} from '../../src/index.js'

describe('ChargeItem Resource', () => {
  it('should validate FHIR ChargeItems from chargeItems.json', () => {
    type Schema = z.infer<typeof untypedChargeItemSchema>
    expectTypeOf<Schema>().toExtend<ChargeItem>()
    expectTypeOf<ChargeItem>().toExtend<Schema>()

    const data = fs.readFileSync('test/resources/chargeItems.json', 'utf-8')
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirChargeItem.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
