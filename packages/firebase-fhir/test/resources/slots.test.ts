//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type Slot } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import { FhirSlot, type untypedSlotSchema } from '../../src/index.js'

describe('Slot Resource', () => {
  it('should validate FHIR slot from slots.json', () => {
    type Schema = z.infer<typeof untypedSlotSchema>
    expectTypeOf<Schema>().toExtend<Slot>()
    expectTypeOf<Slot>().toExtend<Schema>()

    const data = fs.readFileSync('test/resources/slots.json', 'utf-8')
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirSlot.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })

  it('exposes validated slot boundaries as dates', () => {
    const slot = FhirSlot.parse({
      resourceType: 'Slot',
      schedule: { reference: 'Schedule/example' },
      status: 'free',
      start: '2024-12-15T09:00:00Z',
      end: '2024-12-15T09:30:00Z',
    })

    expect(slot.startDate.toISOString()).toBe('2024-12-15T09:00:00.000Z')
    expect(slot.endDate.toISOString()).toBe('2024-12-15T09:30:00.000Z')
  })
})
