//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

// ESLint configurations for the oxc setup: only the rules that oxlint cannot run.
// This entry point does not load Prettier or the TypeScript import resolver, which only the full ESLint configurations need.

import reactPlugin from "@eslint-react/eslint-plugin";
import importPlugin from "eslint-plugin-import-x";
import * as preferArrow from "eslint-plugin-prefer-arrow-functions";
import sonarjsPlugin from "eslint-plugin-sonarjs";
import {
  parser,
  plugin as typescriptEslintPlugin,
  type ConfigWithExtends,
} from "typescript-eslint";
import { getSonarRuleSet, type SonarjsPlugin } from "../sonarjsRules";
import { typeAwareReactRules } from "../typeAwareRules";
import { defineTypedConfig, getIgnoredDirs } from "./shared";

interface EslintTypeAwareConfigParams {
  /**
   * Root of the project, where tsconfig exists.
   * Most likely it's going to be `import.meta.dirname`.
   * */
  tsconfigRootDir: string;
}

/**
 * Code blocks that ESLint processors extract and lint under paths such as `Page.astro/1_1.ts`.
 * They are outside every TypeScript program, so type-aware rules cannot run on them,
 * and opening a default project for each one made ESLint several times slower.
 */
const processorCodeBlocks = ["**/*.{astro,vue,svelte,md,mdx}/**"];

const getTypeAwareConfig = (
  { tsconfigRootDir }: EslintTypeAwareConfigParams,
  react: boolean,
) => {
  const reactStrictConfig = reactPlugin.configs[
    "strict-type-checked"
  ] as ConfigWithExtends;
  return defineTypedConfig(
    getIgnoredDirs(),
    // oxlint and oxfmt configuration files are usually outside the TypeScript program.
    { ignores: ["**/oxlint.config.ts", "**/oxfmt.config.ts"] },
    {
      // Disable directives for rules that run in oxlint are not visible to this configuration.
      linterOptions: {
        reportUnusedDisableDirectives: "off",
        reportUnusedInlineConfigs: "error",
      },
    },
    {
      // The plugins whose rules run in oxlint are registered without rules for every file,
      // so that disable directives naming them stay valid, in JavaScript files too.
      plugins: {
        sonarjs: sonarjsPlugin,
        "@typescript-eslint": typescriptEslintPlugin,
        "@eslint-react": reactPlugin,
        "import-x": importPlugin,
        "prefer-arrow-functions": preferArrow,
      },
    },
    {
      files: ["**/*.{ts,tsx}"],
      ignores: processorCodeBlocks,
      languageOptions: {
        parser,
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      rules: getSonarRuleSet(sonarjsPlugin as unknown as SonarjsPlugin, {
        typeAware: true,
      }),
    },
    ...(react
      ? [
          {
            files: ["**/*.{ts,tsx}"],
            ignores: processorCodeBlocks,
            settings: reactStrictConfig.settings,
            rules: Object.fromEntries(
              typeAwareReactRules.map((name) => [
                name,
                reactStrictConfig.rules?.[name] ?? "error",
              ]),
            ),
          },
        ]
      : []),
  );
};

/**
 * ESLint configuration with only the rules that oxlint cannot run: JS plugin rules that need type information.
 * Run it next to `oxlintNodeConfig` from `@schmiedmayerlab/grove-configurations/oxlint`.
 * */
export const getEslintTypeAwareNodeConfig = (
  params: EslintTypeAwareConfigParams,
) => getTypeAwareConfig(params, false);

/**
 * ESLint configuration with only the rules that oxlint cannot run: JS plugin rules that need type information.
 * Run it next to `oxlintReactConfig` from `@schmiedmayerlab/grove-configurations/oxlint`.
 * */
export const getEslintTypeAwareReactConfig = (
  params: EslintTypeAwareConfigParams,
) => getTypeAwareConfig(params, true);
