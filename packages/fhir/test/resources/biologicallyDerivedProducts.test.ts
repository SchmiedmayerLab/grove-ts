//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type BiologicallyDerivedProduct } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import {
  FhirBiologicallyDerivedProduct,
  type untypedBiologicallyDerivedProductSchema,
} from '../../src/index.js'

describe('BiologicallyDerivedProduct Resource', () => {
  it('should validate FHIR biologicallyDerivedProduct from biologicallyDerivedProducts.json', () => {
    type Schema = z.infer<typeof untypedBiologicallyDerivedProductSchema>
    expectTypeOf<Schema>().toExtend<BiologicallyDerivedProduct>()
    expectTypeOf<BiologicallyDerivedProduct>().toExtend<Schema>()

    const data = fs.readFileSync(
      'test/resources/biologicallyDerivedProducts.json',
      'utf-8',
    )
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource =
        FhirBiologicallyDerivedProduct.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
