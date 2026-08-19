//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * The lifecycle status of an artifact.
 * http://hl7.org/fhir/valueset-publication-status.html
 */
export const publicationStatusSchema = z.enum([
  'draft',
  'active',
  'retired',
  'unknown',
])

/**
 * The lifecycle status of an artifact.
 * http://hl7.org/fhir/valueset-publication-status.html
 */
export type PublicationStatus = z.infer<typeof publicationStatusSchema>
