//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * Codes that reflect the current state of a goal and whether the goal is still being targeted.
 * http://hl7.org/fhir/valueset-goal-status.html
 */
export const goalLifecycleStatusSchema = z.enum([
  'proposed',
  'planned',
  'accepted',
  'active',
  'on-hold',
  'completed',
  'cancelled',
  'entered-in-error',
  'rejected',
])

/**
 * Codes that reflect the current state of a goal and whether the goal is still being targeted.
 * http://hl7.org/fhir/valueset-goal-status.html
 */
export type GoalLifecycleStatus = z.infer<typeof goalLifecycleStatusSchema>
