//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

// The ESLint and Prettier configurations are public API used by downstream projects.
// These tests pin their resolved rules and behavior, so that every change to them is deliberate.
// After an intended change, update the snapshot with `pnpm test -u`.

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  getEslintNodeConfig,
  getEslintReactConfig,
} from "@schmiedmayerlab/grove-configurations/eslint";
import { prettierConfig } from "@schmiedmayerlab/grove-configurations/prettier";
import { ESLint, type Linter } from "eslint";
import { format } from "prettier";
import { expect, test } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(testDir, "fixtures", "project");

type ConfigFactory = typeof getEslintNodeConfig;

const cases: Record<string, [ConfigFactory, string]> = {
  "node: TypeScript source": [getEslintNodeConfig, "src/functions.ts"],
  "node: JavaScript source": [getEslintNodeConfig, "jest.config.js"],
  "node: ES module": [getEslintNodeConfig, "eslint.config.mjs"],
  "node: tool configuration": [getEslintNodeConfig, "vitest.config.ts"],
  "react: component": [getEslintReactConfig, "src/component.tsx"],
  "react: story": [getEslintReactConfig, "src/component.stories.tsx"],
};

const normalizeLevel = (level: unknown) => {
  if (level === 2 || level === "error") return "error";
  if (level === 1 || level === "warn") return "warn";
  return "off";
};

const resolveRules = async (factory: ConfigFactory, file: string) => {
  const eslint = new ESLint({
    cwd: fixtureDir,
    overrideConfigFile: true,
    overrideConfig: factory({ tsconfigRootDir: fixtureDir }),
  });
  const config = (await eslint.calculateConfigForFile(file)) as Linter.Config;
  return Object.fromEntries(
    Object.entries(config.rules ?? {})
      .map(([name, entry]): [string, unknown] => {
        const [level, ...options]: unknown[] = Array.isArray(entry)
          ? entry
          : [entry];
        const normalized = normalizeLevel(level);
        return [name, options.length ? [normalized, ...options] : normalized];
      })
      .filter(
        ([, entry]) => (Array.isArray(entry) ? entry[0] : entry) !== "off",
      )
      .sort(([left], [right]) => left.localeCompare(right)),
  );
};

test("matches the snapshot of the resolved ESLint rules", async () => {
  const actual: Record<string, unknown> = {};
  for (const [name, [factory, file]] of Object.entries(cases)) {
    actual[name] = await resolveRules(factory, file);
  }
  await expect(`${JSON.stringify(actual, null, 2)}\n`).toMatchFileSnapshot(
    "snapshots/eslint-rules.json",
  );
});

test("reports violations through the full ESLint configurations", async () => {
  const eslint = new ESLint({
    cwd: fixtureDir,
    overrideConfigFile: true,
    overrideConfig: getEslintReactConfig({ tsconfigRootDir: fixtureDir }),
  });
  const results = await eslint.lintFiles([
    "src/functions.ts",
    "src/imports.ts",
  ]);
  const rules = results.flatMap((result) =>
    result.messages.map((message) => message.ruleId),
  );
  for (const rule of [
    "prefer-arrow-functions/prefer-arrow-functions",
    "@typescript-eslint/no-floating-promises",
    "@typescript-eslint/naming-convention",
    "sonarjs/no-alphabetical-sort",
    "import-x/no-default-export",
    "import-x/extensions",
  ]) {
    expect(rules).toContain(rule);
  }
});

test("formats with the Prettier configuration", async () => {
  const code = await format(
    'export const element = <div className="p-4 flex">{a ? b : c}</div>\n',
    { ...prettierConfig, filepath: "example.tsx" },
  );
  expect(code).toBe(
    'export const element = <div className="flex p-4">{a ? b : c}</div>;\n',
  );
});

// The Prettier entry point stays free of ESLint, because typescript-eslint fails to load
// when a project installs TypeScript 7 as `typescript`.
test("loads the Prettier entry point without the ESLint dependencies", () => {
  // Fails the import of any module that only the ESLint configurations need.
  const script = `
    import { registerHooks } from "node:module";
    registerHooks({
      resolve(specifier, context, nextResolve) {
        if (/eslint/.test(specifier)) throw new Error("loaded " + specifier);
        return nextResolve(specifier, context);
      },
    });
    const { prettierConfig } = await import("@schmiedmayerlab/grove-configurations/prettier");
    if (!prettierConfig.plugins.length) throw new Error("no plugins");
  `;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", script],
    {
      cwd: fixtureDir,
      encoding: "utf8",
    },
  );
  expect(result.status, result.stderr).toBe(0);
});

test("loads the ESLint and Prettier entry points with require()", () => {
  const require = createRequire(import.meta.url);
  const eslintConfigurations =
    require("@schmiedmayerlab/grove-configurations/eslint") as {
      getEslintReactConfig: unknown;
      getEslintNodeConfig: unknown;
    };
  const prettierConfigurations =
    require("@schmiedmayerlab/grove-configurations/prettier") as {
      prettierConfig: { plugins: unknown };
    };
  expect(eslintConfigurations.getEslintReactConfig).toBeTypeOf("function");
  expect(eslintConfigurations.getEslintNodeConfig).toBeTypeOf("function");
  expect(prettierConfigurations.prettierConfig.plugins).toBeInstanceOf(Array);
});

test("has no main entry point", () => {
  // Every configuration has its own entry point, so that each loads only its own tools.
  const require = createRequire(import.meta.url);
  expect(() =>
    require.resolve("@schmiedmayerlab/grove-configurations"),
  ).toThrow(expect.objectContaining({ code: "ERR_PACKAGE_PATH_NOT_EXPORTED" }));
});
