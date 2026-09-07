//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import type { CodingParts } from './coding.js'
import type { PeriodBounds } from './period.js'
import type { QuantityValue } from '../core/quantity.js'
import { err, ok, type Result } from '../core/result.js'

/**
 * The other direction of the accessors: a JavaScript value as the FHIR shape that carries it.
 *
 * Every encoder is the inverse of the reader beside it, so a value read out and written back
 * states the same fact. They are deliberately not the inverse of the *source* bytes: FHIR admits
 * several spellings of one instant, and round-tripping preserves the meaning rather than the
 * formatting a producer happened to choose.
 */

/** A Date as the FHIR `dateTime` it names, in UTC and to millisecond precision. */
export const dateToFhirDateTime = (value: Date): string => value.toISOString()

/**
 * Two instants as the FHIR Period they bound.
 *
 * An end the caller leaves undefined is omitted rather than written as null, because FHIR states
 * an open period by the element's absence.
 */
export const boundsToFhirPeriod = (
  bounds: PeriodBounds,
): { readonly start?: string; readonly end?: string } => ({
  ...(bounds.start === undefined ? {} : { start: bounds.start.toISOString() }),
  ...(bounds.end === undefined ? {} : { end: bounds.end.toISOString() }),
})

/**
 * A measurement as the FHIR Quantity that carries it.
 *
 * The unit is written as `code` with its system, and repeated as `unit` for display. A Quantity
 * stating only `unit` is not comparable, and a reader that took the code back out would find
 * nothing there.
 */
export const valueToFhirQuantity = (
  value: QuantityValue,
): Result<{
  readonly value: number
  readonly unit: string
  readonly code: string
  readonly system?: string
  readonly comparator?: string
}> => {
  if (!Number.isFinite(value.value)) {
    return err('out-of-range', 'A Quantity carries a finite number.', ['value'])
  }
  if (value.unit.length === 0) {
    return err('missing-required', 'A Quantity states a unit.', ['unit'])
  }
  return ok({
    value: value.value,
    unit: value.unit,
    code: value.unit,
    ...(value.system === undefined ? {} : { system: value.system }),
    ...(value.comparator === undefined ? {} : { comparator: value.comparator }),
  })
}

/**
 * A code in a system as the FHIR CodeableConcept that states it.
 *
 * `text` is set only when the caller gives a display, so a concept never claims a label the
 * caller did not state — the same rule `codeableConceptDisplay` reads it back by.
 */
export const codingToCodeableConcept = (
  coding: CodingParts,
): {
  readonly coding: readonly CodingParts[]
  readonly text?: string
} => ({
  coding: [coding],
  ...(coding.display === undefined ? {} : { text: coding.display }),
})

/** A resource type and id as the relative reference literal that points at it. */
export const toFhirReference = (
  resourceType: string,
  id: string,
): { readonly reference: string; readonly type: string } => ({
  reference: `${resourceType}/${id}`,
  type: resourceType,
})

/**
 * Bytes as the FHIR `base64Binary` that carries them.
 *
 * Unwrapped: the lexical form admits whitespace, but a value written without it is what every
 * producer emits and what `decodeBase64Binary` reads back unchanged.
 */
export const encodeBase64Binary = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
