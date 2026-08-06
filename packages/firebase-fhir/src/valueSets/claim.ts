//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * The purpose of the Claim: predetermination, preauthorization, claim.
 * http://hl7.org/fhir/valueset-claim-use.html
 */
export const claimUseSchema = z.enum([
  'claim',
  'preauthorization',
  'predetermination',
])

/**
 * The purpose of the Claim: predetermination, preauthorization, claim.
 * http://hl7.org/fhir/valueset-claim-use.html
 */
export type ClaimUse = z.infer<typeof claimUseSchema>
