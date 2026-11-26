//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

// The TypeScript presets are public API used by downstream projects.
// These tests install the packed package into a temporary consumer, so that `files` and `exports` are exercised as npm would install them.
// Every fixture runs with TypeScript 7 and with TypeScript 6, which typescript-eslint and other compiler API tools still need.
// After an intended change, update the snapshot with `pnpm test -u`.

import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const require = createRequire(import.meta.url);
const testDir = dirname(fileURLToPath(import.meta.url));
const packageDir = dirname(testDir);
const presetDir = join(packageDir, "tsconfig");
const fixturesDir = join(testDir, "fixtures", "tsconfig");
const packageName = "@schmiedmayerlab/grove-configurations";

const presets = [
  "strict",
  "node-app",
  "node-library",
  "react-app",
  "react-library",
] as const;

// `typescript` is TypeScript 6 under an alias, and `typescript7` is TypeScript 7.
const resolveBin = (name: string, bin: string) =>
  join(dirname(require.resolve(`${name}/package.json`)), "bin", bin);

const compilers = {
  "TypeScript 7": resolveBin("typescript7", "tsc"),
  "TypeScript 6": resolveBin("typescript", "tsc6"),
};

// Each option either encodes a project layout, which resolves relative to the preset inside node_modules,
// or blocks a consumer from overriding `module` or the build setup.
const forbiddenTopLevelKeys = ["files", "include", "exclude", "references"];
const forbiddenCompilerOptions = [
  "baseUrl",
  "composite",
  "declarationDir",
  "ignoreDeprecations",
  "incremental",
  "moduleResolution",
  "outDir",
  "outFile",
  "paths",
  "plugins",
  "rootDir",
  "rootDirs",
  "tsBuildInfoFile",
  "typeRoots",
];

const expectedViolations: Record<(typeof presets)[number], string[]> = {
  strict: [
    // verbatimModuleSyntax: a type imported without `type`.
    "TS1484",
    // erasableSyntaxOnly: an enum.
    "TS1294",
    // noUncheckedSideEffectImports.
    "TS2882",
    // strict: an implicit any parameter.
    "TS7006",
    // noUncheckedIndexedAccess.
    "TS2532",
    // noImplicitReturns.
    "TS7030",
    // noImplicitOverride.
    "TS4114",
    // noUnusedLocals.
    "TS6133",
  ],
  "node-app": [
    // module nodenext: a relative import without an extension.
    "TS2835",
    // lib: no DOM.
    "TS2584",
  ],
  "node-library": [
    // erasableSyntaxOnly: a parameter property.
    "TS1294",
  ],
  "react-app": [
    // types: no Node globals.
    "TS2591",
    // noUnusedParameters.
    "TS6133",
  ],
  "react-library": [
    // allowImportingTsExtensions is only enabled for apps.
    "TS5097",
  ],
};

const byName = (left: string, right: string) => left.localeCompare(right);

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(path, "utf8"));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const runTsc = (compiler: string, project: string, args: string[] = []) => {
  const result = spawnSync(
    process.execPath,
    [compiler, "-p", project, "--pretty", "false", ...args],
    { encoding: "utf8" },
  );
  const output = `${result.stdout}${result.stderr}`;
  const codes = new Set(
    [...output.matchAll(/error (TS\d+)/g)].map((match) => match[1]),
  );
  return { status: result.status, output, codes };
};

