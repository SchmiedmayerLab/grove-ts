//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type Organization } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import {
  FhirOrganization,
  type untypedOrganizationSchema,
} from '../../src/index.js'

describe('Organization Resource', () => {
  it('should validate FHIR organization from organizations.json', () => {
    type Schema = z.infer<typeof untypedOrganizationSchema>
    expectTypeOf<Schema>().toExtend<Organization>()
    expectTypeOf<Organization>().toExtend<Schema>()

    const data = fs.readFileSync('test/resources/organizations.json', 'utf-8')
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirOrganization.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
