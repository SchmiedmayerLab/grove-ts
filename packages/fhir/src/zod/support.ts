//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

// The generated release schemas read their ordering policy from here; core owns it.
export { compareFhirDateTimes } from '../core/primitives.js'

const FULL_FHIR_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/u

const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)

const daysInMonth = (year: number, month: number): number => {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  if ([4, 6, 9, 11].includes(month)) return 30
  return 31
}

/**
 * Complements the contract-owned primitive regex with Gregorian calendar validity.
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
