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
    // The build intentionally excludes tool configuration files from its typed program.
    ...configs.disableTypeChecked,
    files: ['vitest.config.ts'],
  },
  {
    files: [
      'test/functions/registerDevice.test.ts',
      'test/functions/unregisterDevice.test.ts',
      'test/models/message.test.ts',
      'test/services/firebaseNotificationService.test.ts',
      'test/storage/firestoreDeviceStorage.test.ts',
      'test/utils/mockUtils.ts',
      'test/utils/schemaConverter.test.ts',
    ],
    rules: {
      // Firebase mocks deliberately model partially implemented external services.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
]
