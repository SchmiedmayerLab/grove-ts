//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * The status of an episode of care.
 * http://hl7.org/fhir/valueset-episode-of-care-status.html
 */
export const episodeOfCareStatusSchema = z.enum([
  'planned',
  'waitlist',
  'active',
  'onhold',
  'finished',
  'cancelled',
  'entered-in-error',
])

/**
 * The status of an episode of care.
 * http://hl7.org/fhir/valueset-episode-of-care-status.html
 */
export type EpisodeOfCareStatus = z.infer<typeof episodeOfCareStatusSchema>
