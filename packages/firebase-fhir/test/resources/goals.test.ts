//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type Goal } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import { FhirGoal, type untypedGoalSchema } from '../../src/index.js'

describe('Goal Resource', () => {
  it('should validate FHIR Goals from goals.json', () => {
    type Schema = z.infer<typeof untypedGoalSchema>
    expectTypeOf<Schema>().toExtend<Goal>()
    expectTypeOf<Goal>().toExtend<Schema>()

    const data = fs.readFileSync('test/resources/goals.json', 'utf-8')
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirGoal.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
