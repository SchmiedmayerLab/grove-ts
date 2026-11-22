//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//
import { fileURLToPath } from 'node:url'
import reactPlugin from '@eslint-react/eslint-plugin'
import {
  type DummyRuleMap,
  type ExternalPluginEntry,
  type OxlintConfig,
  type OxlintOverride,
} from 'oxlint'
import { getSonarRuleSet } from '../sonarjsRules'
import { typeAwareReactRules } from '../typeAwareRules'
import {
  allFilesRules,
  jsTsRules,
  typeAwareTypeScriptRules,
  typeScriptRules,
  typeScriptRulesOff,
} from './rules'

/**
 * Globs that scope each part of the configuration.
 * Each key passed to `createOxlintConfig` replaces that key's default globs.
 */
/**
 * Configuration files of tools, such as `vite.config.ts`, `eslint.config.mjs`, `.prettierrc.cjs` or `.markdownlint-cli2.mjs`.
 */
const toolConfigurationFiles = [
  '**/*.config.{js,mjs,cjs,ts,mts,cts}',
  '**/.*rc.{js,mjs,cjs,ts,mts,cts}',
  '**/.markdownlint-cli2.{mjs,cjs}',
]

export const defaultOxlintFiles = {
  /** Import, sonarjs and arrow function rules. */
  jsTs: ['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts,astro,vue,svelte}'],
  /**
   * typescript-eslint rules, including the type-aware ones.
   * Astro, Vue and Svelte components count as TypeScript: oxlint lints their script blocks,
   * and the core rules that TypeScript replaces, such as `no-undef` for `Astro`, stay off there.
   */
  ts: ['**/*.{ts,tsx,mts,cts,astro,vue,svelte}'],
  /** @eslint-react rules, when `react` is enabled. */
  react: ['**/*.{jsx,ts,tsx}'],
  /** Configuration files of tools, which run in Node. */
  nodeGlobals: toolConfigurationFiles,
  /** Files that tools require to have a default export. */
  defaultExports: [
    '**/{app,pages}/**/*.{ts,tsx}',
    '**/*.stories.{ts,tsx}',
    '**/.storybook/**/*.{ts,tsx}',
    ...toolConfigurationFiles,
  ],
}

export type OxlintFiles = {
  [Key in keyof typeof defaultOxlintFiles]: string[]
}

export interface OxlintConfigOptions {
  /**
   * Enables the @eslint-react rules and browser globals.
   * Without it, files get Node globals.
   */
  react?: boolean
  /**
   * Replaces the default globs of the given keys.
   * Spread `defaultOxlintFiles` to extend them instead.
   * The rules of a changed `jsTs`, `ts` or `react` key move from the top level into an override with those globs.
   */
  files?: Partial<OxlintFiles>
}

/**
 * Turns off the rules that need type information,
 * like typescript-eslint's `disableTypeChecked` configuration.
 * Use it in an override for files outside the TypeScript program, for example tests excluded from `tsconfig.json`.
 */
export const oxlintDisableTypeAwareRules: DummyRuleMap = Object.fromEntries(
  typeAwareTypeScriptRules.map((rule) => [rule, 'off']),
)

const resolvePath = (specifier: string) =>
  fileURLToPath(import.meta.resolve(specifier))

const sonarjsPlugin: ExternalPluginEntry = {
  name: 'sonarjs',
  specifier: fileURLToPath(new URL('sonarjs.mjs', import.meta.url)),
}

const preferArrowFunctionsPlugin: ExternalPluginEntry = {
  name: 'prefer-arrow-functions',
  specifier: resolvePath('eslint-plugin-prefer-arrow-functions'),
}

const eslintReactPlugin: ExternalPluginEntry = {
  name: '@eslint-react',
  specifier: resolvePath('@eslint-react/eslint-plugin'),
}

const reactStrictConfig = reactPlugin.configs['strict-type-checked']

/**
 * @eslint-react strict rules that work without type information.
 * The type-aware ones run in ESLint, see `getEslintTypeAwareReactConfig`.
 */
const reactRules = Object.fromEntries(
  Object.entries(reactStrictConfig.rules ?? {}).filter(
    ([name]) => !(typeAwareReactRules as readonly string[]).includes(name),
  ),
) as DummyRuleMap

