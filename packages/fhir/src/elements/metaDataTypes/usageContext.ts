//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type UsageContext } from 'fhir/r4b.js'
import { z, type ZodType } from 'zod'
import { codeableConceptSchema } from '../dataTypes/codeableConcept.js'
import { codingSchema } from '../dataTypes/coding.js'
import { quantitySchema } from '../dataTypes/quantity.js'
import { rangeSchema } from '../dataTypes/range.js'
import { referenceSchema } from '../dataTypes/reference.js'
import { elementSchema } from '../element.js'

/**
 * Zod schema for FHIR UsageContext data type.
 */
export const untypedUsageContextSchema = z.lazy(() =>
  elementSchema.extend({
    code: codingSchema,
    _code: elementSchema.optional(),
    valueCodeableConcept: codeableConceptSchema.optional(),
    valueQuantity: quantitySchema.optional(),
    valueRange: rangeSchema.optional(),
    valueReference: referenceSchema.optional(),
  }),
) satisfies ZodType<UsageContext>

/**
 * Zod schema for FHIR UsageContext data type.
 */
export const usageContextSchema: ZodType<UsageContext> =
  untypedUsageContextSchema
