//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type DataRequirement } from 'fhir/r4b.js'
import { z, type ZodType } from 'zod'
import { fhirTypeSchema } from '../../valueSets/index.js'
import { codeableConceptSchema } from '../dataTypes/codeableConcept.js'
import { codingSchema } from '../dataTypes/coding.js'
import { periodSchema } from '../dataTypes/period.js'
import {
  dateTimeSchema,
  positiveIntSchema,
  stringSchema,
} from '../dataTypes/primitiveTypes.js'
import { referenceSchema } from '../dataTypes/reference.js'
import { elementSchema } from '../element.js'

const dataRequirementSortDirectionSchema = z.enum(['ascending', 'descending'])

/**
 * Zod schema for FHIR DataRequirement data type.
 */
export const untypedDataRequirementSchema = z.lazy(() =>
  elementSchema.extend({
    type: fhirTypeSchema,
    _type: elementSchema.optional(),
    profile: stringSchema.array().optional(),
    _profile: elementSchema.array().optional(),
    subjectCodeableConcept: codeableConceptSchema.optional(),
    subjectReference: referenceSchema.optional(),
    mustSupport: stringSchema.array().optional(),
    _mustSupport: elementSchema.array().optional(),
    codeFilter: elementSchema
      .extend({
        path: stringSchema.optional(),
        searchParam: stringSchema.optional(),
        valueSet: stringSchema.optional(),
        code: codingSchema.array().optional(),
      })
      .array()
      .optional(),
    dateFilter: elementSchema
      .extend({
        path: stringSchema.optional(),
        searchParam: stringSchema.optional(),
        valueDateTime: dateTimeSchema.optional(),
        valuePeriod: periodSchema.optional(),
      })
      .array()
      .optional(),
    limit: positiveIntSchema.optional(),
    sort: elementSchema
      .extend({
        direction: dataRequirementSortDirectionSchema,
        _direction: elementSchema.optional(),
        path: stringSchema,
        _path: elementSchema.optional(),
      })
      .array()
      .optional(),
  }),
) satisfies ZodType<DataRequirement>

/**
 * Zod schema for FHIR DataRequirement data type.
 */
export const dataRequirementSchema: ZodType<DataRequirement> =
  untypedDataRequirementSchema
