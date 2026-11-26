//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { readPublicWorkspacePackages, repositoryRoot } from "./workspaces.mjs";

const publicPackages = await readPublicWorkspacePackages();
const workspaceNames = new Set(
  publicPackages.map(({ manifest }) => manifest.name),
);

const packOutput = execFileSync(
  "pnpm",
  [
    "--recursive",
    ...publicPackages.flatMap(({ workspace }) => [
      "--filter",
      `./${workspace}`,
    ]),
    "pack",
    "--json",
    "--dry-run",
  ],
  {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  },
);
const packMetadata = JSON.parse(packOutput);
// pnpm returns an array for several packages and a single object for one.
const packs = Array.isArray(packMetadata) ? packMetadata : [packMetadata];
const packsByName = new Map(packs.map((pack) => [pack.name, pack]));
const errors = [];

const check = (condition, message) => {
  if (!condition) errors.push(message);
};

const exportTargets = (value) => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(exportTargets);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(exportTargets);
  }
  return [];
};

const forbiddenPackageFile = (path) =>
  /(^|\/)(coverage|test|tests|\.storybook)(\/|$)/.test(path) ||
  /^dist\/src\/.*\.(?:[cm]?js|d\.ts)(?:\.map)?$/.test(path) ||
  /\.(spec|stories|test)\./.test(path) ||
  path.endsWith(".tsbuildinfo") ||
  path.includes("eslint_report");

// verbatimModuleSyntax keeps an import of only inline types as an import without bindings, which loads the module at runtime.
const emptyImport = /^\s*import\s*\{\s*\}\s*from\s/m;

for (const { manifest, workspace } of publicPackages) {
  const label = manifest.name;
  const pack = packsByName.get(label);
  check(pack, `${label}: pnpm did not produce package metadata`);
  if (!pack) continue;

  const packageFiles = new Set(pack.files.map(({ path }) => path));
  const licenseCount = pack.files.filter(
    ({ path }) => path === "LICENSE",
  ).length;
  check(licenseCount === 1, `${label}: expected exactly one LICENSE file`);
  check(packageFiles.has("README.md"), `${label}: README.md is not published`);

  for (const { path } of pack.files) {
    check(
      !forbiddenPackageFile(path),
      `${label}: unexpected package file ${path}`,
    );
  }

  for (const { path } of pack.files) {
    if (!/\.[cm]?js$/.test(path)) continue;
    const source = readFileSync(join(repositoryRoot, workspace, path), "utf8");
    check(
      !emptyImport.test(source),
      `${label}: ${path} imports a module without bindings, use import type for type-only imports`,
    );
  }

  // A source map without embedded sources must point at sources that the package publishes.
  for (const { path } of pack.files) {
    if (!path.endsWith(".map")) continue;
    const sourceMap = JSON.parse(
      readFileSync(join(repositoryRoot, workspace, path), "utf8"),
    );
    if (sourceMap.sourcesContent?.every((content) => content !== null)) {
      continue;
    }
    for (const source of sourceMap.sources ?? []) {
      const sourcePath = posix.normalize(
        posix.join(dirname(path), sourceMap.sourceRoot ?? "", source),
      );
      check(
        packageFiles.has(sourcePath),
        `${label}: ${path} points at ${sourcePath}, which is not published`,
      );
    }
  }

  for (const target of [
    manifest.main,
    manifest.types,
    ...exportTargets(manifest.exports),
  ].filter(Boolean)) {
    const normalizedTarget = target.replace(/^\.\//, "");
    check(
      packageFiles.has(normalizedTarget),
      `${label}: package target ${target} is missing`,
    );
  }

  const exportKeys = new Set(Object.keys(manifest.exports ?? {}));
  for (const path of packageFiles) {
    const entry = path.match(
      /^dist\/(components|molecules|modules|utils)\/([^/]+)\.js$/,
    );
    if (!entry) continue;

    const expectedExport = `./${entry[1]}/${entry[2]}`;
    const packageUsesSubpath = [...exportKeys].some((key) =>
      key.startsWith(`./${entry[1]}/`),
    );
    if (!packageUsesSubpath) continue;

    check(
      exportKeys.has(expectedExport),
      `${label}: built entry ${path} is not exported as ${expectedExport}`,
    );
  }

  for (const dependencyField of [
    "dependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    for (const [dependencyName, dependencyVersion] of Object.entries(
      manifest[dependencyField] ?? {},
    )) {
      if (!workspaceNames.has(dependencyName)) continue;

      check(
        dependencyVersion === "workspace:*",
        `${label}: ${dependencyName} must use the workspace:* protocol`,
      );
    }
  }
}

check(
  packs.length === publicPackages.length,
  `expected ${publicPackages.length} packages but pnpm described ${packs.length}`,
);
check(
  new Set(publicPackages.map(({ manifest }) => manifest.version)).size === 1,
  "all published workspace packages must use the same version",
);

if (errors.length > 0) {
  throw new Error(`Package verification failed:\n- ${errors.join("\n- ")}`);
}

const fileCount = packs.reduce((total, pack) => total + pack.files.length, 0);
console.log(`Verified ${packs.length} packages containing ${fileCount} files.`);
