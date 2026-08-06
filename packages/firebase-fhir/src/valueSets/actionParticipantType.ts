//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * The type of participant for the action.
 * http://hl7.org/fhir/ValueSet/action-participant-type
 */
export const actionParticipantTypeSchema = z.enum([
  'patient',
  'practitioner',
  'related-person',
  'device',
])

/**
 * The type of participant for the action.
 * http://hl7.org/fhir/ValueSet/action-participant-type
 */
export type ActionParticipantType = z.infer<typeof actionParticipantTypeSchema>