describe("TypeScript presets", () => {
  let consumerDir = "";

  beforeAll(() => {
    consumerDir = mkdtempSync(join(tmpdir(), "grove-tsconfig-"));
    const packDir = join(consumerDir, "pack");
    mkdirSync(packDir);
    // pnpm and tar come from PATH, like in scripts/verify-packages.mjs; the test only runs on development machines and CI.
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- see above
    execFileSync("pnpm", ["pack", "--pack-destination", packDir], {
      cwd: packageDir,
      stdio: "ignore",
    });
    const [tarball] = readdirSync(packDir);
    if (!tarball) throw new Error("pnpm pack did not produce a tarball");

    const installDir = join(consumerDir, "node_modules", packageName);
    mkdirSync(installDir, { recursive: true });
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- see above
    execFileSync("tar", [
      "-xzf",
      join(packDir, tarball),
      "-C",
      installDir,
      "--strip-components",
      "1",
    ]);

    // The presets resolve `types` and the JSX runtime from the consumer project.
    for (const name of ["@types/node", "@types/react"]) {
      const target = realpathSync(
        dirname(require.resolve(`${name}/package.json`)),
      );
      const link = join(consumerDir, "node_modules", name);
      mkdirSync(dirname(link), { recursive: true });
      symlinkSync(target, link, "dir");
    }

    writeFileSync(
      join(consumerDir, "package.json"),
      `${JSON.stringify({ name: "consumer", private: true, type: "module" })}\n`,
    );
    cpSync(fixturesDir, consumerDir, { recursive: true });
  });

  afterAll(() => {
    if (consumerDir) rmSync(consumerDir, { recursive: true, force: true });
  });

  test("exports every preset file under ./tsconfig/<name>", () => {
    const manifest = readJson(join(packageDir, "package.json"));
    if (!isRecord(manifest) || !isRecord(manifest.exports)) {
      throw new Error("package.json has no exports");
    }
    const exported = Object.entries(manifest.exports)
      .filter(([key]) => key.startsWith("./tsconfig/"))
      .sort(([left], [right]) => left.localeCompare(right));
    const files = readdirSync(presetDir)
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.replace(/\.json$/, ""))
      .sort(byName);

    expect(files).toEqual([...presets].sort(byName));
    expect(exported).toEqual(
      files.map((name) => [`./tsconfig/${name}`, `./tsconfig/${name}.json`]),
    );
  });

  test.each(presets)(
    "%s resolves with the Node.js resolver of the installed package",
    (preset) => {
      const consumerRequire = createRequire(join(consumerDir, "package.json"));
      const resolved = consumerRequire.resolve(
        `${packageName}/tsconfig/${preset}`,
      );

      expect(realpathSync(resolved)).toBe(
        realpathSync(
          join(
            consumerDir,
            "node_modules",
            packageName,
            "tsconfig",
            `${preset}.json`,
          ),
        ),
      );
    },
  );

  test.each(presets)("%s sets no path-like or layout options", (preset) => {
    const config = readJson(join(presetDir, `${preset}.json`));
    if (!isRecord(config)) throw new Error(`${preset} is not an object`);
    const compilerOptions = isRecord(config.compilerOptions)
      ? config.compilerOptions
      : {};

    expect(
      Object.keys(config).filter((key) => forbiddenTopLevelKeys.includes(key)),
    ).toEqual([]);
    expect(
      Object.keys(compilerOptions).filter((key) =>
        forbiddenCompilerOptions.includes(key),
      ),
    ).toEqual([]);
    if (typeof config.extends === "string") {
      expect(config.extends).toMatch(/^\.\/[\w-]+\.json$/);
    }
  });

  describe.each(Object.entries(compilers))("%s", (_, compiler) => {
    test.each(presets)("%s type-checks valid sources", (preset) => {
      const { status, output } = runTsc(
        compiler,
        join(consumerDir, preset, "tsconfig.json"),
      );

      expect(output).toBe("");
      expect(status).toBe(0);
    });

    test.each(presets)("%s reports the expected violations", (preset) => {
      const { status, codes } = runTsc(
        compiler,
        join(consumerDir, preset, "tsconfig.violations.json"),
      );

      expect(status).not.toBe(0);
      expect(codes).toEqual(new Set(expectedViolations[preset]));
    });

    test.each(["node-library", "react-library"])(
      "%s emits declarations into the consumer outDir",
      (preset) => {
        const outDir = join(consumerDir, preset, "dist");
        rmSync(outDir, { recursive: true, force: true });
        const { status, output } = runTsc(
          compiler,
          join(consumerDir, preset, "tsconfig.json"),
        );

        expect(output).toBe("");
        expect(status).toBe(0);
        expect(existsSync(join(outDir, "index.d.ts"))).toBe(true);
        // Declaration maps point at sources, which a package usually does not publish.
        expect(existsSync(join(outDir, "index.d.ts.map"))).toBe(false);
      },
    );

    test("node-library embeds the sources in the JavaScript source maps", () => {
      const outDir = join(consumerDir, "node-library", "dist");
      rmSync(outDir, { recursive: true, force: true });
      const { status } = runTsc(
        compiler,
        join(consumerDir, "node-library", "tsconfig.json"),
      );
      const sourceMap = readJson(join(outDir, "index.js.map"));

      expect(status).toBe(0);
      expect(isRecord(sourceMap) && sourceMap.sourcesContent).toEqual([
        readFileSync(
          join(fixturesDir, "node-library", "src", "index.ts"),
          "utf8",
        ),
      ]);
    });
  });

  test("matches the snapshot of the resolved compiler options", async () => {
    const resolved: Record<string, unknown> = {};
    for (const preset of presets) {
      // TypeScript 7.0 prints a configuration even when `extends` cannot be resolved, so the snapshot uses TypeScript 6.
      const projectDir = join(consumerDir, "show-config", preset);
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, "index.ts"), "export {};\n");
      writeFileSync(
        join(projectDir, "tsconfig.json"),
        JSON.stringify({
          extends: `${packageName}/tsconfig/${preset}`,
          files: ["index.ts"],
        }),
      );
      const { status, output } = runTsc(
        compilers["TypeScript 6"],
        join(projectDir, "tsconfig.json"),
        ["--showConfig"],
      );

      expect(status).toBe(0);
      const config: unknown = JSON.parse(output);
      const compilerOptions =
        isRecord(config) && isRecord(config.compilerOptions)
          ? config.compilerOptions
          : {};
      resolved[preset] = Object.fromEntries(
        Object.entries(compilerOptions).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      );
    }

    await expect(`${JSON.stringify(resolved, null, 2)}\n`).toMatchFileSnapshot(
      "snapshots/tsconfig-presets.json",
    );
  });
});
