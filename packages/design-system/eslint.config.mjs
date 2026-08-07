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
      'src/components/Async/Async.tsx',
      'src/components/Avatar/Avatar.tsx',
      'src/components/Button/SaveButton/SaveButton.tsx',
      'src/components/DataTable/DataTable.tsx',
      'src/components/DataTable/ToggleSortButton.tsx',
      'src/components/DatePicker/DatePicker.tsx',
      'src/components/EmptyState/EmptyState.tsx',
      'src/components/Sheet/Sheet.tsx',
      'src/molecules/ConfirmDeleteDialog/ConfirmDeleteDialog.tsx',
      'src/utils/query/query.ts',
    ],
    rules: {
      // These conditional rendering branches are more readable alongside their JSX.
      'sonarjs/no-nested-conditional': 'off',
    },
  },
  {
    files: [
      'src/components/Avatar/Avatar.tsx',
      'src/modules/auth/SignInForm/EmailPasswordForm/EmailPasswordForm.tsx',
      'src/modules/auth/SignInForm/SignInForm.tsx',
      'src/modules/auth/user.ts',
      'src/utils/date/date.ts',
    ],
    rules: {
      // Explicit undefined remains part of these public optional-property types.
      'sonarjs/no-redundant-optional': 'off',
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
