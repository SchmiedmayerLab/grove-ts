//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type Appointment } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import {
  FhirAppointment,
  type untypedAppointmentSchema,
} from '../../src/index.js'

describe('Appointment Resource', () => {
  it('should validate FHIR appointment from appointments.json', () => {
    type Schema = z.infer<typeof untypedAppointmentSchema>
    expectTypeOf<Schema>().toExtend<Appointment>()
    expectTypeOf<Appointment>().toExtend<Schema>()

    const data = fs.readFileSync('test/resources/appointments.json', 'utf-8')
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirAppointment.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
