//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * The status of the ImagingStudy.
 * http://hl7.org/fhir/valueset-imagingstudy-status.html
 */
export const imagingStudyStatusSchema = z.enum([
  'registered',
  'available',
  'cancelled',
  'entered-in-error',
  'unknown',
])

/**
 * The status of the ImagingStudy.
 * http://hl7.org/fhir/valueset-imagingstudy-status.html
 */
export type ImagingStudyStatus = z.infer<typeof imagingStudyStatusSchema>
