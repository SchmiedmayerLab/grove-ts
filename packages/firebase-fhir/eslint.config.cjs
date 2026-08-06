//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

const { getEslintNodeConfig } = require('@schmiedmayerlab/grove-configurations')

module.exports = [
  ...getEslintNodeConfig({ tsconfigRootDir: __dirname }),
  {
    files: ['src/**/*.ts'],
    rules: {
      // FHIR's recursive schema graph intentionally mirrors the specification.
      'import/export': 'off',
      'import/no-cycle': 'off',
      '@typescript-eslint/no-unnecessary-type-parameters': 'off',
    },
  },
]
