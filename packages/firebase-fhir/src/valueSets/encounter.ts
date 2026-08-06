//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * The status of an encounter.
 * http://hl7.org/fhir/valueset-encounter-status.html
 */
export const encounterStatusSchema = z.enum([
  'planned',
  'arrived',
  'triaged',
  'in-progress',
  'onleave',
  'finished',
  'cancelled',
  'entered-in-error',
  'unknown',
])

/**
 * The status of an encounter.
 * http://hl7.org/fhir/valueset-encounter-status.html
 */
export type EncounterStatus = z.infer<typeof encounterStatusSchema>

/**
 * The status of the location.
 * http://hl7.org/fhir/valueset-encounter-location-status.html
 */
export const encounterLocationStatusSchema = z.enum([
  'planned',
  'active',
  'reserved',
  'completed',
])

/**
 * The status of the location.
 * http://hl7.org/fhir/valueset-encounter-location-status.html
 */
export type EncounterLocationStatus = z.infer<
  typeof encounterLocationStatusSchema
>
