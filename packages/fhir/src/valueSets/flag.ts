//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * Indicates whether this flag is active and needs to be displayed to a user, or whether it is no longer needed or was entered in error.
 * http://hl7.org/fhir/valueset-flag-status.html
 */
export const flagStatusSchema = z.enum([
  'active',
  'inactive',
  'entered-in-error',
])

/**
 * Indicates whether this flag is active and needs to be displayed to a user, or whether it is no longer needed or was entered in error.
 * http://hl7.org/fhir/valueset-flag-status.html
 */
export type FlagStatus = z.infer<typeof flagStatusSchema>
