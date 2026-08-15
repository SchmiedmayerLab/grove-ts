//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type SpecimenDefinition } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import {
  FhirSpecimenDefinition,
  type untypedSpecimenDefinitionSchema,
} from '../../src/index.js'

describe('SpecimenDefinition Resource', () => {
  it('should validate FHIR SpecimenDefinitions from specimenDefinitions.json', () => {
    type Schema = z.infer<typeof untypedSpecimenDefinitionSchema>
    expectTypeOf<Schema>().toExtend<SpecimenDefinition>()
    expectTypeOf<SpecimenDefinition>().toExtend<Schema>()

    const data = fs.readFileSync(
      'test/resources/specimenDefinitions.json',
      'utf-8',
    )
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirSpecimenDefinition.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
