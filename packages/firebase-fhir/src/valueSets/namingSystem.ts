//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * Identifies the purpose of a naming system.
 * http://hl7.org/fhir/valueset-namingsystem-type.html
 */
export const namingSystemKindSchema = z.enum([
  'codesystem',
  'identifier',
  'root',
])

/**
 * Identifies the purpose of a naming system.
 * http://hl7.org/fhir/valueset-namingsystem-type.html
 */
export type NamingSystemKind = z.infer<typeof namingSystemKindSchema>

/**
 * Identifies the style of unique identifier used to identify a namespace.
 * http://hl7.org/fhir/valueset-namingsystem-identifier-type.html
 */
export const namingSystemUniqueIdTypeSchema = z.enum([
  'oid',
  'uuid',
  'uri',
  'other',
])

/**
 * Identifies the style of unique identifier used to identify a namespace.
 * http://hl7.org/fhir/valueset-namingsystem-identifier-type.html
 */
export type NamingSystemUniqueIdType = z.infer<
  typeof namingSystemUniqueIdTypeSchema
>
