//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type Quantity } from 'fhir/r4b.js'
import { z, type ZodType } from 'zod'
import {
  codeSchema,
  decimalSchema,
  stringSchema,
  uriSchema,
} from './primitiveTypes.js'
import { elementSchema } from '../element.js'

const quantityComparatorSchema = z.enum(['<', '<=', '>=', '>'])

/**
 * Zod schema for FHIR Quantity data type.
 */
export const untypedQuantitySchema = z.lazy(() =>
  elementSchema.extend({
    value: decimalSchema.optional(),
    comparator: quantityComparatorSchema.optional(),
    _comparator: elementSchema.optional(),
    unit: stringSchema.optional(),
    _unit: elementSchema.optional(),
    system: uriSchema.optional(),
    _system: elementSchema.optional(),
    code: codeSchema.optional(),
    _code: elementSchema.optional(),
  }),
) satisfies ZodType<Quantity>

/**
 * Zod schema for FHIR Quantity data type.
 */
export const quantitySchema: ZodType<Quantity> = untypedQuantitySchema
