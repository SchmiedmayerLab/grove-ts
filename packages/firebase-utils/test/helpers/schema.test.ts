//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'
import {
  BidirectionalSchema,
  createBidirectionalSchema,
} from '../../src/helpers/schema.js'

describe('BidirectionalSchema', () => {
  it('uses one schema in both directions', () => {
    const schema = BidirectionalSchema.simple(z.string().trim())

    expect(schema.forward).toBe(schema.backward)
    expect(schema.decode(' value ')).toBe('value')
    expect(schema.encode(' value ')).toBe('value')
  })

  it('supports distinct decoding and encoding schemas', () => {
    const schema = BidirectionalSchema.separate(
      z.string().transform((value) => ({ value })),
      z.object({ value: z.string() }).transform(({ value }) => value),
    )

    expect(schema.decode('grove')).toEqual({ value: 'grove' })
    expect(schema.encode({ value: 'grove' })).toBe('grove')
  })
})

describe('createBidirectionalSchema', () => {
  it('returns the supplied schemas', () => {
    const forward = z.string().transform((value) => ({ value }))
    const backward = z
      .object({ value: z.string() })
      .transform(({ value }) => value)

    expect(createBidirectionalSchema(forward, backward)).toEqual({
      forward,
      backward,
    })
  })
})
