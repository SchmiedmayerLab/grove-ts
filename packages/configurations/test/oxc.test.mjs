//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import process from 'node:process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  getEslintTypeAwareNodeConfig,
  getEslintTypeAwareReactConfig,
} from '@schmiedmayerlab/grove-configurations/eslint-type-aware'
import { oxfmtConfig } from '@schmiedmayerlab/grove-configurations/oxfmt'
import {
  createOxlintConfig,
  oxlintDisableTypeAwareRules,
  oxlintNodeConfig,
  oxlintReactConfig,
} from '@schmiedmayerlab/grove-configurations/oxlint'
import { ESLint } from 'eslint'
import { format } from 'oxfmt'
import { configs as typescriptEslintConfigs } from 'typescript-eslint'
import { sonarRulesCoveredElsewhere } from '../src/sonarjsRules.ts'

const require = createRequire(import.meta.url)
const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'project',
)
const oxlintBin = join(
  dirname(require.resolve('oxlint/package.json')),
  'bin',
  'oxlint',
)

const lintWithOxlint = () => {
  const result = spawnSync(
    process.execPath,
    [oxlintBin, '--config', 'oxlint.config.mjs', '--format', 'json', 'src'],
    { cwd: fixtureDir, encoding: 'utf8' },
  )
  assert.ok(result.stdout, result.stderr)
  const { diagnostics } = JSON.parse(result.stdout)
  return diagnostics.map(({ code, filename, message }) => ({
    code,
    file: filename,
    message,
  }))
}

/**
 * The rules that apply to a TypeScript file: the top-level rules and the overrides for TypeScript globs.
 */
const rulesForTypeScriptFiles = (config) =>
  Object.assign(
    {},
    config.rules,
    ...(config.overrides ?? [])
      .filter((override) => override.files.includes('**/*.{ts,tsx,mts,cts}'))
      .map((override) => override.rules ?? {}),
  )

const codesIn = (diagnostics, file) =>
  new Set(
    diagnostics
      .filter((entry) => entry.file === file)
      .map((entry) => entry.code),
  )

test('exposes the oxlint configurations', () => {
  for (const config of [oxlintNodeConfig, oxlintReactConfig]) {
    assert.equal(config.options?.typeAware, true)
    assert.equal(config.options?.reportUnusedDisableDirectives, 'error')
    assert.equal(config.categories?.correctness, 'error')
    assert.ok(Object.keys(config.rules ?? {}).length > 10)
    assert.ok(config.jsPlugins?.length)
  }
  assert.ok(
    oxlintReactConfig.jsPlugins.some(
      (plugin) => plugin.name === '@eslint-react',
    ),
  )
  assert.ok(
    !oxlintNodeConfig.jsPlugins.some(
      (plugin) => plugin.name === '@eslint-react',
    ),
  )

  const custom = createOxlintConfig({
    files: { defaultExports: ['**/*.mts'] },
  })
  const defaultExportOverride = custom.overrides?.find(
    (override) => override.rules?.['import/no-default-export'] === 'off',
  )
  assert.deepEqual(defaultExportOverride?.files, ['**/*.mts'])
})

test('keeps the rules at the top level, so that projects can change them', () => {
  for (const config of [oxlintNodeConfig, oxlintReactConfig]) {
    assert.equal(config.rules?.['typescript/no-floating-promises'], 'error')
    assert.ok(config.rules?.['sonarjs/no-nested-conditional'])
    // Overrides only turn rules off.
    for (const override of config.overrides ?? []) {
      for (const entry of Object.values(override.rules ?? {})) {
        assert.equal(Array.isArray(entry) ? entry[0] : entry, 'off')
      }
    }
  }
  assert.ok(oxlintReactConfig.rules?.['@eslint-react/no-missing-key'])

  const scoped = createOxlintConfig({
    react: true,
    files: { react: ['apps/web/**/*.tsx'] },
  })
  assert.equal(scoped.rules?.['@eslint-react/no-missing-key'], undefined)
  assert.ok(
    scoped.overrides?.some(
      (override) =>
        override.files[0] === 'apps/web/**/*.tsx' &&
        override.rules?.['@eslint-react/no-missing-key'],
    ),
  )
})

test('lists every enabled type-aware TypeScript rule', () => {
  const rules = JSON.parse(
    spawnSync(process.execPath, [oxlintBin, '--rules', '--format', 'json'], {
      encoding: 'utf8',
    }).stdout,
  )
  const level = (entry) => (Array.isArray(entry) ? entry[0] : entry)
  const tsRules = rulesForTypeScriptFiles(oxlintNodeConfig)
  const categories = oxlintNodeConfig.categories ?? {}
  // A rule is on for TypeScript files when the TypeScript override enables it,
  // or when its category is on and the override does not turn it off.
  const enabled = rules
    .filter((rule) => rule.type_aware)
    .filter((rule) => {
      const name = `${rule.scope}/${rule.value}`
      return name in tsRules ?
          level(tsRules[name]) !== 'off'
        : (categories[rule.category] ?? 'off') !== 'off'
    })
    .map((rule) => `${rule.scope}/${rule.value}`)
  assert.deepEqual(
    Object.keys(oxlintDisableTypeAwareRules).sort(),
    enabled.sort(),
  )
})

