//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * A code that identifies the status of the family history record.
 * http://hl7.org/fhir/valueset-history-status.html
 */
export const familyMemberHistoryStatusSchema = z.enum([
  'partial',
  'completed',
  'entered-in-error',
  'health-unknown',
])

/**
 * A code that identifies the status of the family history record.
 * http://hl7.org/fhir/valueset-history-status.html
 */
export type FamilyMemberHistoryStatus = z.infer<
  typeof familyMemberHistoryStatusSchema
>
