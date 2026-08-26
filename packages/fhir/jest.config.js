//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

/** @type {import('ts-jest').JestConfigWithTsJest} */
const config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'test/tsconfig.json',
        useESM: true,
      },
    ],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'json-summary', 'lcov'],
  // A path key takes its files out of the global group, so the global numbers describe the
  // generated R4B surface on its own and stay where they were. The Grove layer is hand-written and
  // held to what its own tests actually reach.
  coverageThreshold: {
    global: {
      branches: 28,
      functions: 34,
      lines: 64,
      statements: 63,
    },
    './src/core/': {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95,
    },
    './src/r4/': {
      branches: 85,
      functions: 95,
      lines: 95,
      statements: 95,
    },
    './src/mobile/': {
      branches: 90,
      functions: 100,
      lines: 95,
      statements: 95,
    },
    './src/providers/': {
      branches: 88,
      functions: 100,
      lines: 95,
      statements: 92,
    },
    './src/questionnaire/': {
      branches: 88,
      functions: 95,
      lines: 95,
      statements: 93,
    },
  },
}

export default config
