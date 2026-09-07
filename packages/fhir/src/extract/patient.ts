//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { codeableConceptDisplay } from './coding.js'
import { asDate, field } from './internal.js'
import { contactPointsBySystem, formatHumanName } from './person.js'

/** A Patient's birth date, as the UTC start of the day it names. */
export const patientBirthDate = (patient: unknown): Date | undefined =>
  asDate(field(patient, 'birthDate'))

/** The instant a Patient is recorded as having died, when stated as a dateTime. */
export const patientDeceasedDate = (patient: unknown): Date | undefined =>
  asDate(field(patient, 'deceasedDateTime'))

/**
 * Whether a Patient is recorded as deceased.
 *
 * A stated `deceasedDateTime` asserts it as surely as `deceasedBoolean` does; a resource that
 * states neither is not an assertion that the patient is alive, so this reports false only in
 * the sense of "not recorded as deceased".
 */
export const patientIsDeceased = (patient: unknown): boolean => {
  const flag = field(patient, 'deceasedBoolean')
  if (typeof flag === 'boolean') return flag
  return field(patient, 'deceasedDateTime') !== undefined
}

/**
 * A Patient's age in whole years at an instant.
 *
 * Computed entirely in UTC. A FHIR `date` names a calendar day with no offset, and comparing it
 * against the host's local calendar moves the birthday by a day for anyone west of UTC — which
 * is a wrong age for one day each year.
 *
 * A patient recorded as deceased is aged to their death rather than to `asOf`, because a person
 * does not keep having birthdays afterwards.
 */
export const patientAgeInYears = (
  patient: unknown,
  asOf: Date = new Date(),
): number | undefined => {
  const birth = patientBirthDate(patient)
  if (birth === undefined) return undefined
  const died = patientDeceasedDate(patient)
  const at = died !== undefined && died < asOf ? died : asOf
  if (at < birth) return undefined
  let age = at.getUTCFullYear() - birth.getUTCFullYear()
  const months = at.getUTCMonth() - birth.getUTCMonth()
  if (months < 0 || (months === 0 && at.getUTCDate() < birth.getUTCDate())) {
    age -= 1
  }
  return age
}

/** A Patient's name as one display string, preferring the first name stated. */
export const patientName = (
  patient: unknown,
  options: {
    readonly includePrefix?: boolean
    readonly includeSuffix?: boolean
  } = {},
): string | undefined => {
  const names = field(patient, 'name')
  if (!Array.isArray(names)) return undefined
  return names
    .map((name) => formatHumanName(name, options))
    .find((name): name is string => name !== undefined)
}

/** Every phone number a Patient states. */
export const patientPhoneNumbers = (patient: unknown): readonly string[] =>
  contactPointsBySystem(patient, 'phone')

/** Every email address a Patient states. */
export const patientEmailAddresses = (patient: unknown): readonly string[] =>
  contactPointsBySystem(patient, 'email')

/** The display a Patient's marital status is named by. */
export const patientMaritalStatusDisplay = (
  patient: unknown,
): string | undefined => codeableConceptDisplay(field(patient, 'maritalStatus'))
