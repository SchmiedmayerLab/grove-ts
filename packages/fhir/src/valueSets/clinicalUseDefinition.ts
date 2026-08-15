//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * Type of clinical use definition
 * http://hl7.org/fhir/valueset-clinical-use-definition-type.html
 */
export const clinicalUseDefinitionTypeSchema = z.enum([
  'indication',
  'contraindication',
  'interaction',
  'undesirable-effect',
  'warning',
])

/**
 * Type of clinical use definition
 * http://hl7.org/fhir/valueset-clinical-use-definition-type.html
 */
export type ClinicalUseDefinitionType = z.infer<
  typeof clinicalUseDefinitionTypeSchema
>
