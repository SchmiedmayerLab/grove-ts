//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type DocumentReference } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import {
  FhirDocumentReference,
  type untypedDocumentReferenceSchema,
} from '../../src/index.js'

describe('DocumentReference Resource', () => {
  it('should validate FHIR document reference from documentReferences.json', () => {
    type Schema = z.infer<typeof untypedDocumentReferenceSchema>
    expectTypeOf<Schema>().toExtend<DocumentReference>()
    expectTypeOf<DocumentReference>().toExtend<Schema>()

    const data = fs.readFileSync(
      'test/resources/documentReferences.json',
      'utf-8',
    )
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirDocumentReference.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