test('keeps every enabled rule of the typescript-eslint presets', () => {
  const level = (entry) => (Array.isArray(entry) ? entry[0] : entry)
  const tsRules = rulesForTypeScriptFiles(oxlintNodeConfig)
  const presetRules = Object.assign(
    {},
    ...[
      ...typescriptEslintConfigs.strictTypeChecked,
      ...typescriptEslintConfigs.stylisticTypeChecked,
    ].map((config) => config.rules ?? {}),
  )
  const missing = Object.entries(presetRules)
    .filter(([, entry]) => level(entry) !== 'off')
    .map(([name]) => name.replace('@typescript-eslint/', ''))
    .filter(
      (name) =>
        level(tsRules[`typescript/${name}`] ?? tsRules[name] ?? 'off') ===
        'off',
    )
  assert.deepEqual(missing, [])
})

test('leaves out the sonarjs rules that other rules cover', () => {
  const rules = JSON.parse(
    spawnSync(process.execPath, [oxlintBin, '--rules', '--format', 'json'], {
      encoding: 'utf8',
    }).stdout,
  )
  const correctness = new Set(
    rules
      .filter((rule) => rule.category === 'correctness')
      .map((rule) =>
        rule.scope === 'eslint' ? rule.value : `${rule.scope}/${rule.value}`,
      ),
  )
  const level = (entry) => (Array.isArray(entry) ? entry[0] : entry)
  const oxlintRules = rulesForTypeScriptFiles(oxlintReactConfig)
  const eslintRules = Object.assign(
    {},
    ...getEslintTypeAwareReactConfig({ tsconfigRootDir: fixtureDir }).map(
      (config) => config.rules ?? {},
    ),
  )
  for (const [sonarRule, coveringRule] of Object.entries(
    sonarRulesCoveredElsewhere,
  )) {
    assert.equal(eslintRules[sonarRule], undefined, sonarRule)
    const covered =
      coveringRule in oxlintRules ?
        level(oxlintRules[coveringRule]) !== 'off'
      : correctness.has(coveringRule) ||
        level(eslintRules[coveringRule] ?? 'off') !== 'off'
    assert.ok(covered, `${coveringRule} does not cover ${sonarRule}`)
  }
})

test('reports the expected rules through oxlint', () => {
  const diagnostics = lintWithOxlint()

  const functions = codesIn(diagnostics, 'src/functions.ts')
  assert.ok(functions.has('prefer-arrow-functions(prefer-arrow-functions)'))
  assert.ok(functions.has('typescript(no-floating-promises)'))
  assert.ok(functions.has('eslint(id-denylist)'))
  // sonarjs marks it as type-aware, but it works without type information.
  assert.ok(functions.has('sonarjs(slow-regex)'))
  // Rules that need type information inside JS plugins run in ESLint instead.
  assert.ok(!functions.has('sonarjs(no-alphabetical-sort)'))
  assert.ok(functions.has('typescript(require-array-sort-compare)'))

  const imports = codesIn(diagnostics, 'src/imports.ts')
  assert.ok(imports.has('import(extensions)'))
  assert.ok(imports.has('import(no-default-export)'))

  const component = codesIn(diagnostics, 'src/component.tsx')
  assert.ok(component.has('@eslint-react(web-api-no-leaked-interval)'))

  // A suppressed finding with a typescript-eslint rule name must neither report nor count as unused.
  assert.deepEqual(codesIn(diagnostics, 'src/directives.ts'), new Set())
  assert.deepEqual(codesIn(diagnostics, 'src/directives.mjs'), new Set())
  assert.ok(!codesIn(diagnostics, 'src/script.mjs').has('import(extensions)'))

  // Astro components get the rules without `files`, and `Astro` is not reported as undefined.
  const astro = codesIn(diagnostics, 'src/Page.astro')
  assert.ok(astro.has('prefer-arrow-functions(prefer-arrow-functions)'))
  assert.ok(!astro.has('eslint(no-undef)'))
  // The configuration reports unused directives without a CLI flag.
  assert.ok(
    diagnostics.some(
      (entry) =>
        entry.file === 'src/unusedDirective.ts' &&
        entry.message.includes('Unused eslint-disable directive'),
    ),
  )
})

