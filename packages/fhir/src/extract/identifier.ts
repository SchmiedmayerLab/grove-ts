//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { containsCoding } from './coding.js'

/** An Identifier reduced to the fields a consumer selects on. */
export interface IdentifierParts {
  readonly system?: string
  readonly value?: string
  readonly use?: string
  readonly type?: unknown
}

const identifiers = (resource: unknown): readonly IdentifierParts[] => {
  if (typeof resource !== 'object' || resource === null) return []
  const value = (resource as { readonly identifier?: unknown }).identifier
  // Most resources carry a list; a few, such as Bundle, carry exactly one.
  const list = Array.isArray(value) ? value : [value]
  return list.filter(
    (entry): entry is IdentifierParts =>
      typeof entry === 'object' && entry !== null,
  )
}

/** Every identifier value the resource states in one system. */
export const identifiersBySystem = (
  resource: unknown,
  system: string,
): readonly string[] =>
  identifiers(resource)
    .filter((identifier) => identifier.system === system)
    .map((identifier) => identifier.value)
    .filter((value): value is string => typeof value === 'string')

/**
 * The single identifier value the resource states in one system.
 *
 * The first when several are stated, which is the order the resource chose; a caller that must
 * distinguish them wants `identifiersBySystem` and its own rule.
 */
export const identifierBySystem = (
  resource: unknown,
  system: string,
): string | undefined => identifiersBySystem(resource, system)[0]

/** Every identifier value whose type states this code, in the given type system. */
export const identifiersByType = (
  resource: unknown,
  system: string,
  code: string,
): readonly string[] =>
  identifiers(resource)
    .filter((identifier) => containsCoding(identifier.type, system, code))
    .map((identifier) => identifier.value)
    .filter((value): value is string => typeof value === 'string')

/** The first identifier value whose type states this code. */
export const identifierByType = (
  resource: unknown,
  system: string,
  code: string,
): string | undefined => identifiersByType(resource, system, code)[0]
