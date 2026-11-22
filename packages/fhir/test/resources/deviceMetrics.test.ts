//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type DeviceMetric } from 'fhir/r4b.js'
import { type z } from 'zod'
import {
  FhirDeviceMetric,
  type untypedDeviceMetricSchema,
} from '../../src/index.js'
import { jsonStringifyDeterministically } from './testHelpers.js'

describe('DeviceMetric Resource', () => {
  it('should validate FHIR DeviceMetrics from deviceMetrics.json', () => {
    type DeviceMetricSchema = z.infer<typeof untypedDeviceMetricSchema>
    expectTypeOf<DeviceMetricSchema>().toExtend<DeviceMetric>()
    expectTypeOf<DeviceMetric>().toExtend<DeviceMetricSchema>()

    const data = fs.readFileSync('test/resources/deviceMetrics.json', 'utf-8')
    const decodedJson = JSON.parse(data) as Record<string, unknown>

    Object.values(decodedJson).forEach((jsonValue) => {
      const parsedResource = FhirDeviceMetric.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
