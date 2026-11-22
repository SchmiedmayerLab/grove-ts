//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

// The ESLint and Prettier configurations are public API used by downstream projects.
// These tests pin their resolved rules and behavior, so that oxc-related changes cannot alter them.
// Run with `UPDATE_SNAPSHOTS=1` only when a change to the ESLint configuration is intended.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  getEslintNodeConfig,
  getEslintReactConfig,
  prettierConfig,
} from "@schmiedmayerlab/grove-configurations";
import { ESLint } from "eslint";
import { format } from "prettier";

const testDir = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(testDir, "fixtures", "project");
const snapshotPath = join(testDir, "snapshots", "eslint-rules.json");

const cases = {
  "node: TypeScript source": [getEslintNodeConfig, "src/functions.ts"],
  "node: JavaScript source": [getEslintNodeConfig, "jest.config.js"],
  "node: ES module": [getEslintNodeConfig, "eslint.config.mjs"],
  "node: tool configuration": [getEslintNodeConfig, "vitest.config.ts"],
  "react: component": [getEslintReactConfig, "src/component.tsx"],
  "react: story": [getEslintReactConfig, "src/component.stories.tsx"],
};

const normalizeLevel = (level) => {
  if (level === 2 || level === "error") return "error";
  if (level === 1 || level === "warn") return "warn";
  return "off";
};

const resolveRules = async (factory, file) => {
  const eslint = new ESLint({
    cwd: fixtureDir,
    overrideConfigFile: true,
    overrideConfig: factory({ tsconfigRootDir: fixtureDir }),
  });
  const config = await eslint.calculateConfigForFile(file);
  return Object.fromEntries(
    Object.entries(config.rules)
      .map(([name, entry]) => {
        const [level, ...options] = Array.isArray(entry) ? entry : [entry];
        const normalized = normalizeLevel(level);
        return [name, options.length ? [normalized, ...options] : normalized];
      })
      .filter(
        ([, entry]) => (Array.isArray(entry) ? entry[0] : entry) !== "off",
      )
      .sort(([left], [right]) => left.localeCompare(right)),
  );
};

test("keeps the resolved ESLint rules unchanged", async () => {
  const actual = {};
  for (const [name, [factory, file]] of Object.entries(cases)) {
    actual[name] = await resolveRules(factory, file);
  }
  if (process.env.UPDATE_SNAPSHOTS === "1") {
    writeFileSync(snapshotPath, `${JSON.stringify(actual, null, 2)}\n`);
  }
  const expected = JSON.parse(readFileSync(snapshotPath, "utf8"));
  assert.deepEqual(actual, expected);
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
  const rules = new Set(
    results.flatMap((result) =>
      result.messages.map((message) => message.ruleId),
    ),
  );
  for (const rule of [
    "prefer-arrow-functions/prefer-arrow-functions",
    "@typescript-eslint/no-floating-promises",
    "@typescript-eslint/naming-convention",
    "sonarjs/no-alphabetical-sort",
    "import-x/no-default-export",
    "import-x/extensions",
  ]) {
    assert.ok(rules.has(rule), `${rule} is not reported`);
  }
});

test("formats with the Prettier configuration", async () => {
  const code = await format(
    'export const element = <div className="p-4 flex">{a ? b : c}</div>\n',
    { ...prettierConfig, filepath: "example.tsx" },
  );
  assert.equal(
    code,
    'export const element = <div className="flex p-4">{a ? b : c}</div>;\n',
  );
});

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
  assert.equal(result.status, 0, result.stderr);
});

test("loads the main entry point with require()", () => {
  const require = createRequire(import.meta.url);
  const configurations = require("@schmiedmayerlab/grove-configurations");
  assert.equal(typeof configurations.getEslintReactConfig, "function");
  assert.equal(typeof configurations.getEslintNodeConfig, "function");
  assert.ok(Array.isArray(configurations.prettierConfig.plugins));
});
