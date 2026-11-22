//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { getEslintTypeAwareNodeConfig } from '@schmiedmayerlab/grove-configurations/eslint-type-aware'

export default [
  { ignores: ['vitest.config.ts'] },
  ...getEslintTypeAwareNodeConfig({ tsconfigRootDir: import.meta.dirname }),
]
