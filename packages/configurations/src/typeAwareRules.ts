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
  "@eslint-react/no-leaked-conditional-rendering",
  "@eslint-react/no-unused-props",
] as const;

/**
 * typescript-eslint rules of the strict and stylistic type-checked presets that oxlint-tsgolint does not implement yet.
 * They stay in ESLint until oxlint can run them.
 */
export const typeAwareTypeScriptEslintRules = [
  "@typescript-eslint/no-unsafe-class-instance-assignment",
] as const;
