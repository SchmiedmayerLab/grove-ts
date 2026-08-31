//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

export type ReadonlyDeep<T> =
  T extends (...arguments_: never[]) => unknown ? T
  : T extends readonly unknown[] ?
    Readonly<{ [Index in keyof T]: ReadonlyDeep<T[Index]> }>
  : T extends object ? { readonly [Key in keyof T]: ReadonlyDeep<T[Key]> }
  : T

const isObject = (value: unknown): value is Record<PropertyKey, unknown> =>
  typeof value === 'object' && value !== null

export const deepFreeze = <T>(value: T): ReadonlyDeep<T> => {
  const visited = new WeakSet()
  const visit = (candidate: unknown): void => {
    if (!isObject(candidate) || visited.has(candidate)) return
    visited.add(candidate)

    // Read descriptors, not properties: freezing a data structure must not invoke getters.
    for (const descriptor of Object.values(
      Object.getOwnPropertyDescriptors(candidate),
    )) {
      if ('value' in descriptor) visit(descriptor.value)
    }
    if (!Object.isFrozen(candidate)) Object.freeze(candidate)
  }

  visit(value)
  return value as ReadonlyDeep<T>
}
