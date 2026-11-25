//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

// Builds the oxlint configurations without loading the plugins that need TypeScript 6.
// sonarjs and @eslint-react are optional peer dependencies, loaded only by the configurations that use them.

import { fileURLToPath } from "node:url";
import type {
  DummyRuleMap,
  ExternalPluginEntry,
  OxlintConfig,
  OxlintOverride,
} from "oxlint";
import { loadOptionalPackage } from "../optionalPackages";
import { getSonarRuleSet, type SonarjsPlugin } from "../sonarjsRules";
import { typeAwareReactRules } from "../typeAwareRules";
import {
  allFilesRules,
  jsTsRules,
  typeAwareTypeScriptRules,
  typeScriptRules,
  typeScriptRulesOff,
} from "./rules";

/**
 * Globs that scope each part of the configuration.
 * Each key passed to `createOxlintConfig` replaces that key's default globs.
 */
/**
 * Configuration files of tools, such as `vite.config.ts`, `eslint.config.mjs`, `.prettierrc.cjs` or `.markdownlint-cli2.mjs`.
 */
const toolConfigurationFiles = [
  "**/*.config.{js,mjs,cjs,ts,mts,cts}",
  "**/.*rc.{js,mjs,cjs,ts,mts,cts}",
  "**/.markdownlint-cli2.{mjs,cjs}",
];

export const defaultOxlintFiles = {
  /** Import, sonarjs and arrow function rules. */
  jsTs: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts,astro,vue,svelte}"],
  /**
   * typescript-eslint rules, including the type-aware ones.
   * Astro, Vue and Svelte components count as TypeScript: oxlint lints their script blocks,
   * and the core rules that TypeScript replaces, such as `no-undef` for `Astro`, stay off there.
   */
  ts: ["**/*.{ts,tsx,mts,cts,astro,vue,svelte}"],
  /** @eslint-react rules, when `react` is enabled. */
  react: ["**/*.{jsx,ts,tsx}"],
  /** Configuration files of tools, which run in Node. */
  nodeGlobals: toolConfigurationFiles,
  /** Files that tools require to have a default export. */
  defaultExports: [
    "**/{app,pages}/**/*.{ts,tsx}",
    "**/*.stories.{ts,tsx}",
    "**/.storybook/**/*.{ts,tsx}",
    ...toolConfigurationFiles,
  ],
};

export type OxlintFiles = {
  [Key in keyof typeof defaultOxlintFiles]: string[];
};

export interface OxlintConfigOptions {
  /**
   * Enables browser globals and, unless `eslintReact` is `false`, the @eslint-react rules.
   * Without it, files get Node globals.
   */
  react?: boolean;
  /**
   * Runs the sonarjs rules through oxlint's JS plugin runtime.
   * Needs `eslint-plugin-sonarjs` installed, which needs TypeScript 6 installed as `typescript`.
   * Defaults to `true`.
   */
  sonarjs?: boolean;
  /**
   * Runs the @eslint-react rules through oxlint's JS plugin runtime, when `react` is enabled.
   * Needs `@eslint-react/eslint-plugin` installed, which needs TypeScript 6 installed as `typescript`.
   * Defaults to `true`.
   */
  eslintReact?: boolean;
  /**
   * Replaces the default globs of the given keys.
   * Spread `defaultOxlintFiles` to extend them instead.
   * The rules of a changed `jsTs`, `ts` or `react` key move from the top level into an override with those globs.
   */
  files?: Partial<OxlintFiles>;
}

/**
 * Turns off the rules that need type information,
 * like typescript-eslint's `disableTypeChecked` configuration.
 * Use it in an override for files outside the TypeScript program, for example tests excluded from `tsconfig.json`.
 */
export const oxlintDisableTypeAwareRules: DummyRuleMap = Object.fromEntries(
  typeAwareTypeScriptRules.map((rule) => [rule, "off"]),
);

const preferArrowFunctionsPlugin: ExternalPluginEntry = {
  name: "prefer-arrow-functions",
  specifier: fileURLToPath(
    import.meta.resolve("eslint-plugin-prefer-arrow-functions"),
  ),
};

const missingPluginMessage = (name: string, option: string) =>
  `The oxlint configuration needs ${name}, which is an optional peer dependency of @schmiedmayerlab/grove-configurations. ` +
  `Install it, or pass \`${option}: false\` to createOxlintConfig, as the core configurations from @schmiedmayerlab/grove-configurations/oxlint-core do.`;

/**
 * The sonarjs JS plugin and its rules that work without type information.
 * The type-aware ones run in ESLint, see `getEslintTypeAwareNodeConfig`.
 */
const loadSonarjs = () => {
  const { module } = loadOptionalPackage(
    "eslint-plugin-sonarjs",
    missingPluginMessage("eslint-plugin-sonarjs", "sonarjs"),
  );
  const sonarjs = module as SonarjsPlugin;
  const plugin: ExternalPluginEntry = {
    name: "sonarjs",
    specifier: fileURLToPath(new URL("sonarjs.mjs", import.meta.url)),
  };
  return {
    plugin,
    rules: getSonarRuleSet(sonarjs, { typeAware: false }) as DummyRuleMap,
  };
};

interface EslintReactPlugin {
  default: {
    configs: Record<"strict-type-checked", { rules?: DummyRuleMap }>;
  };
}

/**
 * The @eslint-react JS plugin and its strict rules that work without type information.
 * The type-aware ones run in ESLint, see `getEslintTypeAwareReactConfig`.
 */
