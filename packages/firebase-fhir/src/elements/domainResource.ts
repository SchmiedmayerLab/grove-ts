//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type DomainResource } from 'fhir/r4b.js'
import { type ZodType } from 'zod'
import { narrativeSchema } from './dataTypes/narrative.js'
import { extensionSchema } from './extension.js'
import { resourceSchema } from './resource.js'
import { fhirResourceSchema } from '../resources/fhirResource.js'

/**
 * Zod schema for FHIR DomainResource data type.
 */
export const domainResourceSchema = resourceSchema.extend({
  text: narrativeSchema.optional(),
  get contained() {
    return fhirResourceSchema.array().optional()
  },
  extension: extensionSchema.array().optional(),
  modifierExtension: extensionSchema.array().optional(),
}) satisfies ZodType<DomainResource>
