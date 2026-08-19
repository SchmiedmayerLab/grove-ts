//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * Type of price component for charge items.
 * http://hl7.org/fhir/valueset-invoice-priceComponentType.html
 */
export const priceComponentTypeSchema = z.enum([
  'base',
  'surcharge',
  'deduction',
  'discount',
  'tax',
  'informational',
])

/**
 * Type of price component for charge items.
 * http://hl7.org/fhir/valueset-invoice-priceComponentType.html
 */
export type PriceComponentType = z.infer<typeof priceComponentTypeSchema>
