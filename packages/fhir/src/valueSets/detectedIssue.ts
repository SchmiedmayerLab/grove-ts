//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * Indicates the potential degree of impact of the identified issue on the patient.
 * http://hl7.org/fhir/valueset-detectedissue-severity.html
 */
export const detectedIssueSeveritySchema = z.enum(['high', 'moderate', 'low'])

/**
 * Indicates the potential degree of impact of the identified issue on the patient.
 * http://hl7.org/fhir/valueset-detectedissue-severity.html
 */
export type DetectedIssueSeverity = z.infer<typeof detectedIssueSeveritySchema>

/**
 * Codes providing the status of a detected issue.
 * http://hl7.org/fhir/valueset-observation-status.html
 */
export const detectedIssueStatusSchema = z.enum([
  'registered',
  'preliminary',
  'final',
  'amended',
  'corrected',
  'cancelled',
  'entered-in-error',
  'unknown',
])

/**
 * Codes providing the status of a detected issue.
 * http://hl7.org/fhir/valueset-observation-status.html
 */
export type DetectedIssueStatus = z.infer<typeof detectedIssueStatusSchema>
