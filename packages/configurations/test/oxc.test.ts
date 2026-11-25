//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  getEslintTypeAwareNodeConfig,
  getEslintTypeAwareReactConfig,
} from "@schmiedmayerlab/grove-configurations/eslint-type-aware";
import { oxfmtConfig } from "@schmiedmayerlab/grove-configurations/oxfmt";
import {
  createOxlintConfig,
  oxlintDisableTypeAwareRules,
  oxlintNodeConfig,
  oxlintReactConfig,
} from "@schmiedmayerlab/grove-configurations/oxlint";
import {
  oxlintNodeCoreConfig,
  oxlintReactCoreConfig,
} from "@schmiedmayerlab/grove-configurations/oxlint-core";
import { ESLint, type Linter } from "eslint";
import { format } from "oxfmt";
import type { OxlintConfig } from "oxlint";
import { configs as typescriptEslintConfigs } from "typescript-eslint";
import { expect, test } from "vitest";
import { sonarRulesCoveredElsewhere } from "../src/sonarjsRules";

const require = createRequire(import.meta.url);
const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "project",
);
const oxlintBin = join(
  dirname(require.resolve("oxlint/package.json")),
  "bin",
  "oxlint",
);

interface OxlintDiagnostic {
  code: string;
  filename: string;
  message: string;
}

interface OxlintRuleMetadata {
  scope: string;
  value: string;
  category: string;
  type_aware: boolean;
}

/**
 * The severity of a rule entry, with or without options.
 */
const level = (entry: unknown): unknown =>
  Array.isArray(entry) ? entry[0] : entry;

const runOxlint = (
  args: string[],
  config = "oxlint.config.mjs",
): OxlintDiagnostic[] => {
  const result = spawnSync(
    process.execPath,
    [oxlintBin, "--config", config, "--format", "json", ...args],
    { cwd: fixtureDir, encoding: "utf8" },
  );
  expect(result.stdout, result.stderr).toBeTruthy();
  return (JSON.parse(result.stdout) as { diagnostics: OxlintDiagnostic[] })
    .diagnostics;
};

const listOxlintRules = () =>
  JSON.parse(
    spawnSync(process.execPath, [oxlintBin, "--rules", "--format", "json"], {
      encoding: "utf8",
    }).stdout,
  ) as OxlintRuleMetadata[];

const lintWithOxlint = (config?: string): Finding[] => {
  return runOxlint(["src"], config).map(({ code, filename, message }) => ({
    code,
    file: filename,
    message,
  }));
};

/**
 * The rules that apply to a TypeScript file: the top-level rules and the overrides for TypeScript globs.
 */
const rulesForTypeScriptFiles = (config: OxlintConfig) =>
  Object.assign(
    {},
    config.rules,
    ...(config.overrides ?? [])
      .filter((override) => override.files.includes("**/*.{ts,tsx,mts,cts}"))
      .map((override) => override.rules ?? {}),
  ) as Record<string, unknown>;

/**
 * Merges the rules of an ESLint configuration array, later entries winning.
 */
const mergeEslintRules = (configs: Linter.Config[]) =>
  Object.assign({}, ...configs.map((config) => config.rules ?? {})) as Record<
    string,
    unknown
  >;

interface Finding {
  code: string;
  file: string;
  message: string;
}

const codesIn = (diagnostics: Finding[], file: string) =>
  diagnostics.filter((entry) => entry.file === file).map((entry) => entry.code);

const pluginNames = (config: OxlintConfig) =>
  (config.jsPlugins ?? []).map((plugin) =>
    typeof plugin === "string" ? plugin : plugin.name,
  );

