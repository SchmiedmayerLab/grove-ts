//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * A code specifying the state of the medication administration.
 * http://hl7.org/fhir/valueset-medication-admin-status.html
 */
export const medicationAdministrationStatusSchema = z.enum([
  'in-progress',
  'not-done',
  'on-hold',
  'completed',
  'entered-in-error',
  'stopped',
  'unknown',
])

/**
 * A code specifying the state of the medication administration.
 * http://hl7.org/fhir/valueset-medication-admin-status.html
 */
export type MedicationAdministrationStatus = z.infer<
  typeof medicationAdministrationStatusSchema
>
