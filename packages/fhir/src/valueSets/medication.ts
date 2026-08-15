//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * A coded concept defining if the medication is in active use.
 * http://hl7.org/fhir/valueset-medication-status.html
 */
export const medicationStatusSchema = z.enum([
  'active',
  'inactive',
  'entered-in-error',
])

/**
 * A coded concept defining if the medication is in active use.
 * http://hl7.org/fhir/valueset-medication-status.html
 */
export type MedicationStatus = z.infer<typeof medicationStatusSchema>
