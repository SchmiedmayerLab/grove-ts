//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type Device } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import { FhirDevice, type untypedDeviceSchema } from '../../src/index.js'

describe('Device Resource', () => {
  it('should validate FHIR Devices from devices.json', () => {
    type Schema = z.infer<typeof untypedDeviceSchema>
    expectTypeOf<Schema>().toExtend<Device>()
    expectTypeOf<Device>().toExtend<Schema>()

    const data = fs.readFileSync('test/resources/devices.json', 'utf-8')
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirDevice.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
