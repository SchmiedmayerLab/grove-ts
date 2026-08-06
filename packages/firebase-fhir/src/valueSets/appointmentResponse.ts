//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * Participation status of the appointment.
 * http://hl7.org/fhir/valueset-participationstatus.html
 */
export const appointmentResponseParticipantStatusSchema = z.enum([
  'accepted',
  'declined',
  'tentative',
  'needs-action',
])

/**
 * Participation status of the appointment.
 * http://hl7.org/fhir/valueset-participationstatus.html
 */
export type AppointmentResponseParticipantStatus = z.infer<
  typeof appointmentResponseParticipantStatusSchema
>
