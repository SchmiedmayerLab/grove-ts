//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * The type of link between this patient resource and another patient resource.
 * http://hl7.org/fhir/valueset-link-type.html
 */
export const patientLinkTypeSchema = z.enum([
  'replaced-by',
  'replaces',
  'refer',
  'seealso',
])

/**
 * The type of link between this patient resource and another patient resource.
 * http://hl7.org/fhir/valueset-link-type.html
 */
export type PatientLinkType = z.infer<typeof patientLinkTypeSchema>
