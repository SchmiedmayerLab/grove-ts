//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * The availability status of the specimen.
 * http://hl7.org/fhir/valueset-specimen-status.html
 */
export const specimenStatusSchema = z.enum([
  'available',
  'unavailable',
  'unsatisfactory',
  'entered-in-error',
])

/**
 * The availability status of the specimen.
 * http://hl7.org/fhir/valueset-specimen-status.html
 */
export type SpecimenStatus = z.infer<typeof specimenStatusSchema>
