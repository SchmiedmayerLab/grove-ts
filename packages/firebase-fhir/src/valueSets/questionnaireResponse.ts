//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * The status of the questionnaire response.
 * http://hl7.org/fhir/valueset-questionnaire-answers-status.html
 */
export const questionnaireResponseStatusSchema = z.enum([
  'in-progress',
  'completed',
  'amended',
  'entered-in-error',
  'stopped',
])

/**
 * The status of the questionnaire response.
 * http://hl7.org/fhir/valueset-questionnaire-answers-status.html
 */
export type QuestionnaireResponseStatus = z.infer<
  typeof questionnaireResponseStatusSchema
>
