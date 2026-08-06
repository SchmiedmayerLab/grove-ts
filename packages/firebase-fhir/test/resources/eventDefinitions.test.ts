//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type EventDefinition } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import {
  FhirEventDefinition,
  type untypedEventDefinitionSchema,
} from '../../src/index.js'

describe('EventDefinition Resource', () => {
  it('should validate FHIR event definitions from eventDefinitions.json', () => {
    type Schema = z.infer<typeof untypedEventDefinitionSchema>
    expectTypeOf<Schema>().toExtend<EventDefinition>()
    expectTypeOf<EventDefinition>().toExtend<Schema>()

    const data = fs.readFileSync(
      'test/resources/eventDefinitions.json',
      'utf-8',
    )
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirEventDefinition.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
