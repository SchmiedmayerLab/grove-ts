//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * The status of the media resource.
 * http://hl7.org/fhir/valueset-event-status.html
 */
export const mediaStatusSchema = z.enum([
  'preparation',
  'in-progress',
  'not-done',
  'on-hold',
  'stopped',
  'completed',
  'entered-in-error',
  'unknown',
])

/**
 * The status of the media resource.
 * http://hl7.org/fhir/valueset-event-status.html
 */
export type MediaStatus = z.infer<typeof mediaStatusSchema>
