//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//
import { type OxfmtConfig } from 'oxfmt'

/**
 * oxfmt configuration with Prettier's defaults, Tailwind class sorting and import sorting.
 * Import groups follow the former `import-x/order` rule: builtin, external, internal, then relative.
 */
export const oxfmtConfig: OxfmtConfig = {
  printWidth: 80,
  sortPackageJson: false,
  sortTailwindcss: {},
  sortImports: {
    groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
    internalPattern: ['@/'],
    newlinesBetween: false,
    ignoreCase: true,
  },
}
