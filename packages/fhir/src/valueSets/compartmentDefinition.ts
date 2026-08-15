//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * Zod schema for FHIR CompartmentDefinitionCode value set.
 * Which type of compartment a compartment definition describes.
 */
export const compartmentDefinitionCodeSchema = z.enum([
  'Patient',
  'Encounter',
  'RelatedPerson',
  'Practitioner',
  'Device',
])
