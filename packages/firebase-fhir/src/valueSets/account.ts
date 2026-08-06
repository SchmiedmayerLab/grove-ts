//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * Indicates whether the account is available to be used.
 * http://hl7.org/fhir/valueset-account-status.html
 */
export const accountStatusSchema = z.enum([
  'active',
  'inactive',
  'entered-in-error',
  'on-hold',
  'unknown',
])

/**
 * Indicates whether the account is available to be used.
 * http://hl7.org/fhir/valueset-account-status.html
 */
export type AccountStatus = z.infer<typeof accountStatusSchema>
