//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import type { StorybookConfig } from "@storybook/react-vite";
import type { PluginOption } from "vite";

/**
 * Plugins from vite.config.ts that only make sense for the library build.
 * In Storybook they would emit type declarations and the copied stylesheets into the static site.
 */
const libraryBuildPlugins = ["unplugin-dts", "vite-plugin-static-copy"];

const isLibraryBuildPlugin = (plugin: PluginOption) =>
  !!plugin &&
  typeof plugin === "object" &&
  "name" in plugin &&
  libraryBuildPlugins.some((name) => plugin.name.startsWith(name));

const withoutLibraryBuildPlugins = (plugins: PluginOption[]): PluginOption[] =>
  plugins.flatMap((plugin) => {
    if (Array.isArray(plugin)) return [withoutLibraryBuildPlugins(plugin)];
    return isLibraryBuildPlugin(plugin) ? [] : [plugin];
  });

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: ["@storybook/addon-docs"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  docs: {},
  viteFinal: (viteConfig) => ({
    ...viteConfig,
    plugins: withoutLibraryBuildPlugins(viteConfig.plugins ?? []),
  }),
  typescript: {
    reactDocgen: "react-docgen-typescript",
  },
};
export default config;