const loadEslintReact = () => {
  const { module, path } = loadOptionalPackage(
    "@eslint-react/eslint-plugin",
    missingPluginMessage("@eslint-react/eslint-plugin", "eslintReact"),
  );
  const strictRules =
    (module as EslintReactPlugin).default.configs["strict-type-checked"]
      .rules ?? {};
  const plugin: ExternalPluginEntry = {
    name: "@eslint-react",
    specifier: path,
  };
  return {
    plugin,
    rules: Object.fromEntries(
      Object.entries(strictRules).filter(
        ([name]) => !(typeAwareReactRules as readonly string[]).includes(name),
      ),
    ) as DummyRuleMap,
  };
};

const preferArrowFunctionsRules: DummyRuleMap = {
  "prefer-arrow-functions/prefer-arrow-functions": [
    "error",
    { allowObjectProperties: true },
  ],
};

const javaScriptFiles = ["**/*.{js,jsx,mjs,cjs}"];

const level = (entry: DummyRuleMap[string]) =>
  Array.isArray(entry) ? entry[0] : entry;

/**
 * ESLint core rules that typescript-eslint turns off for TypeScript files, because TypeScript checks the same things.
 */
const coreRulesOffForTypeScript = Object.fromEntries(
  Object.entries(typeScriptRules).filter(
    ([name, entry]) => !name.includes("/") && level(entry) === "off",
  ),
) as DummyRuleMap;

/**
 * TypeScript rules without the core rules that are off for TypeScript files only.
 */
const typeScriptRulesForAllFiles = Object.fromEntries(
  Object.entries(typeScriptRules).filter(
    ([name]) => !(name in coreRulesOffForTypeScript),
  ),
) as DummyRuleMap;

const sameGlobs = (left: string[], right: string[]) =>
  left.length === right.length &&
  left.every((glob, index) => glob === right[index]);

/**
 * Builds the oxlint configuration.
 * The rules sit at the top level, so a project's own `rules` can change them;
 * oxlint applies overrides of an extended configuration after the project's top-level rules.
 * Overrides only turn rules off for some files or set globals.
 * Parts whose globs a project changes through `files` move into overrides with those globs.
 */
export const createOxlintConfig = ({
  react = false,
  sonarjs = true,
  eslintReact = true,
  files: customFiles = {},
}: OxlintConfigOptions = {}): OxlintConfig => {
  const sonarjsPart = sonarjs ? loadSonarjs() : undefined;
  const eslintReactPart = react && eslintReact ? loadEslintReact() : undefined;
  const files: OxlintFiles = { ...defaultOxlintFiles, ...customFiles };
  const isDefault = (key: keyof OxlintFiles) =>
    sameGlobs(files[key], defaultOxlintFiles[key]);
  const jsTsPart: DummyRuleMap = {
    ...jsTsRules,
    ...sonarjsPart?.rules,
    ...preferArrowFunctionsRules,
  };
  const typeScriptPart: DummyRuleMap = {
    ...typeScriptRulesForAllFiles,
    // Mirrors the `@typescript-eslint/naming-convention` rule that bans `e`.
    "id-denylist": ["error", "e"],
  };
  const reactPart: DummyRuleMap = eslintReactPart?.rules ?? {};
  const parts = [
    { key: "jsTs", rules: jsTsPart },
    { key: "ts", rules: typeScriptPart },
    { key: "react", rules: reactPart },
  ] as const;
  const scopedOverrides: OxlintOverride[] = parts
    .filter(({ key, rules }) => !isDefault(key) && Object.keys(rules).length)
    .map(({ key, rules }) => ({ files: files[key], rules }));
  const topLevelRules = Object.assign(
    {},
    allFilesRules,
    ...parts.filter(({ key }) => isDefault(key)).map(({ rules }) => rules),
  ) as DummyRuleMap;
  return {
    plugins: ["eslint", "typescript", "import"],
    jsPlugins: [
      ...(sonarjsPart ? [sonarjsPart.plugin] : []),
      preferArrowFunctionsPlugin,
      ...(eslintReactPart ? [eslintReactPart.plugin] : []),
    ],
    categories: { correctness: "error" },
    options: { reportUnusedDisableDirectives: "error", typeAware: true },
    rules: topLevelRules,
    overrides: [
      // oxlint does not inherit the top-level `env` of an extended configuration, only overrides.
      { files: ["**/*"], env: react ? { browser: true } : { node: true } },
      ...scopedOverrides,
      { files: files.ts, rules: coreRulesOffForTypeScript },
      // TypeScript rules, including the type-aware ones, only apply to TypeScript files.
      { files: javaScriptFiles, rules: typeScriptRulesOff },
      // Node resolves the specifiers of .mjs and .cjs files as written, including `.ts` with type stripping.
      { files: ["**/*.{mjs,cjs}"], rules: { "import/extensions": "off" } },
      { files: files.nodeGlobals, env: { node: true } },
      {
        files: files.defaultExports,
        rules: {
          "import/no-anonymous-default-export": "off",
          "import/no-default-export": "off",
        },
      },
    ],
  };
};

/**
 * oxlint configuration for Node projects, without the sonarjs rules.
 * It needs neither eslint-plugin-sonarjs nor TypeScript 6.
 */
export const oxlintNodeCoreConfig = createOxlintConfig({ sonarjs: false });

/**
 * oxlint configuration for React projects, without the sonarjs and @eslint-react rules.
 * It needs neither of those plugins nor TypeScript 6.
 */
export const oxlintReactCoreConfig = createOxlintConfig({
  react: true,
  sonarjs: false,
  eslintReact: false,
});
