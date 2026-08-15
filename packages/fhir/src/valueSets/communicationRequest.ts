//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * The status of the communication request.
 * http://hl7.org/fhir/valueset-request-status.html
 */
export const communicationRequestStatusSchema = z.enum([
  'draft',
  'active',
  'on-hold',
  'revoked',
  'completed',
  'entered-in-error',
  'unknown',
])

/**
 * The status of the communication request.
 * http://hl7.org/fhir/valueset-request-status.html
 */
export type CommunicationRequestStatus = z.infer<
  typeof communicationRequestStatusSchema
>
