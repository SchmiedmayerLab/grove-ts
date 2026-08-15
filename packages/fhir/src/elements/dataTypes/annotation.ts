//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type Annotation } from 'fhir/r4b.js'
import { z, type ZodType } from 'zod'
import {
  dateTimeSchema,
  markdownSchema,
  stringSchema,
} from './primitiveTypes.js'
import { referenceSchema } from './reference.js'
import { elementSchema } from '../element.js'

/**
 * Zod schema for FHIR Annotation data type.
 */
export const untypedAnnotationSchema = z.lazy(() =>
  elementSchema.extend({
    authorReference: referenceSchema.optional(),
    authorString: stringSchema.optional(),
    _authorString: elementSchema.optional(),
    time: dateTimeSchema.optional(),
    _time: elementSchema.optional(),
    text: markdownSchema,
    _text: elementSchema.optional(),
  }),
) satisfies ZodType<Annotation>

/**
 * Zod schema for FHIR Annotation data type.
 */
export const annotationSchema: ZodType<Annotation> = untypedAnnotationSchema
