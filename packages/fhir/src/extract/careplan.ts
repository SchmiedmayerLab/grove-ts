//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { codeableConceptDisplay } from './coding.js'
import { asDate, field } from './internal.js'
import { fhirPeriodToBounds, periodIsActive } from './period.js'
import { annotationTexts } from './resource.js'

/** The instant a CarePlan was created. */
export const carePlanCreatedDate = (carePlan: unknown): Date | undefined =>
  asDate(field(carePlan, 'created'))

/** The start of a CarePlan's period. */
export const carePlanPeriodStart = (carePlan: unknown): Date | undefined =>
  fhirPeriodToBounds(field(carePlan, 'period')).start

/** The end of a CarePlan's period. */
export const carePlanPeriodEnd = (carePlan: unknown): Date | undefined =>
  fhirPeriodToBounds(field(carePlan, 'period')).end

/**
 * Whether a CarePlan's period covers an instant.
 *
 * A plan stating no period counts as covering it, the same reading `periodIsActive` gives
 * elsewhere: a missing period means unbounded rather than never.
 */
export const carePlanPeriodIsActive = (
  carePlan: unknown,
  asOf: Date = new Date(),
): boolean => periodIsActive(field(carePlan, 'period'), asOf)

/** The displays a CarePlan's categories are named by. */
export const carePlanCategoryDisplays = (
  carePlan: unknown,
): readonly string[] => {
  const categories = field(carePlan, 'category')
  if (!Array.isArray(categories)) return []
  return categories
    .map((category) => codeableConceptDisplay(category))
    .filter((display): display is string => display !== undefined)
}

/** The texts a CarePlan's notes carry. */
export const carePlanNoteTexts = (carePlan: unknown): readonly string[] =>
  annotationTexts(field(carePlan, 'note'))
