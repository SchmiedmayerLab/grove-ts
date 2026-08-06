//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * The status of the immunization event.
 * http://hl7.org/fhir/valueset-immunization-status.html
 */
export const immunizationStatusSchema = z.enum([
  'completed',
  'entered-in-error',
  'not-done',
])

/**
 * The status of the immunization event.
 * http://hl7.org/fhir/valueset-immunization-status.html
 */
export type ImmunizationStatus = z.infer<typeof immunizationStatusSchema>
