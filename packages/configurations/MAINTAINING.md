<!--

This source file is part of the Grove open-source project

SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)

SPDX-License-Identifier: MIT

-->

# Maintaining Grove Configurations

Notes for people who change this package.
Users only need the [README](README.md).

## Structure

| File                         | Purpose                                                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `src/eslint/index.ts`        | Full ESLint configurations, which need Prettier and the TypeScript import resolver                                |
| `src/eslint/typeAware.ts`    | Type-aware ESLint configurations for the oxc setup, published as `./eslint-type-aware` without those dependencies |
| `src/eslint/shared.ts`       | Helpers both ESLint entry points use                                                                              |
| `src/prettier.ts`            | Prettier configuration                                                                                            |
| `src/oxlint/index.ts`        | `createOxlintConfig` and the oxlint exports                                                                       |
| `src/oxlint/rules.ts`        | Native oxlint rules on top of the correctness category                                                            |
| `src/oxlint/sonarjs.ts`      | sonarjs prepared for oxlint's JS plugin runtime                                                                   |
| `src/sonarjsRules.ts`        | Splits the sonarjs rules between oxlint and ESLint                                                                |
| `src/typeAwareRules.ts`      | @eslint-react rules that run in ESLint                                                                            |
| `src/oxfmt.ts`               | oxfmt configuration                                                                                               |
| `global-types.d.ts`          | Global types entry, published as `./global-types`                                                                 |
| `tsdown.config.ts`           | Build of the entry points                                                                                         |
| `test/compatibility.test.ts` | Pins the ESLint and Prettier configurations                                                                       |
| `test/oxc.test.ts`           | Checks the oxlint and oxfmt configurations                                                                        |

## oxlint and ESLint

oxlint is the primary linter, and its configurations take priority.
The ESLint configurations stay for environments that cannot use oxlint:

- Files that need a custom ESLint parser, such as Astro, Vue or Svelte components.
  oxlint lints only their script parts and cannot run plugins like `eslint-plugin-astro`.
- Projects that depend on ESLint plugins oxlint cannot load as JS plugins, for example plugins that bring their own parser or language, like JSON, Markdown or CSS linting.
- Tools built around ESLint, for example CI workflows that annotate pull requests from ESLint's JSON report.

The two setups enforce mostly the same rules, but exact parity is not a goal.

oxlint runs the ESLint core, import and typescript-eslint rules natively, and the type-aware typescript-eslint rules through `oxlint-tsgolint`.
The configuration enables oxlint's `correctness` category as errors and lists only the other rules, plus correctness rules with their own options.
Extended configurations add to oxlint's default plugins instead of replacing them, so the correctness rules of `unicorn` and `oxc` are on as well.
The correctness category also enables some TypeScript rules for every file, so an override turns all `typescript/` rules off for JavaScript files, as typescript-eslint only applied to TypeScript.
The TypeScript rules come from typescript-eslint's strict-type-checked and stylistic-type-checked presets at runtime, renamed to oxlint's rule names, followed by Grove's adjustments.
oxlint rejects unknown rules even when they are off, so the preset rules are filtered by the rule list in oxlint's `configuration_schema.json`.
A test checks that this filter drops no enabled rule.
The rules therefore follow the typescript-eslint version that a project installs, and the dependency range starts at the version the tests ran with.
sonarjs, @eslint-react, prefer-arrow-functions and, in the design system, jsdoc run as JS plugins.

