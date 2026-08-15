//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * A coded concept defining if the substance is active or inactive.
 * http://hl7.org/fhir/valueset-substance-status.html
 */
export const substanceStatusSchema = z.enum([
  'active',
  'inactive',
  'entered-in-error',
])

/**
 * A coded concept defining if the substance is active or inactive.
 * http://hl7.org/fhir/valueset-substance-status.html
 */
export type SubstanceStatus = z.infer<typeof substanceStatusSchema>
