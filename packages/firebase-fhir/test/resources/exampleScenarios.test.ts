//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type ExampleScenario } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import {
  FhirExampleScenario,
  type untypedExampleScenarioSchema,
} from '../../src/index.js'

describe('ExampleScenario Resource', () => {
  it('should validate FHIR example scenario from exampleScenarios.json', () => {
    type Schema = z.infer<typeof untypedExampleScenarioSchema>
    expectTypeOf<Schema>().toExtend<ExampleScenario>()
    expectTypeOf<ExampleScenario>().toExtend<Schema>()

    const data = fs.readFileSync(
      'test/resources/exampleScenarios.json',
      'utf-8',
    )
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirExampleScenario.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
