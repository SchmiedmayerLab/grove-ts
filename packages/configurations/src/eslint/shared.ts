//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//
import { defineConfig } from 'eslint/config'
import { type ConfigWithExtends } from 'typescript-eslint'

/**
 * Bridges typescript-eslint's config type to ESLint 10's native config helper.
 * The runtime shapes are compatible, but their independently published types differ.
 */
export const defineTypedConfig = (...config: ConfigWithExtends[]) =>
  defineConfig(config as unknown as Parameters<typeof defineConfig>[0])

/**
 * Completely ignores these directories
 * */
export const getIgnoredDirs = (): ConfigWithExtends => ({
  ignores: [
    'dist',
    'lib',
    'docs',
    'out',
    'build',
    'coverage',
    '.next',
    '.docusaurus',
    'storybook-static',
    '**/playwright-report',
    'eslint_report.json',
  ],
})
