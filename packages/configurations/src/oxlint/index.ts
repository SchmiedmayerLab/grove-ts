//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

// The full oxlint configurations, with the sonarjs and @eslint-react rules.
// The core configurations live in `./core`, published as `./oxlint-core`, which loads neither plugin.

import type { OxlintConfig } from "oxlint";
import { createOxlintConfig, type OxlintConfigOptions } from "./core";

export * from "./core";

/**
 * Builds the configuration when oxlint first reads it, so that importing this entry point loads no plugin.
 * A Node project then needs no @eslint-react, and a missing plugin fails with an explanation only for the configuration that uses it.
 */
const createLazyOxlintConfig = (options: OxlintConfigOptions): OxlintConfig => {
  let config: OxlintConfig | undefined;
  const load = () => (config ??= createOxlintConfig(options));
  const keys = [
    "plugins",
    "jsPlugins",
    "categories",
    "options",
    "rules",
    "overrides",
  ] as const;
  return Object.defineProperties(
    {},
    Object.fromEntries(
      keys.map((key) => [key, { enumerable: true, get: () => load()[key] }]),
    ),
  ) as OxlintConfig;
};

/**
 * oxlint configuration for Node projects.
 * Needs eslint-plugin-sonarjs installed.
 */
export const oxlintNodeConfig = createLazyOxlintConfig({});

/**
 * oxlint configuration for React projects.
 * Needs eslint-plugin-sonarjs and @eslint-react/eslint-plugin installed.
 */
export const oxlintReactConfig = createLazyOxlintConfig({ react: true });
