//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type DomainResource, type Resource } from 'fhir/r4b.js'
import { type ZodType } from 'zod'
import { narrativeSchema } from './dataTypes/narrative.js'
import { extensionSchema } from './extension.js'
import { resourceSchema } from './resource.js'
import { fhirResourceSchema } from '../resources/fhirResource.js'

const containedResourceSchema: ZodType<Resource[]> = fhirResourceSchema.array()

/**
 * Zod schema for FHIR DomainResource data type.
 */
export const domainResourceSchema = resourceSchema.extend({
  text: narrativeSchema.optional(),
  get contained() {
    return containedResourceSchema.optional()
  },
  extension: extensionSchema.array().optional(),
  modifierExtension: extensionSchema.array().optional(),
}) satisfies ZodType<DomainResource>
