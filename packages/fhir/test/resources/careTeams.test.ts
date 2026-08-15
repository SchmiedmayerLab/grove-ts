//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type CareTeam } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import { FhirCareTeam, type untypedCareTeamSchema } from '../../src/index.js'

describe('CareTeam Resource', () => {
  it('should validate FHIR CareTeams from careTeams.json', () => {
    type Schema = z.infer<typeof untypedCareTeamSchema>
    expectTypeOf<Schema>().toExtend<CareTeam>()
    expectTypeOf<CareTeam>().toExtend<Schema>()

    const data = fs.readFileSync('test/resources/careTeams.json', 'utf-8')
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirCareTeam.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
