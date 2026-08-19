//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * Distinguishes which item is "source of truth" (if any) and which items are no longer considered to be current representations.
 * http://hl7.org/fhir/valueset-linkage-type.html
 */
export const linkageItemTypeSchema = z.enum([
  'source',
  'alternate',
  'historical',
])

/**
 * Distinguishes which item is "source of truth" (if any) and which items are no longer considered to be current representations.
 * http://hl7.org/fhir/valueset-linkage-type.html
 */
export type LinkageItemType = z.infer<typeof linkageItemTypeSchema>
