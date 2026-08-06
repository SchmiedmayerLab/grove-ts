//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type MarketingStatus } from 'fhir/r4b.js'
import { z, type ZodType } from 'zod'
import { codeableConceptSchema } from './codeableConcept.js'
import { periodSchema } from './period.js'
import { dateTimeSchema } from './primitiveTypes.js'
import { backboneElementSchema } from '../backBoneElement.js'
import { elementSchema } from '../element.js'

/**
 * Zod schema for FHIR MarketingStatus data type.
 */
export const untypedMarketingStatusSchema = z.lazy(() =>
  backboneElementSchema.extend({
    country: codeableConceptSchema.optional(),
    dateRange: periodSchema.optional(),
    jurisdiction: codeableConceptSchema.optional(),
    restoreDate: dateTimeSchema.optional(),
    _restoreDate: elementSchema.optional(),
    status: codeableConceptSchema,
  }),
) satisfies ZodType<MarketingStatus>

/**
 * Zod schema for FHIR MarketingStatus data type.
 */
export const marketingStatusSchema: ZodType<MarketingStatus> =
  untypedMarketingStatusSchema
