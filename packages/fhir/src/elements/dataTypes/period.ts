//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type Period } from 'fhir/r4b.js'
import { z, type ZodType } from 'zod'
import { dateTimeSchema } from './primitiveTypes.js'
import { elementSchema } from '../element.js'

/**
 * Zod schema for FHIR Period data type.
 */
export const untypedPeriodSchema = z.lazy(() =>
  elementSchema.extend({
    start: dateTimeSchema.optional(),
    _start: elementSchema.optional(),
    end: dateTimeSchema.optional(),
    _end: elementSchema.optional(),
  }),
) satisfies ZodType<Period>

/**
 * Zod schema for FHIR Period data type.
 */
export const periodSchema: ZodType<Period> = untypedPeriodSchema
