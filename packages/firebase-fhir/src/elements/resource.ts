//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type Resource } from 'fhir/r4b.js'
import { z, type ZodType } from 'zod'
import {
  codeSchema,
  stringSchema,
  uriSchema,
} from './dataTypes/primitiveTypes.js'
import { elementSchema } from './element.js'
import { metaSchema } from './meta.js'

/**
 * Zod schema for FHIR Resource data type (base type for all FHIR resources).
 */
export const resourceSchema = z.object({
  resourceType: stringSchema,
  id: stringSchema.optional(),
  _id: elementSchema.optional(),
  meta: metaSchema.optional(),
  implicitRules: uriSchema.optional(),
  _implicitRules: elementSchema.optional(),
  language: codeSchema.optional(),
  _language: elementSchema.optional(),
}) satisfies ZodType<Resource>
