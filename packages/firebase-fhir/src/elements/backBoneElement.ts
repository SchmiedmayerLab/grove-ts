//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type BackboneElement } from 'fhir/r4b.js'
import { type ZodType } from 'zod'
import { elementSchema } from './element.js'
import { extensionSchema } from './extension.js'

/**
 * Zod schema for FHIR BackboneElement data type.
 */
export const backboneElementSchema = elementSchema.extend({
  modifierExtension: extensionSchema.array().optional(),
}) satisfies ZodType<BackboneElement>
