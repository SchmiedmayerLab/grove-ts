//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

/**
 * Stringify an object with deterministically sorted keys
 * @param object The object to stringify
 * @returns JSON string with sorted keys
 */
export const jsonStringifyDeterministically = (object: unknown): string =>
  JSON.stringify(
    object,
    (_, value) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return Object.keys(value)
          .sort()
          .reduce<any>((sorted, key) => {
            sorted[key] = value[key]
            return sorted
          }, {})
      }
      return value
    },
    2,
  )
