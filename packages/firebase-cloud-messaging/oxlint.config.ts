//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { oxlintNodeConfig } from '@schmiedmayerlab/grove-configurations/oxlint'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [oxlintNodeConfig],
  overrides: [
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
        'typescript/no-explicit-any': 'off',
      },
    },
    {
      files: [
        'test/functions/registerDevice.test.ts',
        'test/functions/unregisterDevice.test.ts',
        'test/services/firebaseNotificationService.test.ts',
        'test/storage/firestoreDeviceStorage.test.ts',
        'test/utils/mockUtils.ts',
      ],
      rules: { 'typescript/no-unsafe-argument': 'off' },
    },
    {
      files: [
        'test/functions/registerDevice.test.ts',
        'test/models/message.test.ts',
        'test/services/firebaseNotificationService.test.ts',
        'test/storage/firestoreDeviceStorage.test.ts',
        'test/utils/schemaConverter.test.ts',
      ],
      rules: { 'typescript/no-unsafe-assignment': 'off' },
    },
    {
      files: [
        'test/services/firebaseNotificationService.test.ts',
        'test/storage/firestoreDeviceStorage.test.ts',
        'test/utils/schemaConverter.test.ts',
      ],
      rules: { 'typescript/no-unsafe-call': 'off' },
    },
    {
      files: [
        'test/functions/registerDevice.test.ts',
        'test/functions/unregisterDevice.test.ts',
        'test/models/message.test.ts',
        'test/services/firebaseNotificationService.test.ts',
        'test/storage/firestoreDeviceStorage.test.ts',
        'test/utils/schemaConverter.test.ts',
      ],
      rules: { 'typescript/no-unsafe-member-access': 'off' },
    },
    {
      files: [
        'test/storage/firestoreDeviceStorage.test.ts',
        'test/utils/mockUtils.ts',
      ],
      rules: { 'typescript/no-unsafe-return': 'off' },
    },
  ],
})
