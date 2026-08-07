//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//
import eslint from '@eslint/js'
import reactPlugin from '@eslint-react/eslint-plugin'
import { type Processor } from '@typescript-eslint/utils/ts-eslint'
import { defineConfig } from 'eslint/config'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import { flatConfigs as importConfigs } from 'eslint-plugin-import-x'
import * as preferArrow from 'eslint-plugin-prefer-arrow-functions'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'
import { configs as sonarConfigs } from 'eslint-plugin-sonarjs'
import globals from 'globals'
import { configs, type ConfigWithExtends } from 'typescript-eslint'

const sonarRecommended =
  sonarConfigs.recommended as unknown as ConfigWithExtends

/**
 * Bridges typescript-eslint's config type to ESLint 10's native config helper.
 * The runtime shapes are compatible, but their independently published types differ.
 */
const defineTypedConfig = (...config: ConfigWithExtends[]) =>
  defineConfig(config as unknown as Parameters<typeof defineConfig>[0])

interface EslintConfigParams {
  /**
   * Root of the project, where tsconfig exists.
   * Most likely it's going to be `import.meta.dirname` or `__dirname`.
   * */
  tsconfigRootDir: string
  /**
   * List of TypeScript configuration files.
   * Required if there are multiple files with references.
   * */
  tsConfigsDirs?: string[]
  /**
   * Changes every rule to "warning" instead of "error".
   * This prevents ESLint to fail if any rule fails.
   * Useful when migrating large codebases. Use with caution.
   * */
  changeEveryRuleToWarning?: boolean
}

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

/**
 * Fails on stale suppressions so lint exceptions cannot silently accumulate.
 */
export const getLinterOptions = (): ConfigWithExtends => ({
  linterOptions: {
    reportUnusedDisableDirectives: 'error',
    reportUnusedInlineConfigs: 'error',
  },
})

/**
 * Basic recommended ESLint rules with overrides
 * */
export const getEslintRules = (): ConfigWithExtends[] => [
  eslint.configs.recommended,
]

/*
 * Rules for import plugin.
 * Auto rules reordering, prevents cycles, forces lack of extensions.
 * */
export const getImportRules = (
  tsConfigsDirs: string[],
): ConfigWithExtends[] => [
  importConfigs.recommended,
  importConfigs.typescript,
  {
    settings: {
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          project: ['./tsconfig.json', ...tsConfigsDirs],
        }),
      ],
    },
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    rules: {
      'import-x/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling']],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'never',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],
      'import-x/no-empty-named-blocks': 'error',
      'import-x/no-mutable-exports': 'error',
      'import-x/no-cycle': 'error',
      'import-x/extensions': [
        'warn',
        'always',
        {
          ignorePackages: true,
          pathGroupOverrides: [
            {
              pattern: 'fhir/**',
              action: 'ignore',
            },
          ],
          pattern: {
            ts: 'never',
            tsx: 'never',
            js: 'never',
            jsx: 'never',
            mjs: 'never',
          },
        },
      ],
      'import-x/newline-after-import': 'warn',
      'import-x/no-anonymous-default-export': 'warn',
      'import-x/no-default-export': 'error',
      'import-x/no-duplicates': [
        'error',
        {
          'prefer-inline': true,
        },
      ],
    },
  },
]

/**
 * Injects Node globals for Node-based configuration files
 * */
export const getNodeGlobals = (): ConfigWithExtends => ({
  files: [
    '**/eslint.config.?(c)js',
    '**/.prettierrc.?(c)js',
    '**/postcss.config.?(c)js',
    '**/tailwind.config.?(c)js',
  ],
  languageOptions: {
    globals: globals.node,
  },
})

/**
 * Enforces arrow functions instead of named function
 * Automatically replaces every named function with an arrow function.
 * */
export const getPreferArrowFunctions = (): ConfigWithExtends => ({
  files: ['**/*.{js,jsx,ts,tsx}'],
  plugins: {
    'prefer-arrow-functions': preferArrow,
  },
  rules: {
    'prefer-arrow-functions/prefer-arrow-functions': [
      'warn',
      {
        allowedNames: [],
        allowNamedFunctions: false,
        allowObjectProperties: true,
        classPropertiesAllowed: false,
        disallowPrototype: false,
        returnStyle: 'unchanged',
        singleReturnOnly: false,
      },
    ],
  },
})

/**
 * Configures TypeScript ESLint rules.
 * This config is very strict, some repositories might need overrides.
 *
 * It relies on TSC type-checking, which might slow down linting for large codebases.
 * Read more: https://typescript-eslint.io/getting-started/typed-linting/
 * */
