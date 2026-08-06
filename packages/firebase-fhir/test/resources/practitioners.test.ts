// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type Practitioner } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import {
  FhirPractitioner,
  type untypedPractitionerSchema,
} from '../../src/index.js'

describe('Practitioner Resource', () => {
  it('should validate FHIR Practitioners from practitioners.json', () => {
    type Schema = z.infer<typeof untypedPractitionerSchema>
    expectTypeOf<Schema>().toExtend<Practitioner>()
    expectTypeOf<Practitioner>().toExtend<Schema>()

    const data = fs.readFileSync('test/resources/practitioners.json', 'utf-8')
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirPractitioner.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
