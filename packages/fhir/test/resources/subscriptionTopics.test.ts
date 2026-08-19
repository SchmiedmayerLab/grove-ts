//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'fs'
import { expectTypeOf } from 'expect-type'
import { type SubscriptionTopic } from 'fhir/r4b.js'
import { type z } from 'zod'
import { jsonStringifyDeterministically } from './testHelpers.js'
import {
  FhirSubscriptionTopic,
  type untypedSubscriptionTopicSchema,
} from '../../src/index.js'

describe('SubscriptionTopic Resource', () => {
  it('should validate FHIR subscription topic from subscriptionTopics.json', () => {
    type Schema = z.infer<typeof untypedSubscriptionTopicSchema>
    expectTypeOf<Schema>().toExtend<SubscriptionTopic>()
    expectTypeOf<SubscriptionTopic>().toExtend<Schema>()

    const data = fs.readFileSync(
      'test/resources/subscriptionTopics.json',
      'utf-8',
    )
    const decodedJson = JSON.parse(data)

    Object.values(decodedJson).forEach((jsonValue: unknown) => {
      const parsedResource = FhirSubscriptionTopic.parse(jsonValue).value
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      )
    })
  })
})