export const getTslint = (): ConfigWithExtends => ({
  extends: [configs.strictTypeChecked, configs.stylisticTypeChecked],
  files: ['**/*.{ts,tsx}'],
  processor: {
    preprocess: (text) => [text],
    postprocess: (messagesList) =>
      messagesList.flat().map((message) => {
        if (message.ruleId === '@typescript-eslint/naming-convention') {
          return {
            ...message,
            message:
              'Variable name `e` is not allowed. Use a more descriptive name like `error` or `event`.',
          }
        }
        return message
      }),
    supportsAutofix: true,
  } satisfies Processor.ProcessorModule,
  rules: {
    '@typescript-eslint/consistent-type-imports': [
      'warn',
      {
        prefer: 'type-imports',
        fixStyle: 'inline-type-imports',
        disallowTypeAnnotations: false,
      },
    ],
    '@typescript-eslint/no-misused-promises': [
      'error',
      {
        checksVoidReturn: {
          attributes: false,
        },
      },
    ],
    '@typescript-eslint/no-empty-object-type': [
      'error',
      // `interface SpecificVariantProps extends VariantProps {}` is fine
      { allowInterfaces: 'with-single-extends' },
    ],
    // make sure to `await` inside try…catch
    '@typescript-eslint/return-await': ['error', 'in-try-catch'],
    '@typescript-eslint/no-confusing-void-expression': [
      'error',
      { ignoreArrowShorthand: true },
    ],
    '@typescript-eslint/array-type': [
      'warn',
      { default: 'array-simple', readonly: 'array-simple' },
    ],
    // allow unused vars prefixed with `_`
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/restrict-template-expressions': [
      'error',
      // numbers and booleans are fine in template strings
      { allowNumber: true, allowBoolean: true },
    ],
    '@typescript-eslint/no-restricted-imports': [
      'error',
      {
        name: 'react',
        importNames: ['default'],
        message:
          "Import specific types directly: import { ReactNode } from 'react'",
      },
    ],
    '@typescript-eslint/naming-convention': [
      'error',
      {
        selector: 'variable',
        format: null,
        custom: {
          regex: '^e$',
          match: false,
        },
      },
      {
        selector: 'parameter',
        format: null,
        custom: {
          regex: '^e$',
          match: false,
        },
      },
    ],
  },
})

/**
 * Detects maintainability, correctness, and security code smells beyond the
 * TypeScript compiler and the core ESLint recommendations.
 */
export const getSonarRules = (): ConfigWithExtends => ({
  ...sonarRecommended,
  files: ['**/*.{js,jsx,ts,tsx}'],
  rules: {
    ...sonarRecommended.rules,
    'sonarjs/cognitive-complexity': ['error', 20],
  },
})

/**
 * Configures strict, type-aware React rules and scoped compatibility overrides.
 * */
export const getReactPlugins = (): ConfigWithExtends[] => [
  {
    ...(reactPlugin.configs['strict-type-checked'] as ConfigWithExtends),
    files: ['**/*.{ts,tsx}'],
  },
]

/**
 * Disables default export rule for tools that need to use it.
 * */
export const getIgnoreDefaultExportRule = (): ConfigWithExtends => ({
  files: [
    '{app,pages}/**/*.ts?(x)', // app or pages directories for Next codebases
    '**/playwright.config.ts',
    '**/tailwind.config.ts',
    '**/vite.config.ts',
    '**/*.stories.ts?(x)',
    '**/.storybook/**/*.ts?(x)',
    '**/.prettierrc.{ts,js}',
    '**/eslint.config.{ts,js}',
    '**/{jest,vitest}.config.{ts,js,cjs,mjs}',
  ],
  rules: {
    'import-x/no-default-export': 'off',
  },
})

/**
 * Allows test fixtures to use representative secrets and repeated schema cases.
 * Type-safety rules remain enabled unless a package scopes an exception further.
 * */
export const getTestRules = (): ConfigWithExtends => ({
  files: [
    '**/*.{test,spec}.{js,jsx,ts,tsx}',
    '**/{test,tests,__tests__}/**/*.{js,jsx,ts,tsx}',
  ],
  rules: {
    // Placeholder credentials and repetitive fixture-validation tests are intentional.
    'sonarjs/no-hardcoded-passwords': 'off',
    'sonarjs/parameterized-tests': 'off',
  },
})

/**
 * Transforms ALL rules severities to 'warn'
 * */
export const getTransformAllRulesToWarn = (): ConfigWithExtends => ({
  rules: {},
  languageOptions: {},
  processor: {
    preprocess: (text) => [text],
    postprocess: (messages) =>
      messages.flat().map((message) => ({
        ...message,
        severity: 1, // 1 is 'warn', 2 is 'error'
      })),
    supportsAutofix: true,
  } satisfies Processor.ProcessorModule,
})

/**
 * Forces correct prettier formatting with auto-fix support
 * */
export const getPrettierPlugin = (): ConfigWithExtends[] => [
  eslintPluginPrettierRecommended,
]

export const getEslintReactConfig = ({
  tsconfigRootDir,
  tsConfigsDirs = [],
  changeEveryRuleToWarning,
}: EslintConfigParams) => {
  return defineTypedConfig(
    getIgnoredDirs(),
    getLinterOptions(),
    ...getEslintRules(),
    ...getImportRules(tsConfigsDirs),
    getNodeGlobals(),
    {
      ...getTslint(),
      languageOptions: {
        ecmaVersion: 2020,
        globals: globals.browser,
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
    },
    getPreferArrowFunctions(),
    getSonarRules(),
    ...getReactPlugins(),
    ...getPrettierPlugin(),
    getIgnoreDefaultExportRule(),
    getTestRules(),
    changeEveryRuleToWarning ? getTransformAllRulesToWarn() : {},
  )
}

export const getEslintNodeConfig = ({
  tsconfigRootDir,
  tsConfigsDirs = [],
  changeEveryRuleToWarning,
}: EslintConfigParams) => {
  return defineTypedConfig(
    getIgnoredDirs(),
    getLinterOptions(),
    ...getEslintRules(),
    ...getImportRules(tsConfigsDirs),
    getNodeGlobals(),
    {
      ...getTslint(),
      languageOptions: {
        ecmaVersion: 2020,
        globals: globals.node,
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
    },
    getPreferArrowFunctions(),
    getSonarRules(),
    ...getPrettierPlugin(),
    getIgnoreDefaultExportRule(),
    getTestRules(),
    changeEveryRuleToWarning ? getTransformAllRulesToWarn() : {},
  )
}
