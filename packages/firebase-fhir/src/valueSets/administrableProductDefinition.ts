//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * Status of administrable product definition.
 * http://hl7.org/fhir/valueset-publication-status.html
 */
export const administrableProductDefinitionStatusSchema = z.enum([
  'draft',
  'active',
  'retired',
  'unknown',
])

/**
 * Status of administrable product definition.
 * http://hl7.org/fhir/valueset-publication-status.html
 */
export type AdministrableProductDefinitionStatus = z.infer<
  typeof administrableProductDefinitionStatusSchema
>
