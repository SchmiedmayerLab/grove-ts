//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * The current state of the list.
 * http://hl7.org/fhir/valueset-list-status.html
 */
export const listStatusSchema = z.enum([
  'current',
  'retired',
  'entered-in-error',
])

/**
 * The current state of the list.
 * http://hl7.org/fhir/valueset-list-status.html
 */
export type ListStatus = z.infer<typeof listStatusSchema>

/**
 * The processing mode that applies to this list.
 * http://hl7.org/fhir/valueset-list-mode.html
 */
export const listModeSchema = z.enum(['working', 'snapshot', 'changes'])

/**
 * The processing mode that applies to this list.
 * http://hl7.org/fhir/valueset-list-mode.html
 */
export type ListMode = z.infer<typeof listModeSchema>
