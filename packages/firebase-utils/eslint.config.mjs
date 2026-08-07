//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { getEslintNodeConfig } from '@schmiedmayerlab/grove-configurations'
import { configs } from 'typescript-eslint'

export default [
  ...getEslintNodeConfig({ tsconfigRootDir: import.meta.dirname }),
  {
    // Examples and tool configuration are intentionally outside the production TS program.
    ...configs.disableTypeChecked,
    files: ['examples/**/*.ts', 'vitest.config.ts'],
  },
]
