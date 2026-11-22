//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/eslint/typeAware.ts',
    'src/oxlint/index.ts',
    // Not exported: oxlint loads the sonarjs wrapper by its file path.
    'src/oxlint/sonarjs.ts',
    'src/oxfmt.ts',
    'src/prettier.ts',
  ],
  format: 'esm',
  unbundle: true,
  clean: true,
  outDir: 'dist',
  dts: true,
})
