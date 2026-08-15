//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type Contributor } from 'fhir/r4b.js'
import { z, type ZodType } from 'zod'
import { contactDetailSchema } from './contactDetail.js'
import { stringSchema } from '../dataTypes/primitiveTypes.js'
import { elementSchema } from '../element.js'

const contributorTypeSchema = z.enum([
  'author',
  'editor',
  'reviewer',
  'endorser',
])

/**
 * Zod schema for FHIR Contributor data type.
 */
export const untypedContributorSchema = z.lazy(() =>
  elementSchema.extend({
    type: contributorTypeSchema,
    _type: elementSchema.optional(),
    name: stringSchema,
    _name: elementSchema.optional(),
    contact: contactDetailSchema.array().optional(),
  }),
) satisfies ZodType<Contributor>

/**
 * Zod schema for FHIR Contributor data type.
 */
export const contributorSchema: ZodType<Contributor> = untypedContributorSchema
