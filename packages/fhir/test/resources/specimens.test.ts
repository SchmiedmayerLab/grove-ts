//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type Specimen } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import { FhirSpecimen, type untypedSpecimenSchema } from '../../src/index.js'

describe('Specimen Resource', () => {
  it('should validate FHIR specimen from specimens.json', () => {
    type Schema = z.infer<typeof untypedSpecimenSchema>
    expectTypeOf<Schema>().toExtend<Specimen>()
    expectTypeOf<Specimen>().toExtend<Schema>()

    const data = fs.readFileSync('test/resources/specimens.json', 'utf-8')
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirSpecimen.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
