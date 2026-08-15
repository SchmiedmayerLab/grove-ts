//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * Whether a reference needs to be version specific or version independent, or whether either can be used.
 * http://hl7.org/fhir/valueset-reference-version-rules.html
 */
export const referenceVersionRulesSchema = z.enum([
  'either',
  'independent',
  'specific',
])

/**
 * Whether a reference needs to be version specific or version independent, or whether either can be used.
 * http://hl7.org/fhir/valueset-reference-version-rules.html
 */
export type ReferenceVersionRules = z.infer<typeof referenceVersionRulesSchema>
