//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { defineConfig } from "tsdown";

// The `typescript` package is TypeScript 6 for typescript-eslint, so the declaration plugin
// would use it. Point it at the TypeScript 7 compiler, installed as `typescript7`, instead.
const require = createRequire(import.meta.url);
const typeScript7 = dirname(require.resolve("typescript7/package.json"));
const { default: getTypeScript7Path } = (await import(
  pathToFileURL(join(typeScript7, "lib/getExePath.js")).href
)) as { default: () => string };

// The oxlint configurations take their TypeScript rules from typescript-eslint's presets.
// The build writes the preset rules into the package, so that the oxlint entry points
// do not load typescript-eslint, which needs TypeScript 6 installed as `typescript`.
const typescriptEslintPresetsId = "virtual:typescript-eslint-presets";
const { configs: typescriptEslintConfigs } = require("typescript-eslint") as {
  configs: Record<
    "strictTypeChecked" | "stylisticTypeChecked",
    Array<{ rules?: Record<string, unknown> }>
  >;
};
const typescriptEslintPresetRules = [
  ...typescriptEslintConfigs.strictTypeChecked,
  ...typescriptEslintConfigs.stylisticTypeChecked,
].flatMap((config) => Object.entries(config.rules ?? {}));

export default defineConfig({
  entry: [
    "src/eslint/index.ts",
    "src/eslint/typeAware.ts",
    "src/oxlint/core.ts",
    "src/oxlint/index.ts",
    // Not exported: oxlint loads the sonarjs wrapper by its file path.
    "src/oxlint/sonarjs.ts",
    "src/oxfmt.ts",
    "src/prettier.ts",
  ],
  format: "esm",
  unbundle: true,
  clean: true,
  outDir: "dist",
  plugins: [
    {
      name: "typescript-eslint-presets",
      resolveId: (id) =>
        id === typescriptEslintPresetsId ? `\0${id}` : undefined,
      load: (id) =>
        id === `\0${typescriptEslintPresetsId}`
          ? `export default ${JSON.stringify(typescriptEslintPresetRules)};`
          : undefined,
    },
  ],
  dts: {
    generator: "tsgo",
    tsconfig: "tsconfig.json",
    tsgo: { path: getTypeScript7Path() },
  },
});
