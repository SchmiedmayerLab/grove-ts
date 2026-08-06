//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type Bundle } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import {
  bundleSchema,
  FhirBundle,
  fhirResourceSchema,
  type untypedGenericBundleSchema,
} from '../../src/index.js'

describe('Bundle Resource', () => {
  it('should validate FHIR bundle from bundles.json', () => {
    type Schema = z.infer<typeof untypedGenericBundleSchema>
    expectTypeOf<Schema>().toExtend<Bundle>()
    expectTypeOf<Bundle>().toExtend<Schema>()

    const data = fs.readFileSync('test/resources/bundles.json', 'utf-8')
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResourceOwnSchemaBuild =
        bundleSchema(fhirResourceSchema).parse(jsonValue)
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResourceOwnSchemaBuild),
      )
      const parsedResource = FhirBundle.parseGeneric(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