const preferArrowFunctionsRules: DummyRuleMap = {
  'prefer-arrow-functions/prefer-arrow-functions': [
    'error',
    { allowObjectProperties: true },
  ],
}

const javaScriptFiles = ['**/*.{js,jsx,mjs,cjs}']

const level = (entry: DummyRuleMap[string]) =>
  Array.isArray(entry) ? entry[0] : entry

/**
 * ESLint core rules that typescript-eslint turns off for TypeScript files, because TypeScript checks the same things.
 */
const coreRulesOffForTypeScript = Object.fromEntries(
  Object.entries(typeScriptRules).filter(
    ([name, entry]) => !name.includes('/') && level(entry) === 'off',
  ),
) as DummyRuleMap

/**
 * TypeScript rules without the core rules that are off for TypeScript files only.
 */
const typeScriptRulesForAllFiles = Object.fromEntries(
  Object.entries(typeScriptRules).filter(
    ([name]) => !(name in coreRulesOffForTypeScript),
  ),
) as DummyRuleMap

const sameGlobs = (left: string[], right: string[]) =>
  left.length === right.length &&
  left.every((glob, index) => glob === right[index])

/**
 * Builds the oxlint configuration.
 * The rules sit at the top level, so a project's own `rules` can change them;
 * oxlint applies overrides of an extended configuration after the project's top-level rules.
 * Overrides only turn rules off for some files or set globals.
 * Parts whose globs a project changes through `files` move into overrides with those globs.
 */
export const createOxlintConfig = ({
  react = false,
  files: customFiles = {},
}: OxlintConfigOptions = {}): OxlintConfig => {
  const files: OxlintFiles = { ...defaultOxlintFiles, ...customFiles }
  const isDefault = (key: keyof OxlintFiles) =>
    sameGlobs(files[key], defaultOxlintFiles[key])
  const jsTsPart: DummyRuleMap = {
    ...jsTsRules,
    ...(getSonarRuleSet({ typeAware: false }) as DummyRuleMap),
    ...preferArrowFunctionsRules,
  }
  const typeScriptPart: DummyRuleMap = {
    ...typeScriptRulesForAllFiles,
    // Mirrors the `@typescript-eslint/naming-convention` rule that bans `e`.
    'id-denylist': ['error', 'e'],
  }
  const reactPart: DummyRuleMap = react ? reactRules : {}
  const parts = [
    { key: 'jsTs', rules: jsTsPart },
    { key: 'ts', rules: typeScriptPart },
    { key: 'react', rules: reactPart },
  ] as const
  const scopedOverrides: OxlintOverride[] = parts
    .filter(({ key, rules }) => !isDefault(key) && Object.keys(rules).length)
    .map(({ key, rules }) => ({ files: files[key], rules }))
  const topLevelRules = Object.assign(
    {},
    allFilesRules,
    ...parts.filter(({ key }) => isDefault(key)).map(({ rules }) => rules),
  ) as DummyRuleMap
  return {
    plugins: ['eslint', 'typescript', 'import'],
    jsPlugins: [
      sonarjsPlugin,
      preferArrowFunctionsPlugin,
      ...(react ? [eslintReactPlugin] : []),
    ],
    categories: { correctness: 'error' },
    options: { reportUnusedDisableDirectives: 'error', typeAware: true },
    rules: topLevelRules,
    overrides: [
      // oxlint does not inherit the top-level `env` of an extended configuration, only overrides.
      { files: ['**/*'], env: react ? { browser: true } : { node: true } },
      ...scopedOverrides,
      { files: files.ts, rules: coreRulesOffForTypeScript },
      // TypeScript rules, including the type-aware ones, only apply to TypeScript files.
      { files: javaScriptFiles, rules: typeScriptRulesOff },
      // Node resolves the specifiers of .mjs and .cjs files as written, including `.ts` with type stripping.
      { files: ['**/*.{mjs,cjs}'], rules: { 'import/extensions': 'off' } },
      { files: files.nodeGlobals, env: { node: true } },
      {
        files: files.defaultExports,
        rules: {
          'import/no-anonymous-default-export': 'off',
          'import/no-default-export': 'off',
        },
      },
    ],
  }
}

/**
 * oxlint configuration for Node projects.
 */
export const oxlintNodeConfig = createOxlintConfig()

/**
 * oxlint configuration for React projects.
 */
export const oxlintReactConfig = createOxlintConfig({ react: true })
