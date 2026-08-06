//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

const { getEslintNodeConfig } = require('./dist')

module.exports = [
  ...getEslintNodeConfig({ tsconfigRootDir: __dirname }),
  {
    files: ['src/eslint.ts'],
    rules: {
      // Keep the compatible helper until typescript-eslint aligns with ESLint's config types.
      '@typescript-eslint/no-deprecated': 'off',
    },
  },
]
