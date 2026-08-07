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
      // FHIR defines canonical HTTP identifiers and specification-grade regular expressions.
      'sonarjs/concise-regex': 'off',
      'sonarjs/no-clear-text-protocols': 'off',
      'sonarjs/regex-complexity': 'off',
      'sonarjs/single-character-alternation': 'off',
      'sonarjs/slow-regex': 'off',
    },
  },
  {
    files: ['test/**/*.ts'],
    rules: {
      // FHIR fixtures use canonical HTTP identifiers and repetitive conformance cases.
      'sonarjs/no-alphabetical-sort': 'off',
      'sonarjs/no-clear-text-protocols': 'off',
    },
  },
  {
    files: ['test/resources/**/*.ts'],
    rules: {
      // JSON fixtures are untyped input by design; schemas perform the runtime validation.
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
]