test('lets tool configuration files use default exports and Node globals', () => {
  const result = spawnSync(
    process.execPath,
    [
      oxlintBin,
      '--config',
      'oxlint.config.mjs',
      '--format',
      'json',
      'stylelint.config.mjs',
    ],
    { cwd: fixtureDir, encoding: 'utf8' },
  )
  const { diagnostics } = JSON.parse(result.stdout)
  assert.deepEqual(
    diagnostics.map(({ code }) => code),
    [],
  )
})

test('runs sonarjs rules that depend on imports in every file', () => {
  // oxlint shares `context.sourceCode` between files, which breaks sonarjs' import cache
  // unless the plugin wrapper resets it for each file.
  const diagnostics = lintWithOxlint()
  for (const file of ['src/first.test.ts', 'src/second.test.ts']) {
    assert.ok(
      codesIn(diagnostics, file).has('sonarjs(no-trivial-assertions)'),
      `sonarjs(no-trivial-assertions) is missing in ${file}`,
    )
  }
})

test('loads the type-aware ESLint entry point without Prettier or the import resolver', () => {
  // Fails the import of any module that only the full ESLint configurations need.
  const script = `
    import { registerHooks } from "node:module";
    registerHooks({
      resolve(specifier, context, nextResolve) {
        if (/prettier|eslint-import-resolver-typescript/.test(specifier)) {
          throw new Error("loaded " + specifier);
        }
        return nextResolve(specifier, context);
      },
    });
    await import("@schmiedmayerlab/grove-configurations/eslint-type-aware");
  `
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', script],
    { cwd: fixtureDir, encoding: 'utf8' },
  )
  assert.equal(result.status, 0, result.stderr)
})

test('skips the code blocks of ESLint processors', async () => {
  const eslint = new ESLint({
    cwd: fixtureDir,
    overrideConfigFile: true,
    overrideConfig: getEslintTypeAwareReactConfig({
      tsconfigRootDir: fixtureDir,
    }),
  })
  const codeBlock = await eslint.calculateConfigForFile('src/Page.astro/1_1.ts')
  const real = await eslint.calculateConfigForFile('src/functions.ts')
  assert.ok(real?.rules?.['sonarjs/no-ignored-return'])
  assert.equal(codeBlock?.rules?.['sonarjs/no-ignored-return'], undefined)
  assert.equal(
    codeBlock?.languageOptions?.parserOptions?.projectService,
    undefined,
  )
})

test('reports the type-aware JS plugin rules through ESLint', async () => {
  const eslint = new ESLint({
    cwd: fixtureDir,
    overrideConfigFile: true,
    overrideConfig: getEslintTypeAwareReactConfig({
      tsconfigRootDir: fixtureDir,
    }),
  })
  const results = await eslint.lintFiles(['src'])
  const messages = results.flatMap((result) =>
    result.messages.map((message) => ({
      ...message,
      file: result.filePath.slice(fixtureDir.length + 1),
    })),
  )

  assert.deepEqual(
    messages.filter((message) => message.fatal || message.ruleId === null),
    [],
  )
  // Disable directives for plugin rules must stay valid in JavaScript files.
  assert.deepEqual(
    messages.filter((message) => message.file === 'src/directives.mjs'),
    [],
  )
  const rulesIn = (file) =>
    new Set(
      messages
        .filter((message) => message.file === file)
        .map(({ ruleId }) => ruleId),
    )
  assert.ok(rulesIn('src/functions.ts').has('sonarjs/no-ignored-return'))
  // oxlint covers it with typescript/require-array-sort-compare.
  assert.ok(!rulesIn('src/functions.ts').has('sonarjs/no-alphabetical-sort'))
  assert.ok(!rulesIn('src/functions.ts').has('sonarjs/slow-regex'))
  assert.ok(
    rulesIn('src/component.tsx').has(
      '@eslint-react/no-leaked-conditional-rendering',
    ),
  )
  // Rules without type requirements run in oxlint only.
  assert.ok(!rulesIn('src/first.test.ts').has('sonarjs/no-trivial-assertions'))

  const nodeConfig = getEslintTypeAwareNodeConfig({
    tsconfigRootDir: fixtureDir,
  })
  assert.ok(
    !nodeConfig.some((config) =>
      Object.keys(config.rules ?? {}).some((rule) =>
        rule.startsWith('@eslint-react/'),
      ),
    ),
  )
})

test('formats with the oxfmt configuration', async () => {
  const source = [
    "import { b } from './b'",
    "import { join } from 'node:path'",
    "import { a } from 'library'",
    '',
    'export const element = <div className="p-4 flex">{join(a, b)}</div>',
    '',
  ].join('\n')
  const { code, errors } = await format('example.tsx', source, oxfmtConfig)

  assert.deepEqual(errors, [])
  assert.equal(
    code,
    [
      'import { join } from "node:path";',
      'import { a } from "library";',
      'import { b } from "./b";',
      '',
      'export const element = <div className="flex p-4">{join(a, b)}</div>;',
      '',
    ].join('\n'),
  )
})
