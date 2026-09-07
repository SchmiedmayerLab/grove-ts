//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { getEslintNodeConfig } from '@schmiedmayerlab/grove-configurations'

export default [
  ...getEslintNodeConfig({ tsconfigRootDir: import.meta.dirname }),
  {
    files: ['src/extract/*.ts', 'test/extract*.test.ts'],
    rules: {
      // These are canonical FHIR system identifiers, which are `http` URIs by definition rather
      // than endpoints anything requests.
      'sonarjs/no-clear-text-protocols': 'off',
    },
  },
  {
    files: ['scripts/generate-conformance-fixtures.mjs'],
    rules: {
      // The generator validates its output against the package's own built schemas, which lint runs
      // before `build` produces.
      'import-x/no-unresolved': 'off',
    },
  },
]
