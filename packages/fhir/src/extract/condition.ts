//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  codeableConceptDisplay,
  codesBySystem,
  containsCoding,
} from './coding.js'
import { asDate, field } from './internal.js'
import { fhirPeriodToBounds } from './period.js'

const CLINICAL_STATUS =
  'http://terminology.hl7.org/CodeSystem/condition-clinical'
const VERIFICATION_STATUS =
  'http://terminology.hl7.org/CodeSystem/condition-ver-status'

/** The clinical statuses FHIR counts as the condition still being present. */
const PRESENT: readonly string[] = ['active', 'recurrence', 'relapse']

/** The instant a Condition began, when it states one as a dateTime or a period. */
export const conditionOnsetDate = (condition: unknown): Date | undefined =>
  asDate(field(condition, 'onsetDateTime')) ??
  fhirPeriodToBounds(field(condition, 'onsetPeriod')).start

/** The instant a Condition resolved, when it states one as a dateTime or a period. */
export const conditionAbatementDate = (condition: unknown): Date | undefined =>
  asDate(field(condition, 'abatementDateTime')) ??
  fhirPeriodToBounds(field(condition, 'abatementPeriod')).start

/** The instant a Condition was recorded. */
export const conditionRecordedDate = (condition: unknown): Date | undefined =>
  asDate(field(condition, 'recordedDate'))

/** The display a Condition's code is best named by. */
export const conditionCodeDisplay = (condition: unknown): string | undefined =>
  codeableConceptDisplay(field(condition, 'code'))

/** The clinical status code a Condition states, when it states one. */
export const conditionClinicalStatus = (
  condition: unknown,
): string | undefined =>
  codesBySystem(field(condition, 'clinicalStatus'), CLINICAL_STATUS)[0]

/**
 * Whether a Condition is still present.
 *
 * `clinicalStatus` decides it when stated, because that is the element FHIR gives the answer in:
 * a condition coded `resolved` is resolved whether or not anyone recorded an abatement date.
 * Only when no status is stated does an abatement of any kind stand in for one.
 */
export const conditionIsActive = (condition: unknown): boolean => {
  const status = conditionClinicalStatus(condition)
  if (status !== undefined) return PRESENT.includes(status)
  return ![
    'abatementDateTime',
    'abatementAge',
    'abatementPeriod',
    'abatementRange',
    'abatementString',
    'abatementBoolean',
  ].some((name) => field(condition, name) !== undefined)
}

/** Whether a Condition's verification status is `confirmed`. */
export const conditionIsConfirmed = (condition: unknown): boolean =>
  containsCoding(
    field(condition, 'verificationStatus'),
    VERIFICATION_STATUS,
    'confirmed',
  )

/** The milliseconds a Condition lasted, stated only when it names both onset and abatement. */
export const conditionDuration = (condition: unknown): number | undefined => {
  const onset = conditionOnsetDate(condition)
  const abatement = conditionAbatementDate(condition)
  if (onset === undefined || abatement === undefined) return undefined
  return abatement.getTime() - onset.getTime()
}

/** The displays a Condition's categories are named by. */
export const conditionCategoryDisplays = (
  condition: unknown,
): readonly string[] => {
  const categories = field(condition, 'category')
  if (!Array.isArray(categories)) return []
  return categories
    .map((category) => codeableConceptDisplay(category))
    .filter((display): display is string => display !== undefined)
}
