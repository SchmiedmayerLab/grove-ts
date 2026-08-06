//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type VisionPrescription } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import {
  FhirVisionPrescription,
  type untypedVisionPrescriptionSchema,
} from '../../src/index.js'

describe('VisionPrescription Resource', () => {
  it('should validate FHIR VisionPrescriptions from visionPrescriptions.json', () => {
    type Schema = z.infer<typeof untypedVisionPrescriptionSchema>
    expectTypeOf<Schema>().toExtend<VisionPrescription>()
    expectTypeOf<VisionPrescription>().toExtend<Schema>()

    const data = fs.readFileSync(
      'test/resources/visionPrescriptions.json',
      'utf-8',
    )
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirVisionPrescription.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
