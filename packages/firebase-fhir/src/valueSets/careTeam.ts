//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * Indicates the status of the care team.
 * http://hl7.org/fhir/valueset-care-team-status.html
 */
export const careTeamStatusSchema = z.enum([
  'proposed',
  'active',
  'suspended',
  'inactive',
  'entered-in-error',
])

/**
 * Indicates the status of the care team.
 * http://hl7.org/fhir/valueset-care-team-status.html
 */
export type CareTeamStatus = z.infer<typeof careTeamStatusSchema>
