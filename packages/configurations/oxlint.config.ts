//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { defineConfig } from "oxlint";
import { oxlintNodeConfig } from "./dist/oxlint/index.mjs";

export default defineConfig({
  extends: [oxlintNodeConfig],
  ignorePatterns: ["test/fixtures/**"],
  overrides: [
    {
      // oxlint loads JS plugins from their default export.
      files: ["src/oxlint/sonarjs.ts"],
      rules: { "import/no-default-export": "off" },
    },
    {
      // The package lints itself with its own build output.
      files: ["oxlint.config.ts"],
      rules: { "import/extensions": "off" },
    },
  ],
});
