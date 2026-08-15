//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * Types of resources that are part of group.
 * http://hl7.org/fhir/valueset-group-type.html
 */
export const groupTypeSchema = z.enum([
  'person',
  'animal',
  'practitioner',
  'device',
  'medication',
  'substance',
])

/**
 * Types of resources that are part of group.
 * http://hl7.org/fhir/valueset-group-type.html
 */
export type GroupType = z.infer<typeof groupTypeSchema>
