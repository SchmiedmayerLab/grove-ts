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
    // Examples and tool configuration are intentionally outside the production TS program.
    ...configs.disableTypeChecked,
    files: ['examples/**/*.ts', 'vitest.config.ts'],
    rules: {
      ...configs.disableTypeChecked.rules,
    },
  },
]
