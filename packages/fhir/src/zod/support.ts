//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

interface ComparableFhirDateTime {
  readonly epochSecond: number
  /** Leap seconds sort after the preceding second and before the next POSIX second. */
  readonly phase: 0 | 1
  readonly fraction: string
}

const FHIR_TIMESTAMP =
  /^(?<prefix>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:)(?<second>[0-5]\d|60)(?:\.(?<fraction>\d+))?(?<offset>Z|[+-]\d{2}:\d{2})$/u
const FHIR_PARTIAL_DATE = /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/u

const comparableFhirDateTime = (
  value: string,
): ComparableFhirDateTime | undefined => {
  const timestamp = FHIR_TIMESTAMP.exec(value)?.groups
  if (timestamp !== undefined) {
    const leap = timestamp.second === '60'
    const parsed = Date.parse(
      `${timestamp.prefix}${leap ? '59' : timestamp.second}${timestamp.offset}`,
    )
    if (!Number.isFinite(parsed)) return undefined
    return {
      epochSecond: parsed / 1000 + (leap ? 1 : 0),
      phase: leap ? 0 : 1,
      fraction: timestamp.fraction ?? '',
    }
  }
  if (!FHIR_PARTIAL_DATE.test(value)) return undefined
  let suffix = ''
  if (value.length === 4) suffix = '-01-01'
  else if (value.length === 7) suffix = '-01'
  const parsed = Date.parse(`${value}${suffix}T00:00:00Z`)
  return Number.isFinite(parsed) ?
      { epochSecond: parsed / 1000, phase: 1, fraction: '' }
    : undefined
}

const compareFraction = (left: string, right: string): -1 | 0 | 1 => {
  const width = Math.max(left.length, right.length)
  const normalizedLeft = left.padEnd(width, '0')
  const normalizedRight = right.padEnd(width, '0')
  if (normalizedLeft === normalizedRight) return 0
  return normalizedLeft < normalizedRight ? -1 : 1
}

/**
 * Compares FHIR dateTime values without JavaScript Date's millisecond truncation.
 *
 * Partial values resolve to the start of the period they name, matching Grove's release-owned
 * ordering policy. Leap seconds retain their distinct position before the following POSIX second.
 * `undefined` means an endpoint is malformed; primitive validation reports that defect separately.
 */
export const compareFhirDateTimes = (
  left: string,
  right: string,
): -1 | 0 | 1 | undefined => {
  const first = comparableFhirDateTime(left)
  const second = comparableFhirDateTime(right)
  if (first === undefined || second === undefined) return undefined
  if (first.epochSecond !== second.epochSecond) {
    return first.epochSecond < second.epochSecond ? -1 : 1
  }
  if (first.phase !== second.phase) return first.phase < second.phase ? -1 : 1
  return compareFraction(first.fraction, second.fraction)
}

const FULL_FHIR_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/u

const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)

const daysInMonth = (year: number, month: number): number => {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  if ([4, 6, 9, 11].includes(month)) return 30
  return 31
}

/**
 * Complements the release-owned primitive regex with Gregorian calendar validity.
 * Partial FHIR dates have no day to validate and remain valid at this layer.
 */
export const hasValidFhirCalendarDate = (value: string): boolean => {
  const match = FULL_FHIR_DATE.exec(value)
  if (match === null) return true
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  return day >= 1 && day <= daysInMonth(year, month)
}
