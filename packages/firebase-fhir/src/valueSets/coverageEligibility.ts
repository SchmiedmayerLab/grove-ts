//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * A code specifying the types of information being requested.
 * http://hl7.org/fhir/valueset-eligibilityrequest-purpose.html
 */
export const eligibilityRequestPurposeSchema = z.enum([
  'auth-requirements',
  'benefits',
  'discovery',
  'validation',
])

/**
 * A code specifying the types of information being requested.
 * http://hl7.org/fhir/valueset-eligibilityrequest-purpose.html
 */
export type EligibilityRequestPurpose = z.infer<
  typeof eligibilityRequestPurposeSchema
>

/**
 * A code specifying the types of information being requested.
 * http://hl7.org/fhir/valueset-eligibilityresponse-purpose.html
 */
export const eligibilityResponsePurposeSchema = z.enum([
  'auth-requirements',
  'benefits',
  'discovery',
  'validation',
])

/**
 * A code specifying the types of information being requested.
 * http://hl7.org/fhir/valueset-eligibilityresponse-purpose.html
 */
export type EligibilityResponsePurpose = z.infer<
  typeof eligibilityResponsePurposeSchema
>
