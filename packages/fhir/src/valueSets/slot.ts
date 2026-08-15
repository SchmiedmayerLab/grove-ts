//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * The status of a slot.
 * http://hl7.org/fhir/valueset-slotstatus.html
 */
export const slotStatusSchema = z.enum([
  'busy',
  'free',
  'busy-unavailable',
  'busy-tentative',
  'entered-in-error',
])

/**
 * The status of a slot.
 * http://hl7.org/fhir/valueset-slotstatus.html
 */
export type SlotStatus = z.infer<typeof slotStatusSchema>
