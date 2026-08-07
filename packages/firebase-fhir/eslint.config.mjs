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
    files: ['src/**/*.ts'],
    rules: {
      // FHIR's recursive schema graph intentionally mirrors the specification.
      'import-x/no-cycle': 'off',
    },
  },
  {
    files: [
      'src/resources/allergyIntolerance.ts',
      'src/resources/condition.ts',
    ],
    rules: {
      // These values are canonical FHIR system identifiers, not network requests.
      'sonarjs/no-clear-text-protocols': 'off',
    },
  },
  {
    files: ['src/elements/dataTypes/primitiveTypes.ts'],
    rules: {
      // These expressions reproduce the normative FHIR lexical formats.
      'sonarjs/concise-regex': 'off',
      'sonarjs/regex-complexity': 'off',
      'sonarjs/single-character-alternation': 'off',
      'sonarjs/slow-regex': 'off',
    },
  },
  {
    files: [
      'test/resources/additionalResourceMethods.test.ts',
      'test/resources/bundleFindResourcesWith.test.ts',
      'test/resources/bundleWithNewResources.test.ts',
      'test/resources/patientMethods.test.ts',
    ],
    rules: {
      // These fixtures exercise canonical FHIR HTTP identifiers.
      'sonarjs/no-clear-text-protocols': 'off',
    },
  },
  {
    files: ['test/resources/testHelpers.ts'],
    rules: {
      // Resource ordering is deterministic; locale-aware ordering would vary by runner.
      'sonarjs/no-alphabetical-sort': 'off',
    },
  },
  {
    files: [
      'test/resources/domainResourceClass.test.ts',
      'test/resources/observationEffective.test.ts',
    ],
    rules: {
      // These conformance cases have distinct assertions despite similar setup.
      'sonarjs/parameterized-tests': 'off',
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
