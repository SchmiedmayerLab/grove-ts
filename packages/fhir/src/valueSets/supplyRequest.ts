//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * Status of the supply request
 * http://hl7.org/fhir/valueset-supplyrequest-status.html
 */
export const supplyRequestStatusSchema = z.enum([
  'draft',
  'active',
  'suspended',
  'cancelled',
  'completed',
  'entered-in-error',
  'unknown',
])

/**
 * Status of the supply request
 * http://hl7.org/fhir/valueset-supplyrequest-status.html
 */
export type SupplyRequestStatus = z.infer<typeof supplyRequestStatusSchema>
