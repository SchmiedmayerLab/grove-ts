//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  getEslintNodeConfig,
  getEslintReactConfig,
} from "@schmiedmayerlab/grove-configurations/eslint";
import { prettierConfig } from "@schmiedmayerlab/grove-configurations/prettier";
import { expect, test } from "vitest";

test("loads the published ESM configuration entry points", () => {
  const options = { tsconfigRootDir: import.meta.dirname };

  expect(getEslintNodeConfig(options).length).toBeGreaterThan(0);
  expect(getEslintReactConfig(options).length).toBeGreaterThan(0);
  expect(prettierConfig).toBeTypeOf("object");
  expect(prettierConfig.plugins).toBeInstanceOf(Array);
});
