//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { getEslintReactConfig } from '@schmiedmayerlab/grove-configurations'
import eslintPluginJsdoc from 'eslint-plugin-jsdoc'

export default [
  { ignores: ['storybook-static'] },
  ...getEslintReactConfig({ tsconfigRootDir: import.meta.dirname }),
  {
    files: ['**/*.{js,ts,tsx}'],
    plugins: {
      jsdoc: eslintPluginJsdoc,
    },
    rules: {
      'jsdoc/no-multi-asterisks': 'error',
    },
  },
  {
    files: [
      'src/components/Breadcrumb/Breadcrumb.tsx',
      'src/components/Pagination/LinkPagination/LinkPagination.tsx',
      'src/molecules/DashboardLayout/MenuItem.tsx',
      'src/molecules/NotFound/NotFound.tsx',
      'src/molecules/Notifications/NotificationLink.tsx',
    ],
    rules: {
      // Grove accepts a stable router Link implementation through context.
      // The rule cannot distinguish it from a component created during render.
      '@eslint-react/static-components': 'off',
    },
  },
  {
    files: [
      'src/modules/auth/SignInForm/EmailPasswordForm/EmailPasswordForm.test.tsx',
    ],
    rules: {
      // This credential is synthetic test data.
      'sonarjs/no-hardcoded-passwords': 'off',
    },
  },
  {
    files: ['src/components/Toaster/Toaster.stories.tsx'],
    rules: {
      // Storybook interaction callbacks naturally follow the story's nested API shape.
      'sonarjs/no-nested-functions': 'off',
    },
  },
  {
    files: ['src/tests/storybook.tsx'],
    rules: {
      // Storybook's preview API requires this exported hook name.
      '@eslint-react/no-unnecessary-use-prefix': 'off',
    },
  },
  {
    files: ['src/components/Error/Error.tsx'],
    rules: {
      // Error is the intentional public name of the validation-message component.
      'sonarjs/no-globals-shadowing': 'off',
    },
  },
]
