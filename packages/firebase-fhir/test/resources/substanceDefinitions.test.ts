//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type SubstanceDefinition } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import {
  FhirSubstanceDefinition,
  type untypedSubstanceDefinitionSchema,
} from '../../src/index.js'

describe('SubstanceDefinition Resource', () => {
  it('should validate FHIR substance definition from substanceDefinitions.json', () => {
    type Schema = z.infer<typeof untypedSubstanceDefinitionSchema>
    expectTypeOf<Schema>().toExtend<SubstanceDefinition>()
    expectTypeOf<SubstanceDefinition>().toExtend<Schema>()

    const data = fs.readFileSync(
      'test/resources/substanceDefinitions.json',
      'utf-8',
    )
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirSubstanceDefinition.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
