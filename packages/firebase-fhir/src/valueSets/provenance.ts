//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * How an entity was used in an activity.
 * http://hl7.org/fhir/valueset-provenance-entity-role.html
 */
export const provenanceEntityRoleSchema = z.enum([
  'derivation',
  'revision',
  'quotation',
  'source',
  'removal',
])

/**
 * How an entity was used in an activity.
 * http://hl7.org/fhir/valueset-provenance-entity-role.html
 */
export type ProvenanceEntityRole = z.infer<typeof provenanceEntityRoleSchema>
