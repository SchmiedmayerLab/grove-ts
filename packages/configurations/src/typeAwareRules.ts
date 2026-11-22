//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

/**
 * @eslint-react strict rules that need TypeScript type information.
 * oxlint runs JS plugins without type information, so these rules stay in ESLint.
 */
export const typeAwareReactRules = [
  '@eslint-react/no-leaked-conditional-rendering',
  '@eslint-react/no-unused-props',
] as const
