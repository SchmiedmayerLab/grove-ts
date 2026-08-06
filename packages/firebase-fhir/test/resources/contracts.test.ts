//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type Contract } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import { FhirContract, type untypedContractSchema } from '../../src/index.js'

describe('Contract Resource', () => {
  it('should validate FHIR Contracts from contracts.json', () => {
    type Schema = z.infer<typeof untypedContractSchema>
    expectTypeOf<Schema>().toExtend<Contract>()
    expectTypeOf<Contract>().toExtend<Schema>()

    const data = fs.readFileSync('test/resources/contracts.json', 'utf-8')
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirContract.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