test("exposes the oxlint configurations", () => {
  for (const config of [oxlintNodeConfig, oxlintReactConfig]) {
    expect(config.options?.typeAware).toBe(true);
    expect(config.options?.reportUnusedDisableDirectives).toBe("error");
    expect(config.categories?.correctness).toBe("error");
    expect(Object.keys(config.rules ?? {}).length).toBeGreaterThan(10);
    expect(config.jsPlugins?.length).toBeGreaterThan(0);
  }
  expect(pluginNames(oxlintReactConfig)).toContain("@eslint-react");
  expect(pluginNames(oxlintNodeConfig)).not.toContain("@eslint-react");

  const custom = createOxlintConfig({
    files: { defaultExports: ["**/*.mts"] },
  });
  const defaultExportOverride = custom.overrides?.find(
    (override) => override.rules?.["import/no-default-export"] === "off",
  );
  expect(defaultExportOverride?.files).toEqual(["**/*.mts"]);
});

const allRuleNames = (config: OxlintConfig) => [
  ...Object.keys(config.rules ?? {}),
  ...(config.overrides ?? []).flatMap((override) =>
    Object.keys(override.rules ?? {}),
  ),
];

test("exposes the oxlint core configurations without sonarjs and @eslint-react", () => {
  for (const config of [oxlintNodeCoreConfig, oxlintReactCoreConfig]) {
    expect(config.options?.typeAware).toBe(true);
    expect(config.rules?.["typescript/no-floating-promises"]).toBe("error");
    expect(pluginNames(config)).toEqual(["prefer-arrow-functions"]);
    expect(
      allRuleNames(config).filter((rule) =>
        /^(sonarjs|@eslint-react)\//.test(rule),
      ),
    ).toEqual([]);
  }
  expect(oxlintReactCoreConfig.overrides?.[0]?.env).toEqual({ browser: true });
  expect(oxlintNodeCoreConfig.overrides?.[0]?.env).toEqual({ node: true });
});

/**
 * Runs `script` as an ES module in the fixture project, with the given packages missing.
 */
const runWithoutPackages = (packages: RegExp, script: string) =>
  spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `
        import { registerHooks } from "node:module";
        registerHooks({
          resolve(specifier, context, nextResolve) {
            if (${String(packages)}.test(specifier)) {
              const error = new Error("Cannot find package " + specifier);
              error.code = "ERR_MODULE_NOT_FOUND";
              throw error;
            }
            return nextResolve(specifier, context);
          },
        });
        ${script}
      `,
    ],
    { cwd: fixtureDir, encoding: "utf8" },
  );

test("loads the oxlint core entry point without the plugins that need TypeScript 6", () => {
  const result = runWithoutPackages(
    /^(typescript-eslint|@typescript-eslint\/|eslint-plugin-sonarjs|@eslint-react\/|eslint-plugin-import-x)/,
    `
      const { oxlintReactCoreConfig } = await import("@schmiedmayerlab/grove-configurations/oxlint-core");
      if (!oxlintReactCoreConfig.rules["typescript/no-floating-promises"]) throw new Error("no TypeScript rules");
    `,
  );
  expect(result.status, result.stderr).toBe(0);
});

