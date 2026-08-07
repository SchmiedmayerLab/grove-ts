//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

const { getEslintNodeConfig } = require('@schmiedmayerlab/grove-configurations')
const { configs } = require('typescript-eslint')

module.exports = [
  ...getEslintNodeConfig({ tsconfigRootDir: __dirname }),
  {
    // The build intentionally excludes tool configuration files from its typed program.
    ...configs.disableTypeChecked,
    files: ['vitest.config.ts'],
  },
  {
    files: ['test/**/*.ts'],
    rules: {
      // Firebase mocks deliberately model partially implemented external services.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
]
