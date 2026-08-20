//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

export type ReadonlyDeep<T> =
  T extends (...arguments_: never[]) => unknown ? T
  : T extends ReadonlyArray<infer Item> ? ReadonlyArray<ReadonlyDeep<Item>>
  : T extends object ? { readonly [Key in keyof T]: ReadonlyDeep<T[Key]> }
  : T

const isObject = (value: unknown): value is Record<PropertyKey, unknown> =>
  typeof value === 'object' && value !== null

export const deepFreeze = <T>(value: T): ReadonlyDeep<T> => {
  if (!isObject(value) || Object.isFrozen(value)) {
    return value as ReadonlyDeep<T>
  }

  for (const nested of Object.values(value)) {
    deepFreeze(nested)
  }

  return Object.freeze(value) as ReadonlyDeep<T>
}
