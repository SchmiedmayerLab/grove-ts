//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * The status of the nutrition product.
 * http://hl7.org/fhir/valueset-nutrition-product-status.html
 */
export const nutritionProductStatusSchema = z.enum([
  'active',
  'inactive',
  'entered-in-error',
])

/**
 * The status of the nutrition product.
 * http://hl7.org/fhir/valueset-nutrition-product-status.html
 */
export type NutritionProductStatus = z.infer<
  typeof nutritionProductStatusSchema
>
