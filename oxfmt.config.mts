//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { defineConfig } from "oxfmt";

// Mirrors `oxfmtConfig` from `@schmiedmayerlab/grove-configurations/oxfmt`,
// which cannot be imported here because formatting runs before the packages are built.
export default defineConfig({
  printWidth: 80,
  sortTailwindcss: {},
  sortImports: {
    groups: ["builtin", "external", "internal", ["parent", "sibling", "index"]],
    internalPattern: ["@/"],
    newlinesBetween: false,
    ignoreCase: true,
  },
  // oxfmt skips the files in .gitignore and lockfiles by itself.
  // Local agent settings can be hidden by a global gitignore, which oxfmt does not read.
  ignorePatterns: [
    ".claude",
    // Written by Vitest.
    "packages/configurations/test/snapshots",
  ],
});
