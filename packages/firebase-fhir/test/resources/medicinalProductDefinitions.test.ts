//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type MedicinalProductDefinition } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import {
  FhirMedicinalProductDefinition,
  type untypedMedicinalProductDefinitionSchema,
} from '../../src/index.js'

describe('MedicinalProductDefinition Resource', () => {
  it('should validate FHIR medicinal product definition from medicinalProductDefinitions.json', () => {
    type Schema = z.infer<typeof untypedMedicinalProductDefinitionSchema>
    expectTypeOf<Schema>().toExtend<MedicinalProductDefinition>()
    expectTypeOf<MedicinalProductDefinition>().toExtend<Schema>()

    const data = fs.readFileSync(
      'test/resources/medicinalProductDefinitions.json',
      'utf-8',
    )
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource =
        FhirMedicinalProductDefinition.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
