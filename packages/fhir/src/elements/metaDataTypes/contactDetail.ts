//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type ContactDetail } from 'fhir/r4b.js'
import { z, type ZodType } from 'zod'
import { contactPointSchema } from '../dataTypes/contactPoint.js'
import { stringSchema } from '../dataTypes/primitiveTypes.js'
import { elementSchema } from '../element.js'

/**
 * Zod schema for FHIR ContactDetail data type.
 */
export const untypedContactDetailSchema = z.lazy(() =>
  elementSchema.extend({
    name: stringSchema.optional(),
    _name: elementSchema.optional(),
    telecom: contactPointSchema.array().optional(),
  }),
) satisfies ZodType<ContactDetail>

/**
 * Zod schema for FHIR ContactDetail data type.
 */
export const contactDetailSchema: ZodType<ContactDetail> =
  untypedContactDetailSchema
