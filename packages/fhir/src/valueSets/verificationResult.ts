//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * The validation status of the target.
 * http://hl7.org/fhir/valueset-verificationresult-status.html
 */
export const verificationResultStatusSchema = z.enum([
  'attested',
  'validated',
  'in-process',
  'req-revalid',
  'val-fail',
  'reval-fail',
])

/**
 * The validation status of the target.
 * http://hl7.org/fhir/valueset-verificationresult-status.html
 */
export type VerificationResultStatus = z.infer<
  typeof verificationResultStatusSchema
>
