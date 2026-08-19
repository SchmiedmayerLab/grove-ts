//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * Codes identifying the lifecycle stage of a ChargeItem.
 * http://hl7.org/fhir/valueset-chargeitem-status.html
 */
export const chargeItemStatusSchema = z.enum([
  'planned',
  'billable',
  'not-billable',
  'aborted',
  'billed',
  'entered-in-error',
  'unknown',
])

/**
 * Codes identifying the lifecycle stage of a ChargeItem.
 * http://hl7.org/fhir/valueset-chargeitem-status.html
 */
export type ChargeItemStatus = z.infer<typeof chargeItemStatusSchema>
