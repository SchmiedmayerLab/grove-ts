//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type Identifier } from 'fhir/r4b.js'
import { z, type ZodType } from 'zod'
import { codeableConceptSchema } from './codeableConcept.js'
import { periodSchema } from './period.js'
import { stringSchema, uriSchema } from './primitiveTypes.js'
import { referenceSchema } from './reference.js'
import { elementSchema } from '../element.js'

const identifierUseSchema = z.enum([
  'usual',
  'official',
  'temp',
  'secondary',
  'old',
])

/**
 * Zod schema for FHIR Identifier data type.
 */
export const untypedIdentifierSchema = z.lazy(() =>
  elementSchema.extend({
    use: identifierUseSchema.optional(),
    _use: elementSchema.optional(),
    type: codeableConceptSchema.optional(),
    system: uriSchema.optional(),
    _system: elementSchema.optional(),
    value: stringSchema.optional(),
    _value: elementSchema.optional(),
    period: periodSchema.optional(),
    assigner: referenceSchema.optional(),
  }),
) satisfies ZodType<Identifier>

/**
 * Zod schema for FHIR Identifier data type.
 */
export const identifierSchema: ZodType<Identifier> = untypedIdentifierSchema
