//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * The workflow status of the nutrition order/request.
 * http://hl7.org/fhir/valueset-request-status.html
 */
export const nutritionOrderStatusSchema = z.enum([
  'draft',
  'active',
  'on-hold',
  'revoked',
  'completed',
  'entered-in-error',
  'unknown',
])

/**
 * The workflow status of the nutrition order/request.
 * http://hl7.org/fhir/valueset-request-status.html
 */
export type NutritionOrderStatus = z.infer<typeof nutritionOrderStatusSchema>

/**
 * Indicates the level of authority/intentionality associated with the nutrition order.
 * http://hl7.org/fhir/valueset-request-intent.html
 */
export const nutritionOrderIntentSchema = z.enum([
  'proposal',
  'plan',
  'directive',
  'order',
  'original-order',
  'reflex-order',
  'filler-order',
  'instance-order',
  'option',
])

/**
 * Indicates the level of authority/intentionality associated with the nutrition order.
 * http://hl7.org/fhir/valueset-request-intent.html
 */
export type NutritionOrderIntent = z.infer<typeof nutritionOrderIntentSchema>
