//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { getEslintNodeConfig } from '@schmiedmayerlab/grove-configurations'

export default [
  {
    // Throwaway output of the strictness-checking projects; only `dist` is published, and neither
    // directory holds anything a reviewer wrote.
    ignores: ['.tsbuild/**'],
  },
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
    files: [
      'src/core/**/*.ts',
      'src/mobile/**/*.ts',
      'src/providers/**/*.ts',
      'src/questionnaire/**/*.ts',
      'src/r4/**/*.ts',
    ],
    rules: {
      // These files are checked under `exactOptionalPropertyTypes` by `tsconfig.strict.json`,
      // where `field?: T` and `field?: T | undefined` mean different things: only the second
      // admits an explicitly assigned `undefined`. The union is load-bearing, not redundant.
      'sonarjs/no-redundant-optional': 'off',
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
    files: [
      'test/derived-shapes.test.ts',
      'test/legacy-surface.test.ts',
      'test/resources/testHelpers.ts',
    ],
    rules: {
      // Resource ordering is deterministic; locale-aware ordering would vary by runner. The shape
      // and export-surface fixtures are compared byte for byte, so their ordering has to be too.
      'sonarjs/no-alphabetical-sort': 'off',
    },
  },
  {
    // `foundation.test.ts` is deliberately excluded: it is a byte-for-byte copy of the guide's own
    // suite, which carries its own inline directives, and a file-level rule here would make those
    // redundant and so report them as unused.
    files: ['test/grove-profiles.test.ts'],
    rules: {
      // These fixtures carry canonical FHIR system identifiers, not network requests.
      'sonarjs/no-clear-text-protocols': 'off',
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
