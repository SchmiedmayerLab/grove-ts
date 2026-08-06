//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type Range } from 'fhir/r4b.js'
import { z, type ZodType } from 'zod'
import { quantitySchema } from './quantity.js'
import { elementSchema } from '../element.js'

/**
 * Zod schema for FHIR Range data type.
 */
export const untypedRangeSchema = z.lazy(() =>
  elementSchema.extend({
    low: quantitySchema.optional(),
    high: quantitySchema.optional(),
  }),
) satisfies ZodType<Range>

/**
 * Zod schema for FHIR Range data type.
 */
export const rangeSchema: ZodType<Range> = untypedRangeSchema
