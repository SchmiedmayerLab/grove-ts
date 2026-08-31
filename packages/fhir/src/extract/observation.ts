//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { codeableConceptDisplay, containsCoding } from './coding.js'
import { asDate, field } from './internal.js'
import { fhirPeriodToBounds, periodOverlaps } from './period.js'
import { annotationTexts } from './resource.js'
import { fhirQuantityToValue, type QuantityValue } from '../core/quantity.js'

/**
 * The instant an Observation applies to.
 *
 * `effectiveDateTime` when the Observation states one, and the start of `effectivePeriod`
 * otherwise: a period's start is when the observation began to apply, which is the instant a
 * caller orders by. An Observation stating neither has no effective time to report.
 */
export const observationEffectiveDate = (
  observation: unknown,
): Date | undefined =>
  asDate(field(observation, 'effectiveDateTime')) ??
  fhirPeriodToBounds(field(observation, 'effectivePeriod')).start

/** The end of an Observation's effective period, stated only when it names one. */
export const observationEffectiveEnd = (
  observation: unknown,
): Date | undefined =>
  fhirPeriodToBounds(field(observation, 'effectivePeriod')).end ??
  asDate(field(observation, 'effectiveDateTime'))

/** Whether an Observation's effective time falls inside the range, inclusive at both ends. */
export const observationEffectiveOverlaps = (
  observation: unknown,
  rangeStart: Date,
  rangeEnd: Date,
): boolean => {
  const period = field(observation, 'effectivePeriod')
  if (period !== undefined) return periodOverlaps(period, rangeStart, rangeEnd)
  const instant = asDate(field(observation, 'effectiveDateTime'))
  if (instant === undefined) return false
  return instant >= rangeStart && instant <= rangeEnd
}

/** The instant an Observation was released, as `issued` states it. */
export const observationIssuedDate = (observation: unknown): Date | undefined =>
  asDate(field(observation, 'issued'))

/** The display an Observation's code is best named by. */
export const observationCodeDisplay = (
  observation: unknown,
): string | undefined => codeableConceptDisplay(field(observation, 'code'))

/**
 * An Observation's value as a measurement.
 *
 * Only `valueQuantity` reduces to a number with a unit; the other value types are separate
 * accessors, because returning a bare number for a value that carried a unit would drop it.
 */
export const observationQuantity = (
  observation: unknown,
): QuantityValue | undefined => {
  const value = field(observation, 'valueQuantity')
  if (value === undefined) return undefined
  const result = fhirQuantityToValue(value)
  return result.ok ? result.value : undefined
}

/** An Observation's numeric value, dropping the unit its Quantity carried. */
export const observationNumericValue = (
  observation: unknown,
): number | undefined => observationQuantity(observation)?.value

/** The unit an Observation's Quantity states, preferring the comparable code. */
export const observationUnit = (observation: unknown): string | undefined =>
  observationQuantity(observation)?.unit

/** An Observation's `valueString`. */
export const observationStringValue = (
  observation: unknown,
): string | undefined => {
  const value = field(observation, 'valueString')
  return typeof value === 'string' ? value : undefined
}

/** An Observation's `valueBoolean`. */
export const observationBooleanValue = (
  observation: unknown,
): boolean | undefined => {
  const value = field(observation, 'valueBoolean')
  return typeof value === 'boolean' ? value : undefined
}

/** The display an Observation's coded value is best named by. */
export const observationValueDisplay = (
  observation: unknown,
): string | undefined =>
  codeableConceptDisplay(field(observation, 'valueCodeableConcept'))

/** Whether an Observation states this category code, in the given system. */
export const observationHasCategory = (
  observation: unknown,
  system: string,
  code: string,
): boolean => {
  const categories = field(observation, 'category')
  if (!Array.isArray(categories)) return false
  return categories.some((category) => containsCoding(category, system, code))
}

/** The displays an Observation's interpretations are named by. */
export const observationInterpretationDisplays = (
  observation: unknown,
): readonly string[] => {
  const value = field(observation, 'interpretation')
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => codeableConceptDisplay(entry))
    .filter((display): display is string => display !== undefined)
}

/** The texts an Observation's notes carry. */
export const observationNoteTexts = (observation: unknown): readonly string[] =>
  annotationTexts(field(observation, 'note'))
