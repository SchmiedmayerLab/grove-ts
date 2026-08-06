//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * The workflow state of a clinical impression.
 * http://hl7.org/fhir/valueset-clinicalimpression-status.html
 */
export const clinicalImpressionStatusSchema = z.enum([
  'in-progress',
  'completed',
  'entered-in-error',
])

/**
 * The workflow state of a clinical impression.
 * http://hl7.org/fhir/valueset-clinicalimpression-status.html
 */
export type ClinicalImpressionStatus = z.infer<
  typeof clinicalImpressionStatusSchema
>
