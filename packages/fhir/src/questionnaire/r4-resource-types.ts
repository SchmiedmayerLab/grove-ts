//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { resourceTypeCodes } from '../zod/r4/index.js'

// The release publishes every concrete type plus the abstract Resource; DomainResource
// is abstract over the rest and instantiates nothing, so no schema names it.
/** Exact code union from the required FHIR R4 ResourceType value set. */
export type R4ResourceType =
  (typeof resourceTypeCodes)[number] | 'DomainResource'

const R4_RESOURCE_TYPES: ReadonlySet<string> = new Set<string>([
  ...resourceTypeCodes,
  'DomainResource',
])

/** Whether a code belongs to the required FHIR R4 ResourceType value set. */
export const isR4ResourceType = (value: string): boolean =>
  R4_RESOURCE_TYPES.has(value)
