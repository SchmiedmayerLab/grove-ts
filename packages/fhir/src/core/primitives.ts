//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { err, ok, type Result } from './result.js'

declare const brand: unique symbol

type Branded<Name extends string> = string & { readonly [brand]: Name }

export type AbsoluteUri = Branded<'AbsoluteUri'>
export type Canonical = Branded<'Canonical'>
export type FhirId = Branded<'FhirId'>
export type FhirInstant = Branded<'FhirInstant'>
export type PatientReference = Branded<'PatientReference'>
export type SemVer = Branded<'SemVer'>
export type UrnUuid = Branded<'UrnUuid'>

const FHIR_ID = /^[A-Za-z0-9\-.]{1,64}$/u
const INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u
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
  if (
    typeof value !== 'string' ||
    !INSTANT.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    return err(
      'invalid-date-time',
      'Expected an RFC 3339 instant with seconds and an explicit UTC offset.',
    )
  }
  return ok(value as FhirInstant)
}

export const parsePatientReference = (
  value: unknown,
): Result<PatientReference> => {
  if (typeof value !== 'string') {
    return err('invalid-reference', 'Expected a Patient reference string.')
  }

  const localId =
    value.startsWith('Patient/') ? value.slice('Patient/'.length) : undefined
  const validLocal = localId !== undefined && FHIR_ID.test(localId)
  const validAbsolute = isAbsoluteUri(value) && value.includes('/Patient/')
  if (!validLocal && !validAbsolute) {
    return err(
      'invalid-reference',
      'Expected Patient/{id} or an absolute Patient reference.',
    )
  }
  return ok(value as PatientReference)
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