oxlint passes no type information to JS plugins yet ([oxc-project/oxc#19596](https://github.com/oxc-project/oxc/issues/19596)).
The plugin rules that need it run in ESLint through `getEslintTypeAwareNodeConfig` and `getEslintTypeAwareReactConfig`, which contain only those rules:

- sonarjs rules with `requiresTypeChecking`, except two groups in `src/sonarjsRules.ts`.
  The rules in `rulesWorkingWithoutTypes` report the same findings without type information, so they run in oxlint.
  `assertions-in-tests` stays in ESLint, because without types it misses assertions inside helper functions.
  The rules in `sonarRulesCoveredElsewhere` repeat rules that already run, mostly native oxlint rules, so they are left out; a test checks that each covering rule stays on.
- `@eslint-react/no-leaked-conditional-rendering` and `@eslint-react/no-unused-props`.

They skip the code blocks that ESLint processors extract, such as `Page.astro/1_1.ts`, because those are outside every TypeScript program.
The type-aware ESLint configurations register every plugin for every file without enabling its rules, so disable comments for oxlint rules stay valid in ESLint, in JavaScript files too.

### Differences From the ESLint Setup

- `@typescript-eslint/naming-convention`, which bans the name `e`, is replaced by `id-denylist`, without the custom message.
- `import-x/order` is replaced by the import sorting of oxfmt.
- `import-x/no-unresolved` is left to the TypeScript compiler.
- `no-octal` and `no-dupe-args` are syntax errors in ES modules, so the parser reports them.
- `import/extensions` allows `.js` and `.mjs` specifiers, which `NodeNext` and Node require, and is off for `.mjs` and `.cjs` files, where Node resolves specifiers as written.
- The default export globs match `**/{app,pages}/**`, because globs of an extended configuration are not relative to the consumer, and every tool configuration file (`*.config.*`, `.*rc.*`, `.markdownlint-cli2.*`).
- The rules also cover `.mjs`, `.cjs`, `.mts` and `.cts` files and the script blocks of Astro, Vue and Svelte components, which count as TypeScript.
- Some typescript-eslint rules are nursery rules in oxlint, for example `no-unnecessary-condition` and `prefer-optional-chain`.
- Only oxlint reports unused disable directives.
- `oxfmtConfig` sets `printWidth: 80` and `sortPackageJson: false`, because oxfmt's defaults would wrap at 100 columns and sort `package.json` keys, unlike Prettier.
- oxfmt does not support Prettier's `experimentalTernaries`.

### oxlint Behavior to Keep in Mind

- An extended configuration passes on its `rules`, `categories`, `plugins`, `jsPlugins`, `options` and `overrides`, but not its top-level `env`, `settings` or `ignorePatterns`.
  The globals therefore sit in an override for every file.
  The @eslint-react settings of its strict preset are the plugin's defaults, so the configuration does not need them.
  oxlint applies the overrides of an extended configuration after the project's top-level `rules`, which is why Grove's rules sit at the top level and its overrides only turn rules off or set globals.
- `ignorePatterns` of an extended configuration is not applied, and oxlint already skips what `.gitignore` ignores, so the package ships no ignore list.
  A shared list matched nested folders such as `src/lib` and silently skipped real code.
- `options.reportUnusedDisableDirectives` works through `extends`, although the schema describes it as root-only.
- oxlint validates rule options, so ESLint options that oxlint does not know have to be dropped, for example `errorClassNames` of `preserve-caught-error`.
- `typeAwareTypeScriptRules` in `src/oxlint/rules.ts` lists the enabled type-aware rules for `oxlintDisableTypeAwareRules`.
  A test compares it with the rule metadata of oxlint.

### sonarjs Wrapper

oxlint's JS plugin support is in alpha.
oxlint passes the same `context.sourceCode` object to every file, which breaks the per-file import cache of sonarjs, so import-dependent rules stop reporting after the first file.
`src/oxlint/sonarjs.ts` resets the cache for each file with the internal `clearFileCaches` of sonarjs.
That is why `eslint-plugin-sonarjs` is pinned to an exact version; check the wrapper when you update it.

## Build

tsdown builds the entry points listed in `tsdown.config.ts`; a new entry point needs its line there and in `exports` in `package.json`.
publint and attw in `pack:lint` check that every export points at a built file.

## Global Types

Every Grove package has a `global-types.d.ts` that imports `@schmiedmayerlab/grove-configurations/global-types`, so a change to `global-types.d.ts` of this package reaches all of them.
The import turns that file into a module, so any other declaration in it would stop being global.

## Tests

The tests run with Vitest against the built entry points, so build the package before `pnpm test`.
`test/compatibility.test.ts` compares the resolved ESLint rules with `test/snapshots/eslint-rules.json`, and checks the Prettier output, that the `./prettier` entry point loads nothing from ESLint, and loading with `require()`.
After an intended change to the ESLint configurations, update the snapshot with `pnpm test -u`; oxfmt leaves it as Vitest writes it.
`test/package.test.ts` loads the main ESM entry point as published.

`test/oxc.test.ts` lints the fixture project in `test/fixtures/project` with oxlint and the type-aware ESLint configuration, and formats with oxfmt.
It also checks the rule lists against oxlint's rule metadata and that the `./eslint-type-aware` entry point loads neither Prettier nor the import resolver.
