//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * The current status of the task.
 * http://hl7.org/fhir/valueset-task-status.html
 */
export const taskStatusSchema = z.enum([
  'draft',
  'requested',
  'received',
  'accepted',
  'rejected',
  'ready',
  'cancelled',
  'in-progress',
  'on-hold',
  'failed',
  'completed',
  'entered-in-error',
])

/**
 * The current status of the task.
 * http://hl7.org/fhir/valueset-task-status.html
 */
export type TaskStatus = z.infer<typeof taskStatusSchema>

/**
 * Distinguishes whether the task is a proposal, plan or full order.
 * http://hl7.org/fhir/valueset-task-intent.html
 */
export const taskIntentSchema = z.enum([
  'unknown',
  'proposal',
  'plan',
  'order',
  'original-order',
  'reflex-order',
  'filler-order',
  'instance-order',
  'option',
])

/**
 * Distinguishes whether the task is a proposal, plan or full order.
 * http://hl7.org/fhir/valueset-task-intent.html
 */
export type TaskIntent = z.infer<typeof taskIntentSchema>