test("explains which plugin the full oxlint configurations miss", () => {
  const result = runWithoutPackages(
    /^eslint-plugin-sonarjs$/,
    `
      const { oxlintNodeConfig } = await import("@schmiedmayerlab/grove-configurations/oxlint");
      JSON.stringify(oxlintNodeConfig);
    `,
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("needs eslint-plugin-sonarjs");
  expect(result.stderr).toContain(
    "@schmiedmayerlab/grove-configurations/oxlint-core",
  );
});

test("builds the full Node configuration without @eslint-react", () => {
  const result = runWithoutPackages(
    /^@eslint-react\//,
    `
      const { oxlintNodeConfig } = await import("@schmiedmayerlab/grove-configurations/oxlint");
      if (!oxlintNodeConfig.jsPlugins.some((plugin) => plugin.name === "sonarjs")) throw new Error("no sonarjs");
    `,
  );
  expect(result.status, result.stderr).toBe(0);
});

test("builds the full configurations with every key of createOxlintConfig", () => {
  expect(Object.keys(oxlintNodeConfig)).toEqual(
    Object.keys(createOxlintConfig()),
  );
  expect(JSON.parse(JSON.stringify(oxlintReactConfig))).toEqual(
    JSON.parse(JSON.stringify(createOxlintConfig({ react: true }))),
  );
});

test("reports the core rules through oxlint without the JS plugins that need TypeScript 6", () => {
  const codes = lintWithOxlint("oxlint.core.config.mjs").map(
    ({ code }) => code,
  );
  expect(codes).toContain("typescript(no-floating-promises)");
  expect(codes).toContain("prefer-arrow-functions(prefer-arrow-functions)");
  expect(
    codes.filter((code) => /^(sonarjs|@eslint-react)\(/.test(code)),
  ).toEqual([]);
});

test("keeps the rules at the top level, so that projects can change them", () => {
  for (const config of [oxlintNodeConfig, oxlintReactConfig]) {
    expect(config.rules?.["typescript/no-floating-promises"]).toBe("error");
    expect(config.rules?.["sonarjs/no-nested-conditional"]).toBeTruthy();
    // Overrides only turn rules off.
    for (const override of config.overrides ?? []) {
      for (const entry of Object.values(override.rules ?? {})) {
        expect(Array.isArray(entry) ? entry[0] : entry).toBe("off");
      }
    }
  }
  expect(
    oxlintReactConfig.rules?.["@eslint-react/no-missing-key"],
  ).toBeTruthy();

  const scoped = createOxlintConfig({
    react: true,
    files: { react: ["apps/web/**/*.tsx"] },
  });
  expect(scoped.rules?.["@eslint-react/no-missing-key"]).toBeUndefined();
  expect(
    scoped.overrides?.some(
      (override) =>
        override.files[0] === "apps/web/**/*.tsx" &&
        override.rules?.["@eslint-react/no-missing-key"],
    ),
  ).toBeTruthy();
});

test("lists every enabled type-aware TypeScript rule", () => {
  const rules = listOxlintRules();
  const tsRules = rulesForTypeScriptFiles(oxlintNodeConfig);
  const categories = (oxlintNodeConfig.categories ?? {}) as Record<
    string,
    unknown
  >;
  // A rule is on for TypeScript files when the TypeScript override enables it,
  // or when its category is on and the override does not turn it off.
  const enabled = rules
    .filter((rule) => rule.type_aware)
    .filter((rule) => {
      const name = `${rule.scope}/${rule.value}`;
      return name in tsRules
        ? level(tsRules[name]) !== "off"
        : (categories[rule.category] ?? "off") !== "off";
    })
    .map((rule) => `${rule.scope}/${rule.value}`);
  const byName = (left: string, right: string) => left.localeCompare(right);
  expect(Object.keys(oxlintDisableTypeAwareRules).toSorted(byName)).toEqual(
    enabled.toSorted(byName),
  );
});

test("keeps every enabled rule of the typescript-eslint presets", () => {
  const tsRules = rulesForTypeScriptFiles(oxlintNodeConfig);
  const presetRules = mergeEslintRules([
    ...typescriptEslintConfigs.strictTypeChecked,
    ...typescriptEslintConfigs.stylisticTypeChecked,
  ] as Linter.Config[]);
  const missing = Object.entries(presetRules)
    .filter(([, entry]) => level(entry) !== "off")
    .map(([name]) => name.replace("@typescript-eslint/", ""))
    .filter(
      (name) =>
        level(tsRules[`typescript/${name}`] ?? tsRules[name] ?? "off") ===
        "off",
    );
  expect(missing).toEqual([]);
});

test("leaves out the sonarjs rules that other rules cover", () => {
  const correctness = new Set(
    listOxlintRules()
      .filter((rule) => rule.category === "correctness")
      .map((rule) =>
        rule.scope === "eslint" ? rule.value : `${rule.scope}/${rule.value}`,
      ),
  );
  const oxlintRules = rulesForTypeScriptFiles(oxlintReactConfig);
  const eslintRules = mergeEslintRules(
    getEslintTypeAwareReactConfig({ tsconfigRootDir: fixtureDir }),
  );
  for (const [sonarRule, coveringRule] of Object.entries(
    sonarRulesCoveredElsewhere,
  )) {
    expect(eslintRules[sonarRule], sonarRule).toBeUndefined();
    const covered =
      coveringRule in oxlintRules
        ? level(oxlintRules[coveringRule]) !== "off"
        : correctness.has(coveringRule) ||
          level(eslintRules[coveringRule] ?? "off") !== "off";
    expect(covered, `${coveringRule} does not cover ${sonarRule}`).toBeTruthy();
  }
});

test("reports the expected rules through oxlint", () => {
  const diagnostics = lintWithOxlint();

  const functions = codesIn(diagnostics, "src/functions.ts");
  expect(functions).toContain("prefer-arrow-functions(prefer-arrow-functions)");
  expect(functions).toContain("typescript(no-floating-promises)");
  expect(functions).toContain("eslint(id-denylist)");
  // sonarjs marks it as type-aware, but it works without type information.
  expect(functions).toContain("sonarjs(slow-regex)");
  // Rules that need type information inside JS plugins run in ESLint instead.
  expect(functions).not.toContain("sonarjs(no-alphabetical-sort)");
  expect(functions).toContain("typescript(require-array-sort-compare)");

  const imports = codesIn(diagnostics, "src/imports.ts");
  expect(imports).toContain("import(extensions)");
  expect(imports).toContain("import(no-default-export)");
  expect(imports).toContain("typescript(no-import-type-side-effects)");

  const component = codesIn(diagnostics, "src/component.tsx");
  expect(component).toContain("@eslint-react(web-api-no-leaked-interval)");

  // A suppressed finding with a typescript-eslint rule name must neither report nor count as unused.
  expect(codesIn(diagnostics, "src/directives.ts")).toEqual([]);
  expect(codesIn(diagnostics, "src/directives.mjs")).toEqual([]);
  expect(codesIn(diagnostics, "src/script.mjs")).not.toContain(
    "import(extensions)",
  );

  // Astro components get the rules without `files`, and `Astro` is not reported as undefined.
  const astro = codesIn(diagnostics, "src/Page.astro");
  expect(astro).toContain("prefer-arrow-functions(prefer-arrow-functions)");
  expect(astro).not.toContain("eslint(no-undef)");
  // The configuration reports unused directives without a CLI flag.
  expect(
    diagnostics
      .filter((entry) => entry.file === "src/unusedDirective.ts")
      .map((entry) => entry.message)
      .join("\n"),
  ).toContain("Unused eslint-disable directive");
});

test("lets tool configuration files use default exports and Node globals", () => {
  expect(runOxlint(["stylelint.config.mjs"]).map(({ code }) => code)).toEqual(
    [],
  );
});

test("runs sonarjs rules that depend on imports in every file", () => {
  // oxlint shares `context.sourceCode` between files, which breaks sonarjs' import cache
  // unless the plugin wrapper resets it for each file.
  const diagnostics = lintWithOxlint();
  for (const file of ["src/first.test.ts", "src/second.test.ts"]) {
    expect(
      codesIn(diagnostics, file),
      `sonarjs(no-trivial-assertions) is missing in ${file}`,
    ).toContain("sonarjs(no-trivial-assertions)");
  }
});

test("loads the type-aware ESLint entry point without Prettier or the import resolver", () => {
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
  `;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", script],
    { cwd: fixtureDir, encoding: "utf8" },
  );
  expect(result.status, result.stderr).toBe(0);
});

test("skips the code blocks of ESLint processors", async () => {
  const eslint = new ESLint({
    cwd: fixtureDir,
    overrideConfigFile: true,
    overrideConfig: getEslintTypeAwareReactConfig({
      tsconfigRootDir: fixtureDir,
    }),
  });
  const codeBlock = (await eslint.calculateConfigForFile(
    "src/Page.astro/1_1.ts",
  )) as Linter.Config | undefined;
  const real = (await eslint.calculateConfigForFile("src/functions.ts")) as
    | Linter.Config
    | undefined;
  expect(real?.rules?.["sonarjs/no-ignored-return"]).toBeTruthy();
  expect(codeBlock?.rules?.["sonarjs/no-ignored-return"]).toBeUndefined();
  const parserOptions = codeBlock?.languageOptions?.parserOptions as
    | { projectService?: unknown }
    | undefined;
  expect(parserOptions?.projectService).toBeUndefined();
});

test("reports the type-aware JS plugin rules through ESLint", async () => {
  const eslint = new ESLint({
    cwd: fixtureDir,
    overrideConfigFile: true,
    overrideConfig: getEslintTypeAwareReactConfig({
      tsconfigRootDir: fixtureDir,
    }),
  });
  const results = await eslint.lintFiles(["src"]);
  const messages = results.flatMap((result) =>
    result.messages.map((message) => ({
      ...message,
      file: result.filePath.slice(fixtureDir.length + 1),
    })),
  );

  expect(
    messages.filter(
      (message) => message.fatal === true || message.ruleId === null,
    ),
  ).toEqual([]);
  // Disable directives for plugin rules must stay valid in JavaScript files.
  expect(
    messages.filter((message) => message.file === "src/directives.mjs"),
  ).toEqual([]);
  const rulesIn = (file: string) =>
    messages
      .filter((message) => message.file === file)
      .map(({ ruleId }) => ruleId);
  expect(rulesIn("src/functions.ts")).toContain("sonarjs/no-ignored-return");
  // oxlint covers it with typescript/require-array-sort-compare.
  expect(rulesIn("src/functions.ts")).not.toContain(
    "sonarjs/no-alphabetical-sort",
  );
  expect(rulesIn("src/functions.ts")).not.toContain("sonarjs/slow-regex");
  expect(rulesIn("src/component.tsx")).toContain(
    "@eslint-react/no-leaked-conditional-rendering",
  );
  // Rules without type requirements run in oxlint only.
  expect(rulesIn("src/first.test.ts")).not.toContain(
    "sonarjs/no-trivial-assertions",
  );

  const nodeConfig = getEslintTypeAwareNodeConfig({
    tsconfigRootDir: fixtureDir,
  });
  expect(
    nodeConfig.some((config) =>
      Object.keys(config.rules ?? {}).some((rule) =>
        rule.startsWith("@eslint-react/"),
      ),
    ),
  ).toBeFalsy();
});

test("formats with the oxfmt configuration", async () => {
  const source = [
    "import { b } from './b'",
    "import { join } from 'node:path'",
    "import { a } from 'library'",
    "",
    'export const element = <div className="p-4 flex">{join(a, b)}</div>',
    "",
  ].join("\n");
  const { code, errors } = await format("example.tsx", source, oxfmtConfig);

  expect(errors).toEqual([]);
  expect(code).toBe(
    [
      'import { join } from "node:path";',
      'import { a } from "library";',
      'import { b } from "./b";',
      "",
      'export const element = <div className="flex p-4">{join(a, b)}</div>;',
      "",
    ].join("\n"),
  );
});

test("sorts package.json keys without reordering nested fields", async () => {
  const manifest = {
    scripts: { test: "vitest", build: "tsdown" },
    exports: {
      ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
    },
    dependencies: { zod: "^4.0.0", "@example/core": "workspace:*" },
    keywords: ["grove", "example"],
    packageManager: "pnpm@12.0.0",
    name: "@example/package",
  };
  const { code, errors } = await format(
    "package.json",
    JSON.stringify(manifest),
    oxfmtConfig,
  );

  expect(errors).toEqual([]);
  const formatted = JSON.parse(code) as typeof manifest;
  expect(Object.keys(formatted)).toEqual([
    "name",
    "keywords",
    "exports",
    "scripts",
    "dependencies",
    "packageManager",
  ]);
  expect(formatted.keywords).toEqual(["example", "grove"]);
  expect(Object.keys(formatted.exports["."])).toEqual(["types", "default"]);
  expect(Object.keys(formatted.scripts)).toEqual(["test", "build"]);
  expect(Object.keys(formatted.dependencies)).toEqual(["@example/core", "zod"]);
});
