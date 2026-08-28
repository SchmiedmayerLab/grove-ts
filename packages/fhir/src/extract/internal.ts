//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { fhirDateTimeToDate } from '../core/primitives.js'

/** One field of a resource the caller has not yet narrowed, or undefined when it has none. */
export const field = (resource: unknown, name: string): unknown =>
  typeof resource === 'object' && resource !== null ?
    (resource as Record<string, unknown>)[name]
  : undefined

/**
 * A FHIR date, dateTime, or instant as a Date, dropping a value that does not parse.
 *
 * Accessors report absence and malformation the same way, as undefined: a caller reading a field
 * wants the value or nothing, and an `Invalid Date` would compare false against everything while
 * still looking like a Date.
 */
export const asDate = (value: unknown): Date | undefined => {
  if (value === undefined) return undefined
  const result = fhirDateTimeToDate(value)
  return result.ok ? result.value : undefined
}
