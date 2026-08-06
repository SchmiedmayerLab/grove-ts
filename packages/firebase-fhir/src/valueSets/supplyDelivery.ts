//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * Status of the supply delivery
 * http://hl7.org/fhir/valueset-supplydelivery-status.html
 */
export const supplyDeliveryStatusSchema = z.enum([
  'in-progress',
  'completed',
  'abandoned',
  'entered-in-error',
])

/**
 * Status of the supply delivery
 * http://hl7.org/fhir/valueset-supplydelivery-status.html
 */
export type SupplyDeliveryStatus = z.infer<typeof supplyDeliveryStatusSchema>
