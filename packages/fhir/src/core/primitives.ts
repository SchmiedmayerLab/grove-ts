//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { err, ok, type Result } from './result.js'

declare const brand: unique symbol
declare const numericBrand: unique symbol

type Branded<Name extends string> = string & { readonly [brand]: Name }

export type AbsoluteUri = Branded<'AbsoluteUri'>
export type Canonical = Branded<'Canonical'>
export type FhirId = Branded<'FhirId'>
export type FhirInstant = Branded<'FhirInstant'>
export type PatientReference = Branded<'PatientReference'>
export type PositiveInteger = number & {
  readonly [numericBrand]: 'PositiveInteger'
}
export type ResearchStudyReference = Branded<'ResearchStudyReference'>
export type SemVer = Branded<'SemVer'>
export type UrnUuid = Branded<'UrnUuid'>

const FHIR_ID_PATTERN = '[A-Za-z0-9\\-.]{1,64}'
const FHIR_ID = new RegExp(`^${FHIR_ID_PATTERN}$`, 'u')
const INSTANT =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.(?<fraction>\d+))?(?<zone>Z|[+-]\d{2}:\d{2})$/u
const PARTIAL_DATE = /^(?<year>\d{4})(?:-(?<month>\d{2})(?:-(?<day>\d{2}))?)?$/u
const UUID =
  '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const URN_UUID = new RegExp(`^urn:uuid:${UUID}$`, 'u')
const DECIMAL_IDENTIFIER = /^\d+$/u
const SEMVER_IDENTIFIER = /^[\dA-Za-z-]+$/u

const isNumericIdentifier = (value: string): boolean =>
  DECIMAL_IDENTIFIER.test(value) && (value === '0' || !value.startsWith('0'))

const areValidIdentifiers = (
  value: string | undefined,
  numericLeadingZeroAllowed: boolean,
): boolean =>
  value === undefined ||
  (value.length > 0 &&
    value
      .split('.')
      .every(
        (identifier) =>
          identifier.length > 0 &&
          SEMVER_IDENTIFIER.test(identifier) &&
          (numericLeadingZeroAllowed ||
            !DECIMAL_IDENTIFIER.test(identifier) ||
            isNumericIdentifier(identifier)),
      ))

const isSemVer = (value: string): boolean => {
  const buildSeparator = value.indexOf('+')
  if (buildSeparator !== value.lastIndexOf('+')) return false
  const version = buildSeparator === -1 ? value : value.slice(0, buildSeparator)
  const build =
    buildSeparator === -1 ? undefined : value.slice(buildSeparator + 1)

  const prereleaseSeparator = version.indexOf('-')
  const core =
    prereleaseSeparator === -1 ? version : version.slice(0, prereleaseSeparator)
  const prerelease =
    prereleaseSeparator === -1 ? undefined : (
      version.slice(prereleaseSeparator + 1)
    )
  const coreIdentifiers = core.split('.')

  return (
    coreIdentifiers.length === 3 &&
    coreIdentifiers.every(isNumericIdentifier) &&
    areValidIdentifiers(prerelease, false) &&
    areValidIdentifiers(build, true)
  )
}

const isAbsoluteUri = (value: string): boolean => {
  try {
    const parsed = new URL(value)
    return parsed.protocol.length > 1 && !/\s/u.test(value)
  } catch {
    return false
  }
}

const isTypedResourceReference = (
  value: string,
  resourceType: 'Patient' | 'ResearchStudy',
): boolean => {
  if (new RegExp(`^${resourceType}/${FHIR_ID_PATTERN}$`, 'u').test(value)) {
    return true
  }
  try {
    const parsed = new URL(value)
    return (
      !/\s/u.test(value) &&
      ['http:', 'https:'].includes(parsed.protocol) &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.search === '' &&
      parsed.hash === '' &&
      new RegExp(`/${resourceType}/${FHIR_ID_PATTERN}$`, 'u').test(
        parsed.pathname,
      )
    )
  } catch {
    return false
  }
}

