//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * Degree of preference of a type of conditioned specimen.
 * http://hl7.org/fhir/valueset-specimen-contained-preference.html
 */
export const specimenDefinitionTypeTestedPreferenceSchema = z.enum([
  'preferred',
  'alternate',
])

/**
 * Degree of preference of a type of conditioned specimen.
 * http://hl7.org/fhir/valueset-specimen-contained-preference.html
 */
export type SpecimenDefinitionTypeTestedPreference = z.infer<
  typeof specimenDefinitionTypeTestedPreferenceSchema
>
