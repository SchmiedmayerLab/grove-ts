//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type Schedule } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import { FhirSchedule, type untypedScheduleSchema } from '../../src/index.js'

describe('Schedule Resource', () => {
  it('should validate FHIR schedule from schedules.json', () => {
    type Schema = z.infer<typeof untypedScheduleSchema>
    expectTypeOf<Schema>().toExtend<Schedule>()
    expectTypeOf<Schedule>().toExtend<Schema>()

    const data = fs.readFileSync('test/resources/schedules.json', 'utf-8')
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirSchedule.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
