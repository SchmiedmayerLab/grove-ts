//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { getEslintTypeAwareNodeConfig } from './dist/eslint/typeAware.mjs'

export default [
  { ignores: ['test/fixtures/**'] },
  ...getEslintTypeAwareNodeConfig({ tsconfigRootDir: import.meta.dirname }),
]
