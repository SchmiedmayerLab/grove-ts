//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * A code specifying the state of the dispense event.
 * http://hl7.org/fhir/valueset-medicationdispense-status.html
 */
export const medicationDispenseStatusSchema = z.enum([
  'preparation',
  'in-progress',
  'cancelled',
  'on-hold',
  'completed',
  'entered-in-error',
  'stopped',
  'declined',
  'unknown',
])

/**
 * A code specifying the state of the dispense event.
 * http://hl7.org/fhir/valueset-medicationdispense-status.html
 */
export type MedicationDispenseStatus = z.infer<
  typeof medicationDispenseStatusSchema
>
