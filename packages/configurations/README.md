<!--

This source file is part of the Grove open-source project

SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)

SPDX-License-Identifier: MIT

-->

# Grove Configurations

[![Build and Test](https://github.com/SchmiedmayerLab/grove-ts/actions/workflows/build-and-test.yml/badge.svg)](https://github.com/SchmiedmayerLab/grove-ts/actions/workflows/build-and-test.yml)
[![Deployment](https://github.com/SchmiedmayerLab/grove-ts/actions/workflows/deployment.yml/badge.svg)](https://github.com/SchmiedmayerLab/grove-ts/actions/workflows/deployment.yml)

## Getting Started

Shared linting, formatting and TypeScript configurations for TypeScript projects.

The configurations are opinionated and strict, to catch mistakes and harmful practices early.
Some rules are meant to be broken once in a while, with a comment that explains why.

We recommend [oxlint](https://oxc.rs/docs/guide/usage/linter) and [oxfmt](https://oxc.rs/docs/guide/usage/formatter), which are many times faster than ESLint and Prettier.
In our projects, oxlint takes 70 to 97 percent less time than ESLint did, and the few type-aware rules that stay in ESLint add a few seconds.
The [ESLint and Prettier configurations](#eslint-and-prettier) remain for existing projects and for environments that cannot run oxlint.

## Setup

Install the tools and the plugins:

```bash
npm install --save-dev oxlint oxlint-tsgolint oxfmt eslint @schmiedmayerlab/grove-configurations eslint-plugin-sonarjs@4.2.2 typescript-eslint eslint-plugin-import-x
```

React projects also install `@eslint-react/eslint-plugin`.
The plugins are optional peer dependencies, because they need TypeScript 6, see [TypeScript 7](#typescript-7).
Projects that skip them use the [core configurations](#core-configurations).

### oxlint

Create an `oxlint.config.ts` file:

```typescript
import { oxlintReactConfig } from "@schmiedmayerlab/grove-configurations/oxlint";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [oxlintReactConfig],
});
```

For a Node project, use `oxlintNodeConfig` instead.

oxlint also lints the script blocks of Astro, Vue and Svelte components with the TypeScript rules.
It does not lint their templates, and oxfmt does not format them.

oxlint and oxfmt skip the files that `.gitignore` ignores, such as build output.
Add `ignorePatterns` to your own configuration only for committed files that should not be linted, such as generated code.
A pattern without a slash matches at any depth, so `lib` also skips `src/lib`; anchor root folders as `/lib`.

### Core Configurations

`oxlintNodeCoreConfig` and `oxlintReactCoreConfig` from `/oxlint-core` leave out the sonarjs and @eslint-react rules.
They need none of the optional plugins and work with TypeScript 7 installed as `typescript`:

```bash
npm install --save-dev oxlint oxlint-tsgolint oxfmt @schmiedmayerlab/grove-configurations
```

```typescript
import { oxlintReactCoreConfig } from "@schmiedmayerlab/grove-configurations/oxlint-core";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [oxlintReactCoreConfig],
});
```

They keep the ESLint core, import and TypeScript rules, including the type-aware ones, and skip the type-aware ESLint configuration below.
`createOxlintConfig` takes `sonarjs` and `eslintReact` options to choose the plugins one by one.
The full configurations of `/oxlint` load their plugins when oxlint reads them, and fail with an explanation when one is not installed.

### ESLint for Type-aware Plugin Rules

A few sonarjs and @eslint-react rules need type information that oxlint cannot pass to ESLint plugins yet, so they run in ESLint.
Create an `eslint.config.mjs` file:

```javascript
import { getEslintTypeAwareReactConfig } from "@schmiedmayerlab/grove-configurations/eslint-type-aware";

export default getEslintTypeAwareReactConfig({
  tsconfigRootDir: import.meta.dirname,
});
```

For a Node project, use `getEslintTypeAwareNodeConfig` instead.
Run both linters, for example:

```json
{
  "lint": "oxlint && eslint .",
  "lint:ci": "oxlint --deny-warnings && eslint --max-warnings 0 ."
}
```

### oxfmt

Create an `oxfmt.config.ts` file:

```typescript
import { oxfmtConfig } from "@schmiedmayerlab/grove-configurations/oxfmt";
import { defineConfig } from "oxfmt";

export default defineConfig(oxfmtConfig);
```

It keeps oxfmt's default formatting with Prettier's 80 columns, and adds import and Tailwind class sorting.
oxfmt also sorts the keys of every `package.json` into one fixed order, together with the dependency lists and `keywords`.
It leaves the order inside `exports`, `scripts` and other nested fields as written, so conditions such as `types` before `default` stay in place.

### Global Types

The package ships global types that make built-in types stricter, currently [ts-reset](https://github.com/total-typescript/ts-reset).
For example, `JSON.parse` returns `unknown` instead of `any`, and `.filter(Boolean)` removes `null` and `undefined` from the array type.
Add a `global-types.d.ts` file inside the `include` globs of your `tsconfig.json`, for example `src/global-types.d.ts`:

```typescript
// Do not add any other lines of code to this file!
import "@schmiedmayerlab/grove-configurations/global-types";
```

The import turns the file into a module, so any other declaration in it would stop being global.
Adopting them can surface new type errors, for example where code relies on `JSON.parse` returning `any`.

### TypeScript

The package ships `tsconfig.json` presets with strict compiler checks, the runtime target and the module system.
Extend the preset that matches your project:

| Preset          | For                                                      | Adds to `strict`                                                                                         |
| --------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `node-app`      | Node.js 24 applications                                  | ES2025 target and the Node.js 24 library, `module: nodenext`, `types: ["node"]`                          |
| `node-library`  | Node.js libraries compiled with `tsc`                    | Everything in `node-app`, plus declarations, declaration maps and source maps                            |
| `react-app`     | React applications built by a bundler, such as Vite      | ES2023 target with the DOM, `module: preserve`, `jsx: react-jsx`, `noEmit`, `allowImportingTsExtensions` |
| `react-library` | React libraries built by a bundler                       | ES2023 target with the DOM, `module: preserve`, `jsx: react-jsx`, declarations and declaration maps      |
| `strict`        | Frameworks with their own base configuration, like Astro | Only the compiler checks below                                                                           |

Each preset is exported as `@schmiedmayerlab/grove-configurations/tsconfig/<preset>`, without the `.json` extension.
For example, a Node.js library:

```json
{
  "extends": "@schmiedmayerlab/grove-configurations/tsconfig/node-library",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

`strict` sets these checks, and every other preset extends it:

- `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedSideEffectImports`, and `false` for `allowUnreachableCode` and `allowUnusedLabels`.
- `verbatimModuleSyntax` and `isolatedModules`, so imports that are only types need the `type` keyword, which oxlint and ESLint add with `--fix`.
  TypeScript then keeps every import that is not marked as a type, so `import { type A } from "a"` stays in the output as `import {} from "a"` and loads the module.
  Write `import type { A } from "a"` instead, which the Grove oxlint and ESLint configurations enforce and fix.
  A side-effect import, such as `import "./styles.css"`, stays as written.
- `erasableSyntaxOnly`, so enums, namespaces and parameter properties are errors, and tools that only strip types, such as Node.js, can run the code.
- `moduleDetection: force`, so every file is a module.

To add the checks to a framework base, list `strict` after it, since later entries win:

```json
{
  "extends": [
    "astro/tsconfigs/strict",
    "@schmiedmayerlab/grove-configurations/tsconfig/strict"
  ]
}
```

The presets leave the project layout to you.
Set `include`, `exclude`, `rootDir`, `outDir`, `paths`, `incremental`, `composite` and `tsBuildInfoFile` in your own `tsconfig.json`, because paths in an extended file resolve relative to that file inside `node_modules`.
Add your `global-types.d.ts` file to your `include` as well.

The presets do not set `moduleResolution`, which follows from `module`, so you can override `module`.
Under `nodenext`, relative imports need the `.js` extension, and `verbatimModuleSyntax` needs `"type": "module"` in `package.json`.
A Node.js project that a bundler or `tsx` runs can use `"module": "preserve"` instead.

Override any other option in your `compilerOptions`.
Arrays replace the preset value instead of extending it, so repeat `node` when you add test globals, for example `"types": ["node", "vitest/globals"]`.
A Vite application adds `"types": ["vite/client"]`.
A project whose public API exports enums can set `"erasableSyntaxOnly": false` until it replaces them.
To emit JavaScript from a `react-app` project, set `"noEmit": false` and `"allowImportingTsExtensions": false`.

Next.js skips its own `tsconfig.json` setup when the file has `extends`, so keep its `plugins`, `paths`, `incremental` and `.next` `include` entries yourself.

The Node.js presets need TypeScript 6.0 or newer for the ES2025 target.
The React and `strict` presets also work with TypeScript 5.9.
All presets work with TypeScript 7 and with TypeScript 6, which [typescript-eslint](#typescript-7) still needs.

## Customization

Add project-specific settings after `extends`: `rules` for the whole project and `overrides` for some files.
oxlint rule names drop the ESLint plugin prefixes: `@typescript-eslint/` becomes `typescript/` and `import-x/` becomes `import/`.

```typescript
export default defineConfig({
  extends: [oxlintNodeConfig],
  ignorePatterns: ["src/generated/**"],
  rules: { "typescript/only-throw-error": "off" },
  overrides: [
    {
      files: ["test/**/*.ts"],
      rules: { "typescript/no-non-null-assertion": "off" },
    },
  ],
});
```

oxlint ignores `/* global */` comments, so declare extra globals with `globals` in your configuration.

Disable comments work with the ESLint rule names in both linters, for example `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- reason`.
Unused disable comments are errors.
oxlint also reads the comments for the type-aware rules that run in ESLint and reports them as unused, so turn those rules off in `eslint.config.mjs` instead.

Files outside the TypeScript program, for example tests excluded from `tsconfig.json`, have no type information.
Turn off the type-aware rules for them with `oxlintDisableTypeAwareRules`:

```typescript
overrides: [
  { files: ["src/**/*.test.ts"], rules: oxlintDisableTypeAwareRules },
];
```

To change which files get which rules, for example files that may have a default export, build the configuration with `createOxlintConfig` and its `files` option.
In a monorepo with one configuration, `files.react` can limit the React rules to one app.
Rules whose globs you change move into overrides, so change them in your own `overrides` rather than in `rules`:

```typescript
createOxlintConfig({
  react: true,
  files: {
    defaultExports: [
      ...defaultOxlintFiles.defaultExports,
      "**/routes/**/*.tsx",
    ],
  },
});
```

## TypeScript 7

oxlint's type-aware rules already run on TypeScript 7, so they read your `tsconfig.json` with TypeScript 7.
Options that TypeScript 7 removed, such as `baseUrl`, stop all type-aware rules, even when the project still compiles with TypeScript 6.
typescript-eslint, sonarjs and @eslint-react need the compiler API that TypeScript 7 does not ship yet.
The `/eslint` and `/eslint-type-aware` entry points and the full configurations of `/oxlint` load them, while `/oxlint-core`, `/prettier` and `/oxfmt` do not.
With the [core configurations](#core-configurations), install TypeScript 7 as `typescript`.
Otherwise, install TypeScript 6 under the `typescript` name for these plugins and TypeScript 7 under another name:

```json
{
  "devDependencies": {
    "typescript": "npm:@typescript/typescript6@^6.0.2",
    "typescript7": "npm:typescript@^7.0.2"
  }
}
```

With pnpm, `tsc` then runs TypeScript 7.
With npm, `@typescript/typescript6` also installs a TypeScript 6 `tsc` command, so run TypeScript 7 explicitly, for example `node node_modules/typescript7/bin/tsc`.

## ESLint and Prettier

Use these configurations only when a project cannot run oxlint.
They lint and format through ESLint, with Prettier as an ESLint rule.

```bash
npm install --save-dev prettier eslint eslint-import-resolver-typescript @schmiedmayerlab/grove-configurations typescript-eslint eslint-plugin-import-x eslint-plugin-sonarjs@4.2.2 @eslint-react/eslint-plugin
```

Create an `eslint.config.mjs` file:

```javascript
import { getEslintReactConfig } from "@schmiedmayerlab/grove-configurations/eslint";

export default getEslintReactConfig({ tsconfigRootDir: import.meta.dirname });
```

For a Node project, use `getEslintNodeConfig` instead.
Create a `.prettierrc.mjs` file:

```javascript
import { prettierConfig } from "@schmiedmayerlab/grove-configurations/prettier";

export default prettierConfig;
```

The `/prettier` entry point loads only the Prettier configuration, so it also suits projects that format some files with Prettier next to oxfmt, such as Astro components.

`eslint . --fix` then lints and formats the code.
Add project-specific settings after the configuration:

```javascript
export default [
  ...getEslintNodeConfig({ tsconfigRootDir: import.meta.dirname }),
  { ignores: ["lib/**/*"] },
  { rules: { "@typescript-eslint/no-non-null-assertion": "off" } },
];
```

The building blocks `getEslintRules`, `getNodeGlobals`, `getTslint`, `getPreferArrowFunctions`, `getReactPlugins` and `getPrettierPlugin` are exported from `/eslint` for configurations that need to be assembled by hand.

## License

This project is licensed under the MIT License. See [Licenses](https://github.com/SchmiedmayerLab/grove-ts/tree/main/LICENSES) for more information.

## Contributors

This project is developed as part of the Schmiedmayer Lab at Stanford University.
See the repository's [CONTRIBUTORS.md](../../CONTRIBUTORS.md).
