//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * The status of the coverage.
 * http://hl7.org/fhir/valueset-fm-status.html
 */
export const coverageStatusSchema = z.enum([
  'active',
  'cancelled',
  'draft',
  'entered-in-error',
])

/**
 * The status of the coverage.
 * http://hl7.org/fhir/valueset-fm-status.html
 */
export type CoverageStatus = z.infer<typeof coverageStatusSchema>
