//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getEslintNodeConfig,
  getEslintReactConfig,
  prettierConfig,
} from '@schmiedmayerlab/grove-configurations'

test('loads the published ESM configuration entry point', () => {
  const options = { tsconfigRootDir: import.meta.dirname }

  assert.ok(getEslintNodeConfig(options).length > 0)
  assert.ok(getEslintReactConfig(options).length > 0)
  assert.equal(typeof prettierConfig, 'object')
})
