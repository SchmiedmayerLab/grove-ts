//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

// Synthetic violations for the configuration tests.

export function declared(value: number) {
  return value
}

export const run = async () => Promise.resolve(1)

export const caller = () => {
  run()
}

export const sorted = (values: number[]) => values.sort()

export const handler = (e: Event) => e.type

export const repeated = /(a+)+$/

export const trimmed = (name: string) => {
  name.trim()
  return name
}
