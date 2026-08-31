//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { codeableConceptDisplay } from './coding.js'
import { asDate, field } from './internal.js'
import { annotationTexts } from './resource.js'

/** The instant an Immunization was administered, when stated as a dateTime. */
export const immunizationOccurrenceDate = (
  immunization: unknown,
): Date | undefined => asDate(field(immunization, 'occurrenceDateTime'))

/** The instant an Immunization was recorded. */
export const immunizationRecordedDate = (
  immunization: unknown,
): Date | undefined => asDate(field(immunization, 'recorded'))

/** The date the administered lot expires. */
export const immunizationExpirationDate = (
  immunization: unknown,
): Date | undefined => asDate(field(immunization, 'expirationDate'))

/** The display the administered vaccine is named by. */
export const immunizationVaccineDisplay = (
  immunization: unknown,
): string | undefined =>
  codeableConceptDisplay(field(immunization, 'vaccineCode'))

/** The display the administration site is named by. */
export const immunizationSiteDisplay = (
  immunization: unknown,
): string | undefined => codeableConceptDisplay(field(immunization, 'site'))

/** The display the administration route is named by. */
export const immunizationRouteDisplay = (
  immunization: unknown,
): string | undefined => codeableConceptDisplay(field(immunization, 'route'))

/**
 * Whether the administered lot had expired at an instant.
 *
 * Undefined rather than false when no expiration date is stated: "not known to have expired" and
 * "known not to have expired" are different answers, and a bare false reads as the second.
 */
export const immunizationIsExpired = (
  immunization: unknown,
  asOf: Date = new Date(),
): boolean | undefined => {
  const expires = immunizationExpirationDate(immunization)
  return expires === undefined ? undefined : asOf > expires
}

/** The texts an Immunization's notes carry. */
export const immunizationNoteTexts = (
  immunization: unknown,
): readonly string[] => annotationTexts(field(immunization, 'note'))

/** The displays an Immunization's recorded reactions are named by. */
export const immunizationReactionDisplays = (
  immunization: unknown,
): readonly string[] => {
  const reactions = field(immunization, 'reaction')
  if (!Array.isArray(reactions)) return []
  return reactions
    .map((reaction) =>
      codeableConceptDisplay(
        typeof reaction === 'object' && reaction !== null ?
          (reaction as { readonly detail?: unknown }).detail
        : undefined,
      ),
    )
    .filter((display): display is string => display !== undefined)
}
