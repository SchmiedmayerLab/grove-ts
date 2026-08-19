// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type PaymentReconciliation } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import {
  FhirPaymentReconciliation,
  type untypedPaymentReconciliationSchema,
} from '../../src/index.js'

describe('PaymentReconciliation Resource', () => {
  it('should validate FHIR PaymentReconciliations from paymentReconciliations.json', () => {
    type Schema = z.infer<typeof untypedPaymentReconciliationSchema>
    expectTypeOf<Schema>().toExtend<PaymentReconciliation>()
    expectTypeOf<PaymentReconciliation>().toExtend<Schema>()

    const data = fs.readFileSync(
      'test/resources/paymentReconciliations.json',
      'utf-8',
    )
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirPaymentReconciliation.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
