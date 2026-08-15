//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * Codes providing the status of an observation.
 * http://hl7.org/fhir/valueset-observation-status.html
 */
export const observationStatusSchema = z.enum([
  'registered',
  'preliminary',
  'final',
  'amended',
  'corrected',
  'cancelled',
  'entered-in-error',
  'unknown',
])

/**
 * Codes providing the status of an observation.
 * http://hl7.org/fhir/valueset-observation-status.html
 */
export type ObservationStatus = z.infer<typeof observationStatusSchema>
