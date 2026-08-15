//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * A code specifying the state of the medication statement.
 * http://hl7.org/fhir/valueset-medication-statement-status.html
 */
export const medicationStatementStatusSchema = z.enum([
  'active',
  'completed',
  'entered-in-error',
  'intended',
  'stopped',
  'on-hold',
  'unknown',
  'not-taken',
])

/**
 * A code specifying the state of the medication statement.
 * http://hl7.org/fhir/valueset-medication-statement-status.html
 */
export type MedicationStatementStatus = z.infer<
  typeof medicationStatementStatusSchema
>
