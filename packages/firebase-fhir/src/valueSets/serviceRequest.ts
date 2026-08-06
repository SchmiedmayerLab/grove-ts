//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * The status of a service request.
 * http://hl7.org/fhir/valueset-request-status.html
 */
export const serviceRequestStatusSchema = z.enum([
  'draft',
  'active',
  'on-hold',
  'revoked',
  'completed',
  'entered-in-error',
  'unknown',
])

/**
 * The status of a service request.
 * http://hl7.org/fhir/valueset-request-status.html
 */
export type ServiceRequestStatus = z.infer<typeof serviceRequestStatusSchema>

/**
 * The kind of service request.
 * http://hl7.org/fhir/valueset-request-intent.html
 */
export const serviceRequestIntentSchema = z.enum([
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
 * The kind of service request.
 * http://hl7.org/fhir/valueset-request-intent.html
 */
export type ServiceRequestIntent = z.infer<typeof serviceRequestIntentSchema>
