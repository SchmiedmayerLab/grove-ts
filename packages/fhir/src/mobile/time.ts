//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { mobileEffectiveCanonicalization } from './measurement-catalog.generated.js'
import {
  err,
  parseFhirInstant,
  type FhirInstant,
  type Result,
} from '../core/index.js'

const OFFSET_INSTANT =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.(?<fraction>\d+))?(?<zone>Z|[+-]\d{2}:\d{2})$/u
const SUPPORTED_PRECISION_DIGITS = new Map<string, number>([['millisecond', 3]])
const SUPPORTED_ROUNDING = new Set<string>(['half-even'])

const shouldRoundUp = (floorMillisecond: bigint, tail: string): boolean => {
  if (tail === '') return false
  if (tail.charAt(0) > '5') return true
  if (tail.charAt(0) < '5') return false
  if (/[^0]/u.test(tail.slice(1))) return true
  return floorMillisecond % 2n !== 0n
}

const offsetMinutes = (zone: string): number => {
  if (zone === 'Z') return 0
  const magnitude = Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6))
  return zone.startsWith('-') ? -magnitude : magnitude
}

/**
 * Applies the generated Mobile IG effective-time policy without floating-point
 * truncation. Sensor and ECG SampledData timing intentionally does not use this
 * function.
 */
export const canonicalizeMobileEffectiveInstant = (
  value: unknown,
): Result<FhirInstant> => {
  const precisionDigits = SUPPORTED_PRECISION_DIGITS.get(
    mobileEffectiveCanonicalization.precision,
  )
  if (
    precisionDigits === undefined ||
    !SUPPORTED_ROUNDING.has(mobileEffectiveCanonicalization.rounding)
  ) {
    return err(
      'invalid-date-time',
      'The generated Mobile effective-time contract is not supported.',
    )
  }

  const parsed = parseFhirInstant(value)
  if (!parsed.ok || typeof value !== 'string') return parsed
  const groups = OFFSET_INSTANT.exec(value)?.groups
  if (groups === undefined) {
    return err(
      'invalid-date-time',
      'Expected a valid Mobile effective instant.',
    )
  }

  const localSecond = new Date(0)
  localSecond.setUTCFullYear(
    Number(groups.year),
    Number(groups.month) - 1,
    Number(groups.day),
  )
  localSecond.setUTCHours(
    Number(groups.hour),
    Number(groups.minute),
    Number(groups.second),
    0,
  )
  const zone = groups.zone ?? 'Z'
  const epochSecond =
    BigInt(Math.trunc(localSecond.getTime() / 1000)) -
    BigInt(offsetMinutes(zone) * 60)
  const fraction = groups.fraction ?? ''
  const withinSecond = BigInt(
    (fraction + '0'.repeat(precisionDigits)).slice(0, precisionDigits),
  )
  const floorMillisecond = epochSecond * 1000n + withinSecond
  const roundedMillisecond =
    floorMillisecond +
    (shouldRoundUp(floorMillisecond, fraction.slice(precisionDigits)) ? 1n : 0n)
  const localMillisecond =
    roundedMillisecond + BigInt(offsetMinutes(zone) * 60_000)

  if (
    localMillisecond > BigInt(Number.MAX_SAFE_INTEGER) ||
    localMillisecond < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    return err(
      'invalid-date-time',
      'Rounded Mobile effective instant is outside the supported FHIR range.',
    )
  }
  const rendered = new Date(Number(localMillisecond)).toISOString()
  if (!/^\d{4}-/u.test(rendered)) {
    return err(
      'invalid-date-time',
      'Rounding would move the Mobile effective instant outside four-digit FHIR years.',
    )
  }
  return parseFhirInstant(`${rendered.slice(0, 23)}${zone}`)
}
