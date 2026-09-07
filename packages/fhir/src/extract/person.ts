//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

/** Which parts of a HumanName to include; given and family are always included. */
export interface HumanNameOptions {
  readonly includePrefix?: boolean
  readonly includeSuffix?: boolean
}

const strings = (value: unknown): readonly string[] =>
  Array.isArray(value) ?
    value.filter(
      (entry): entry is string => typeof entry === 'string' && entry.length > 0,
    )
  : []

/**
 * A HumanName as its ordered parts.
 *
 * `text` wins outright when the name states it: it is the name as its owner writes it, and
 * reassembling the parts instead reorders names whose culture puts the family name first.
 */
export const humanNameParts = (
  name: unknown,
  options: HumanNameOptions = {},
): readonly string[] => {
  if (typeof name !== 'object' || name === null) return []
  const value = name as {
    readonly text?: unknown
    readonly prefix?: unknown
    readonly given?: unknown
    readonly family?: unknown
    readonly suffix?: unknown
  }
  if (typeof value.text === 'string' && value.text.length > 0) {
    return [value.text]
  }
  const parts: string[] = []
  if (options.includePrefix === true) parts.push(...strings(value.prefix))
  parts.push(...strings(value.given))
  if (typeof value.family === 'string' && value.family.length > 0) {
    parts.push(value.family)
  }
  if (options.includeSuffix === true) parts.push(...strings(value.suffix))
  return parts
}

/** A HumanName as one display string, or undefined when it names nothing. */
export const formatHumanName = (
  name: unknown,
  options: HumanNameOptions = {},
): string | undefined => {
  const parts = humanNameParts(name, options)
  return parts.length > 0 ? parts.join(' ') : undefined
}

const telecom = (
  resource: unknown,
): ReadonlyArray<{
  readonly system?: string
  readonly value?: string
  readonly use?: string
}> => {
  if (typeof resource !== 'object' || resource === null) return []
  const value = (resource as { readonly telecom?: unknown }).telecom
  if (!Array.isArray(value)) return []
  return value.filter(
    (entry): entry is { readonly system?: string; readonly value?: string } =>
      typeof entry === 'object' && entry !== null,
  )
}

/** Every contact value the resource states for one system, such as `phone` or `email`. */
export const contactPointsBySystem = (
  resource: unknown,
  system: string,
): readonly string[] =>
  telecom(resource)
    .filter((point) => point.system === system)
    .map((point) => point.value)
    .filter((value): value is string => typeof value === 'string')

/** The first contact value for one system, optionally narrowed to a use such as `home`. */
export const contactPointBySystem = (
  resource: unknown,
  system: string,
  use?: string,
): string | undefined =>
  telecom(resource)
    .filter(
      (point) =>
        point.system === system && (use === undefined || point.use === use),
    )
    .map((point) => point.value)
    .find((value): value is string => typeof value === 'string')
