//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type CodeableConcept } from 'fhir/r4b.js'
import { z, type ZodType } from 'zod'
import { codingSchema } from './coding.js'
import { stringSchema } from './primitiveTypes.js'
import { elementSchema } from '../element.js'

/**
 * Zod schema for FHIR CodeableConcept data type.
 */
export const untypedCodeableConceptSchema = z.lazy(() =>
  elementSchema.extend({
    coding: codingSchema.array().optional(),
    _coding: elementSchema.optional(),
    text: stringSchema.optional(),
    _text: elementSchema.optional(),
  }),
) satisfies ZodType<CodeableConcept>

/**
 * Zod schema for FHIR CodeableConcept data type.
 */
export const codeableConceptSchema: ZodType<CodeableConcept> =
  untypedCodeableConceptSchema
