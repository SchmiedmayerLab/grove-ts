//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { compareFhirInstants, parseFhirInstant } from '../core/index.js'

const DATE = /^(?<year>\d{4})(?:-(?<month>\d{2})(?:-(?<day>\d{2}))?)?$/u
const DATE_TIME = /^(?<date>\d{4}-\d{2}-\d{2})T/u
const TIME =
  /^(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.(?<fraction>\d+))?$/u

const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)

const daysInMonth = (year: number, month: number): number => {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  if ([4, 6, 9, 11].includes(month)) return 30
  return 31
}

interface DateParts {
  readonly year: number
  readonly month?: number
  readonly day?: number
}

const dateParts = (value: unknown): DateParts | undefined => {
  if (typeof value !== 'string') return undefined
  const groups = DATE.exec(value)?.groups
  if (groups === undefined) return undefined
  const year = Number(groups.year)
  if (year === 0) return undefined
  if (groups.month === undefined) return { year }
  const month = Number(groups.month)
  if (month < 1 || month > 12) return undefined
  if (groups.day === undefined) return { year, month }
  const day = Number(groups.day)
  return day >= 1 && day <= daysInMonth(year, month) ?
      { year, month, day }
    : undefined
}

interface TimeParts {
  readonly hour: number
  readonly minute: number
  readonly second: number
  readonly fraction: string
}

const timeParts = (value: unknown): TimeParts | undefined => {
  if (typeof value !== 'string') return undefined
  const groups = TIME.exec(value)?.groups
  if (groups === undefined) return undefined
  const hour = Number(groups.hour)
  const minute = Number(groups.minute)
  const second = Number(groups.second)
  return hour <= 23 && minute <= 59 && second <= 60 ?
      { hour, minute, second, fraction: groups.fraction ?? '' }
    : undefined
}

type Comparison = -1 | 0 | 1

const compareNumbers = (left: number, right: number): Comparison => {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

const compareFractions = (left: string, right: string): Comparison => {
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const comparison = compareNumbers(
      Number(left[index] ?? '0'),
      Number(right[index] ?? '0'),
    )
    if (comparison !== 0) return comparison
  }
  return 0
}

const compareTimes = (left: TimeParts, right: TimeParts): Comparison => {
  for (const [leftPart, rightPart] of [
    [left.hour, right.hour],
    [left.minute, right.minute],
    [left.second, right.second],
  ] as const) {
    const comparison = compareNumbers(leftPart, rightPart)
    if (comparison !== 0) return comparison
  }
  return compareFractions(left.fraction, right.fraction)
}

const datePrecision = (parts: DateParts): 1 | 2 | 3 => {
  if (parts.day !== undefined) return 3
  if (parts.month !== undefined) return 2
  return 1
}

const compareDates = (
  left: DateParts,
  right: DateParts,
): Comparison | undefined => {
  const sharedParts = Math.min(datePrecision(left), datePrecision(right))
  const comparisons = [
    compareNumbers(left.year, right.year),
    ...(sharedParts >= 2 ?
      [compareNumbers(left.month ?? 0, right.month ?? 0)]
    : []),
    ...(sharedParts >= 3 ?
      [compareNumbers(left.day ?? 0, right.day ?? 0)]
    : []),
  ]
  const firstDifference = comparisons.find((entry) => entry !== 0)
  if (firstDifference !== undefined) return firstDifference
  return datePrecision(left) === datePrecision(right) ? 0 : undefined
}

/** Whether a value is a semantically valid FHIR R4 date primitive. */
export const isR4Date = (value: unknown): value is string =>
  dateParts(value) !== undefined

/** Whether a value is a semantically valid FHIR R4 dateTime primitive. */
export const isR4DateTime = (value: unknown): value is string => {
  if (typeof value !== 'string') return false
  if (dateParts(value) !== undefined) return true
  const full = DATE_TIME.exec(value)
  return (
    full !== null &&
    dateParts(full.groups?.date) !== undefined &&
    parseFhirInstant(value).ok
  )
}

/** Whether a value is a semantically valid FHIR R4 time primitive. */
export const isR4Time = (value: unknown): value is string =>
  timeParts(value) !== undefined

export type R4TemporalKind = 'date' | 'dateTime' | 'time'

/**
 * Compares valid R4 temporal primitives. Different partial precisions that
 * denote overlapping ranges are deliberately incomparable.
 */
export const compareR4Temporal = (
  left: unknown,
  right: unknown,
  kind: R4TemporalKind,
): Comparison | undefined => {
  if (kind === 'time') {
    const leftTime = timeParts(left)
    const rightTime = timeParts(right)
    return leftTime === undefined || rightTime === undefined ?
        undefined
      : compareTimes(leftTime, rightTime)
  }

  if (kind === 'date') {
    const leftDate = dateParts(left)
    const rightDate = dateParts(right)
    return leftDate === undefined || rightDate === undefined ?
        undefined
      : compareDates(leftDate, rightDate)
  }

  if (!isR4DateTime(left) || !isR4DateTime(right)) return undefined
  const leftInstant = DATE_TIME.test(left)
  const rightInstant = DATE_TIME.test(right)
  if (leftInstant || rightInstant) {
    if (!leftInstant || !rightInstant) return undefined
    const comparison = compareFhirInstants(left, right)
    return comparison.ok ? comparison.value : undefined
  }
  const leftDate = dateParts(left)
  const rightDate = dateParts(right)
  return leftDate === undefined || rightDate === undefined ?
      undefined
    : compareDates(leftDate, rightDate)
}
