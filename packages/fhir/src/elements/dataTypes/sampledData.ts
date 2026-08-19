//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type SampledData } from 'fhir/r4b.js'
import { z, type ZodType } from 'zod'
import {
  decimalSchema,
  positiveDecimalSchema,
  positiveIntSchema,
  stringSchema,
} from './primitiveTypes.js'
import { quantitySchema } from './quantity.js'
import { elementSchema } from '../element.js'

/**
 * Zod schema for FHIR SampledData data type.
 */
export const untypedSampledDataSchema = z.lazy(() =>
  elementSchema.extend({
    origin: quantitySchema,
    period: positiveDecimalSchema,
    factor: decimalSchema.optional(),
    lowerLimit: decimalSchema.optional(),
    upperLimit: decimalSchema.optional(),
    dimensions: positiveIntSchema,
    data: stringSchema.optional(),
    _data: elementSchema.optional(),
  }),
) satisfies ZodType<SampledData>

/**
 * Zod schema for FHIR SampledData data type.
 */
export const sampledDataSchema: ZodType<SampledData> = untypedSampledDataSchema
