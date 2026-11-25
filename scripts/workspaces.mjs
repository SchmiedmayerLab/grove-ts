//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = resolve(
  fileURLToPath(new URL("..", import.meta.url)),
);

/** Read the package directories listed in pnpm-workspace.yaml. */
export const parseWorkspacePackages = (source) => {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => /^packages:\s*$/.test(line));
  if (start === -1) {
    throw new Error("pnpm-workspace.yaml must list workspace packages.");
  }

  const packages = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\s*(#.*)?$/.test(line)) continue;
    const entry = /^\s+-\s+['"]?([^'"#\s]+)['"]?\s*(#.*)?$/.exec(line);
    if (!entry) break;
    if (entry[1].includes("*")) {
      throw new Error(
        `List workspace packages explicitly instead of using globs: ${entry[1]}`,
      );
    }
    packages.push(entry[1]);
  }
  return packages;
};

/** Load every workspace manifest declared in pnpm-workspace.yaml. */
export const readWorkspacePackages = async () => {
  const workspaces = parseWorkspacePackages(
    await readFile(resolve(repositoryRoot, "pnpm-workspace.yaml"), "utf8"),
  );
  return Promise.all(
    workspaces.map(async (workspace) => ({
      workspace,
      manifest: JSON.parse(
        await readFile(
          resolve(repositoryRoot, workspace, "package.json"),
          "utf8",
        ),
      ),
    })),
  );
};

/** Load the workspace packages that are published to npm. */
export const readPublicWorkspacePackages = async () =>
  (await readWorkspacePackages()).filter(({ manifest }) => !manifest.private);