interface InstantParts {
  readonly epochSecond: bigint
  readonly fraction: string
}

const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)

const daysInMonth = (year: number, month: number): number => {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  if ([4, 6, 9, 11].includes(month)) return 30
  return 31
}

const parseInstantParts = (value: unknown): InstantParts | undefined => {
  if (typeof value !== 'string') return undefined
  const groups = INSTANT.exec(value)?.groups
  if (groups === undefined) return undefined

  const year = Number(groups.year)
  const month = Number(groups.month)
  const day = Number(groups.day)
  const hour = Number(groups.hour)
  const minute = Number(groups.minute)
  const second = Number(groups.second)
  if (
    year === 0 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 60
  ) {
    return undefined
  }

  const zone = groups.zone ?? ''
  const offsetSign = zone === 'Z' ? undefined : zone.slice(0, 1)
  const offsetHour = zone === 'Z' ? 0 : Number(zone.slice(1, 3))
  const offsetMinute = zone === 'Z' ? 0 : Number(zone.slice(4, 6))
  if (
    offsetHour > 14 ||
    offsetMinute > 59 ||
    (offsetHour === 14 && offsetMinute !== 0)
  ) {
    return undefined
  }

  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(hour, minute, Math.min(second, 59), 0)
  if (Number.isNaN(date.getTime())) return undefined

  const offsetDirection = offsetSign === '-' ? -1 : 1
  const offsetSeconds =
    offsetSign === undefined ? 0 : (
      offsetDirection * (offsetHour * 60 + offsetMinute) * 60
    )
  const leapSecond = second === 60 ? 1 : 0
  return {
    epochSecond:
      BigInt(Math.trunc(date.getTime() / 1000)) -
      BigInt(offsetSeconds) +
      BigInt(leapSecond),
    fraction: groups.fraction ?? '',
  }
}

const compareFractions = (left: string, right: string): -1 | 0 | 1 => {
  const digits = Math.max(left.length, right.length)
  for (let index = 0; index < digits; index += 1) {
    const leftDigit = left[index] ?? '0'
    const rightDigit = right[index] ?? '0'
    if (leftDigit < rightDigit) return -1
    if (leftDigit > rightDigit) return 1
  }
  return 0
}

export const parseAbsoluteUri = (value: unknown): Result<AbsoluteUri> => {
  if (typeof value !== 'string' || !isAbsoluteUri(value)) {
    return err('invalid-uri', 'Expected an absolute URI.')
  }
  return ok(value as AbsoluteUri)
}

export const parseCanonical = (value: unknown): Result<Canonical> => {
  if (typeof value !== 'string') {
    return err('invalid-uri', 'Expected a canonical URI string.')
  }

  const separator = value.indexOf('|')
  const uri = separator === -1 ? value : value.slice(0, separator)
  const version = separator === -1 ? undefined : value.slice(separator + 1)
  if (
    !isAbsoluteUri(uri) ||
    version === '' ||
    version?.includes('|') === true
  ) {
    return err(
      'invalid-uri',
      'Expected an absolute canonical URI with at most one non-empty version.',
    )
  }
  return ok(value as Canonical)
}

export const parseFhirId = (value: unknown): Result<FhirId> => {
  if (typeof value !== 'string' || !FHIR_ID.test(value)) {
    return err(
      'invalid-identifier',
      'Expected a FHIR id containing 1-64 letters, digits, hyphens, or periods.',
    )
  }
  return ok(value as FhirId)
}

export const parseFhirInstant = (value: unknown): Result<FhirInstant> => {
  if (typeof value !== 'string' || parseInstantParts(value) === undefined) {
    return err(
      'invalid-date-time',
      'Expected an RFC 3339 instant with seconds and an explicit UTC offset.',
    )
  }
  return ok(value as FhirInstant)
}

