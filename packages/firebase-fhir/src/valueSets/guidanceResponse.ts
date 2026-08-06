//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * The status of the guidance response.
 * http://hl7.org/fhir/valueset-guidance-response-status.html
 */
export const guidanceResponseStatusSchema = z.enum([
  'success',
  'data-requested',
  'data-required',
  'in-progress',
  'failure',
  'entered-in-error',
])

/**
 * The status of the guidance response.
 * http://hl7.org/fhir/valueset-guidance-response-status.html
 */
export type GuidanceResponseStatus = z.infer<
  typeof guidanceResponseStatusSchema
>
