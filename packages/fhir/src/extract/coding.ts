//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

/** A Coding reduced to the fields a consumer matches on. */
export interface CodingParts {
  readonly system?: string
  readonly code?: string
  readonly display?: string
}

const codings = (concept: unknown): readonly CodingParts[] => {
  if (typeof concept !== 'object' || concept === null) return []
  const value = (concept as { readonly coding?: unknown }).coding
  if (!Array.isArray(value)) return []
  return value.filter(
    (entry): entry is CodingParts =>
      typeof entry === 'object' && entry !== null,
  )
}

const text = (concept: unknown): string | undefined => {
  if (typeof concept !== 'object' || concept === null) return undefined
  const value = (concept as { readonly text?: unknown }).text
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * The display a CodeableConcept is best named by.
 *
 * `text` wins over a coding's display: it is what the source chose to call this concept, where a
 * coding's display is the terminology's own label. A concept carrying neither is reported as
 * undefined rather than as its bare code, which reads as a label but is not one.
 */
export const codeableConceptDisplay = (concept: unknown): string | undefined =>
  text(concept) ??
  codings(concept).find(
    (coding) => typeof coding.display === 'string' && coding.display.length > 0,
  )?.display

/** Every display the concept's codings carry, in the order the concept states them. */
export const codeableConceptDisplays = (concept: unknown): readonly string[] =>
  codings(concept)
    .map((coding) => coding.display)
    .filter((display): display is string => typeof display === 'string')

/** The codes the concept states in one system, so a caller can match without scanning. */
export const codesBySystem = (
  concept: unknown,
  system: string,
): readonly string[] =>
  codings(concept)
    .filter((coding) => coding.system === system)
    .map((coding) => coding.code)
    .filter((code): code is string => typeof code === 'string')

/**
 * Whether the concept states this exact code in this exact system.
 *
 * Both are required: a bare code matched across systems is how two unrelated terminologies get
 * conflated, and that mistake is silent.
 */
export const containsCoding = (
  concept: unknown,
  system: string,
  code: string,
): boolean =>
  codings(concept).some(
    (coding) => coding.system === system && coding.code === code,
  )