/** Compares two fully validated FHIR instants without losing sub-millisecond precision. */
export const compareFhirInstants = (
  left: unknown,
  right: unknown,
): Result<-1 | 0 | 1> => {
  const leftParts = parseInstantParts(left)
  const rightParts = parseInstantParts(right)
  if (leftParts === undefined || rightParts === undefined) {
    return err('invalid-date-time', 'Expected two valid FHIR instants.')
  }
  if (leftParts.epochSecond < rightParts.epochSecond) return ok(-1)
  if (leftParts.epochSecond > rightParts.epochSecond) return ok(1)
  return ok(compareFractions(leftParts.fraction, rightParts.fraction))
}

export const parsePatientReference = (
  value: unknown,
): Result<PatientReference> => {
  if (
    typeof value !== 'string' ||
    !isTypedResourceReference(value, 'Patient')
  ) {
    return err(
      'invalid-reference',
      'Expected Patient/{id} or an absolute HTTP(S) URL ending in /Patient/{id} without a query or fragment.',
    )
  }
  return ok(value as PatientReference)
}

export const parseResearchStudyReference = (
  value: unknown,
): Result<ResearchStudyReference> => {
  if (typeof value !== 'string') {
    return err(
      'invalid-reference',
      'Expected a ResearchStudy reference string.',
    )
  }
  if (!isTypedResourceReference(value, 'ResearchStudy')) {
    return err(
      'invalid-reference',
      'Expected ResearchStudy/{id} or an absolute HTTP(S) URL ending in /ResearchStudy/{id} without a query or fragment.',
    )
  }
  return ok(value as ResearchStudyReference)
}

export const parsePositiveInteger = (
  value: unknown,
): Result<PositiveInteger> => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    return err(
      'out-of-range',
      'Expected a positive safe integer greater than zero.',
    )
  }
  return ok(value as PositiveInteger)
}

export const parseUrnUuid = (value: unknown): Result<UrnUuid> => {
  if (typeof value !== 'string' || !URN_UUID.test(value)) {
    return err('invalid-uri', 'Expected a lowercase RFC 4122 urn:uuid fullUrl.')
  }
  return ok(value as UrnUuid)
}

export const parseSemVer = (value: unknown): Result<SemVer> => {
  if (typeof value !== 'string' || !isSemVer(value)) {
    return err('invalid-code', 'Expected a Semantic Versioning 2.0.0 version.')
  }
  return ok(value as SemVer)
}

/**
 * A FHIR `date`, `dateTime`, or `instant` as the JavaScript instant it names.
 *
 * The three primitives share one lexical space: a year, a year and month, a calendar day, or a
 * full timestamp with an offset. A value stated to lower precision resolves to the start of the
 * period it names, in UTC, because a FHIR `date` carries no offset to resolve it against — the
 * same reading `fhirDateTimeToEpoch` uses for ordering.
 *
 * `Date` holds milliseconds, so a value stating more digits is truncated rather than rounded: a
 * truncated instant still falls inside the second it was recorded in.
 */
export const fhirDateTimeToDate = (value: unknown): Result<Date> => {
  const instant = parseInstantParts(value)
  if (instant !== undefined) {
    const fraction = Number(`${instant.fraction}000`.slice(0, 3))
    return ok(new Date(Number(instant.epochSecond) * 1000 + fraction))
  }
  if (typeof value !== 'string') {
    return err(
      'invalid-date-time',
      'Expected a FHIR date, dateTime, or instant.',
    )
  }
  const groups = PARTIAL_DATE.exec(value)?.groups
  if (groups === undefined) {
    return err(
      'invalid-date-time',
      'Expected a FHIR date, dateTime, or instant.',
    )
  }
  const year = Number(groups.year)
  const month = groups.month === undefined ? 1 : Number(groups.month)
  const day = groups.day === undefined ? 1 : Number(groups.day)
  if (
    year === 0 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month)
  ) {
    return err(
      'invalid-date-time',
      'Expected a FHIR date, dateTime, or instant naming a real calendar day.',
    )
  }
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(0, 0, 0, 0)
  return ok(date)
}
