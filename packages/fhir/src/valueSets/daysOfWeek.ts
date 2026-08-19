//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * The days of the week.
 * http://hl7.org/fhir/valueset-days-of-week.html
 */
export const daysOfWeekSchema = z.enum([
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
])

/**
 * The days of the week.
 * http://hl7.org/fhir/valueset-days-of-week.html
 */
export type DaysOfWeek = z.infer<typeof daysOfWeekSchema>
