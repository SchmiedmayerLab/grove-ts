//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type Ratio } from 'fhir/r4b.js'
import { z, type ZodType } from 'zod'
import { quantitySchema } from './quantity.js'
import { elementSchema } from '../element.js'

/**
 * Zod schema for FHIR Ratio data type.
 */
export const untypedRatioSchema = z.lazy(() =>
  elementSchema.extend({
    numerator: quantitySchema.optional(),
    denominator: quantitySchema.optional(),
  }),
) satisfies ZodType<Ratio>

/**
 * Zod schema for FHIR Ratio data type.
 */
export const ratioSchema: ZodType<Ratio> = untypedRatioSchema
