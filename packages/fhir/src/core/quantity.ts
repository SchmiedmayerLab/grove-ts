//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { err, ok, type Result } from './result.js'

/** The bounds a Quantity may state in place of an exact value. */
export type QuantityComparator = '<' | '<=' | '>=' | '>'

/** A FHIR Quantity reduced to the number, unit, and bound a consumer has to carry. */
export interface QuantityValue {
  readonly value: number
  /** The unit's code when the Quantity states one, and its display unit otherwise. */
  readonly unit: string
  /** The system the unit code belongs to, so a UCUM unit is distinguishable from a local one. */
  readonly system?: string
  /** Stated only when the Quantity names a bound; dropping it would misreport the measurement. */
  readonly comparator?: QuantityComparator
}

const COMPARATORS: readonly string[] = ['<', '<=', '>=', '>']

/**
 * A FHIR Quantity as the value a consumer can compute with.
 *
 * The code is preferred over the display unit because only the code is comparable; `unit` alone
 * is a label the source chose. A Quantity carrying neither, or no numeric value, is reported
 * rather than reduced to a number whose meaning is unknown.
 */
export const fhirQuantityToValue = (value: unknown): Result<QuantityValue> => {
  if (typeof value !== 'object' || value === null) {
    return err('invalid-type', 'Expected a FHIR Quantity.')
  }
  const quantity = value as {
    readonly value?: unknown
    readonly unit?: unknown
    readonly code?: unknown
    readonly system?: unknown
    readonly comparator?: unknown
  }
  if (typeof quantity.value !== 'number' || !Number.isFinite(quantity.value)) {
    return err(
      'missing-required',
      'A Quantity without a finite numeric value carries no measurement.',
      ['value'],
    )
  }
  const unit = typeof quantity.code === 'string' ? quantity.code : quantity.unit
  if (typeof unit !== 'string' || unit.length === 0) {
    return err(
      'missing-required',
      'A Quantity states either a unit code or a display unit.',
      ['code'],
    )
  }
  if (
    quantity.comparator !== undefined &&
    !COMPARATORS.includes(quantity.comparator as string)
  ) {
    return err('invalid-code', 'Expected a comparator of <, <=, >=, or >.', [
      'comparator',
    ])
  }
  return ok({
    value: quantity.value,
    unit,
    ...(typeof quantity.system === 'string' ?
      { system: quantity.system }
    : undefined),
    ...(quantity.comparator === undefined ?
      undefined
    : { comparator: quantity.comparator as QuantityComparator }),
  })
}
