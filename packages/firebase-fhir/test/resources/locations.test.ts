//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type Location } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import { FhirLocation, type untypedLocationSchema } from '../../src/index.js'

describe('Location Resource', () => {
  it('should validate FHIR location from locations.json', () => {
    type Schema = z.infer<typeof untypedLocationSchema>
    expectTypeOf<Schema>().toExtend<Location>()
    expectTypeOf<Location>().toExtend<Schema>()

    const data = fs.readFileSync('test/resources/locations.json', 'utf-8')
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirLocation.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
