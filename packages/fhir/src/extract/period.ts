//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { fhirDateTimeToDate } from '../core/primitives.js'

/** A Period as the two instants it names, each absent when the Period leaves that end open. */
export interface PeriodBounds {
  readonly start?: Date
  readonly end?: Date
}

const bound = (value: unknown): Date | undefined => {
  if (typeof value !== 'string') return undefined
  const result = fhirDateTimeToDate(value)
  return result.ok ? result.value : undefined
}

/**
 * A FHIR Period as JavaScript instants.
 *
 * An end the Period does not state is left undefined rather than defaulted to now: an open period
 * and one ending at this moment are different facts, and only the caller knows which it wants.
 * A bound that does not parse is dropped, so a malformed end never silently truncates the period.
 */
export const fhirPeriodToBounds = (period: unknown): PeriodBounds => {
  if (typeof period !== 'object' || period === null) return {}
  const value = period as { readonly start?: unknown; readonly end?: unknown }
  const start = bound(value.start)
  const end = bound(value.end)
  return {
    ...(start === undefined ? {} : { start }),
    ...(end === undefined ? {} : { end }),
  }
}

/**
 * Whether the period covers this instant.
 *
 * An absent Period is active: FHIR uses a missing period to mean "not bounded", not "never".
 * Both ends are inclusive, matching the way FHIR reads a Period elsewhere.
 */
export const periodIsActive = (
  period: unknown,
  asOf: Date = new Date(),
): boolean => {
  if (period === undefined || period === null) return true
  const { start, end } = fhirPeriodToBounds(period)
  if (start !== undefined && asOf < start) return false
  if (end !== undefined && asOf > end) return false
  return true
}

/**
 * Whether the period shares any instant with the range.
 *
 * An absent Period overlaps nothing: unlike the active case there is no instant to compare, and
 * reporting an overlap would invent one.
 */
export const periodOverlaps = (
  period: unknown,
  rangeStart: Date,
  rangeEnd: Date,
): boolean => {
  if (period === undefined || period === null) return false
  const { start, end } = fhirPeriodToBounds(period)
  const from = start ?? new Date(-8_640_000_000_000_000)
  const to = end ?? new Date(8_640_000_000_000_000)
  return from <= rangeEnd && to >= rangeStart
}

/** The milliseconds a period spans, stated only when it names both ends. */
export const periodDuration = (period: unknown): number | undefined => {
  const { start, end } = fhirPeriodToBounds(period)
  if (start === undefined || end === undefined) return undefined
  return end.getTime() - start.getTime()
}

/**
 * A Date as the FHIR `date` it names, in UTC.
 *
 * UTC, not the host's zone: formatting in local time silently shifts the calendar day either
 * side of midnight, which is how a birth date moves by one.
 */
export const dateToFhirDate = (value: Date): string =>
  value.toISOString().slice(0, 10)

/** A Date as the FHIR `instant` it names, in UTC and to millisecond precision. */
export const dateToFhirInstant = (value: Date): string => value.toISOString()
