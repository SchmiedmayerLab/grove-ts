//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type GraphDefinition } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import {
  FhirGraphDefinition,
  type untypedGraphDefinitionSchema,
} from '../../src/index.js'

describe('GraphDefinition Resource', () => {
  it('should validate FHIR graph definition from graphDefinitions.json', () => {
    type Schema = z.infer<typeof untypedGraphDefinitionSchema>
    expectTypeOf<Schema>().toExtend<GraphDefinition>()
    expectTypeOf<GraphDefinition>().toExtend<Schema>()

    const data = fs.readFileSync(
      'test/resources/graphDefinitions.json',
      'utf-8',
    )
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirGraphDefinition.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
