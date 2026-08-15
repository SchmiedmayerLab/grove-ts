//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * Codes indicating the level of authority/intentionality associated with a request.
 * http://hl7.org/fhir/ValueSet/request-intent
 */
export const requestIntentSchema = z.enum([
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
 * Codes indicating the level of authority/intentionality associated with a request.
 * http://hl7.org/fhir/ValueSet/request-intent
 */
export type RequestIntent = z.infer<typeof requestIntentSchema>
