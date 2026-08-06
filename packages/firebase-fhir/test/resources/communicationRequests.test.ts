//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type CommunicationRequest } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import {
  FhirCommunicationRequest,
  type untypedCommunicationRequestSchema,
} from '../../src/index.js'

describe('CommunicationRequest Resource', () => {
  it('should validate FHIR CommunicationRequests from communicationRequests.json', () => {
    type Schema = z.infer<typeof untypedCommunicationRequestSchema>
    expectTypeOf<Schema>().toExtend<CommunicationRequest>()
    expectTypeOf<CommunicationRequest>().toExtend<Schema>()

    const data = fs.readFileSync(
      'test/resources/communicationRequests.json',
      'utf-8',
    )
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirCommunicationRequest.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
