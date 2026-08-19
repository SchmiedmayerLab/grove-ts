//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * The gender of a person used for administrative purposes.
 * http://hl7.org/fhir/valueset-administrative-gender.html
 */
export const administrativeGenderSchema = z.enum([
  'male',
  'female',
  'other',
  'unknown',
])

/**
 * The gender of a person used for administrative purposes.
 * http://hl7.org/fhir/valueset-administrative-gender.html
 */
export type AdministrativeGender = z.infer<typeof administrativeGenderSchema>
