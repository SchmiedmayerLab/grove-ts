//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

/// <reference types="vitest" />
/// <reference types="vite/client" />
import fs from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { configDefaults } from "vitest/config";
import packageManifest from "./package.json" with { type: "json" };

/**
 * Tuple of [package name, package entry point].
 */
const entries = [
  ["index", "src/index.ts"],
  ["GroveProvider", "src/GroveProvider.tsx"],
  ["forms", "src/forms/index.tsx"],
  ...fs
    .readdirSync(path.resolve(import.meta.dirname, `src/components`))
    .map((name) => [`components/${name}`, `src/components/${name}/index.tsx`]),
  ...fs
    .readdirSync(path.resolve(import.meta.dirname, `src/molecules`))
    .map((name) => [`molecules/${name}`, `src/molecules/${name}/index.tsx`]),
  ...fs
    .readdirSync(path.resolve(import.meta.dirname, `src/modules`))
    .map((name) => [`modules/${name}`, `src/modules/${name}/index.tsx`]),
  ...fs
    .readdirSync(path.resolve(import.meta.dirname, `src/utils`))
    .map((name) => [`utils/${name}`, `src/utils/${name}/index.ts`]),
];

const externalPackages = new Set([
  ...Object.keys(packageManifest.dependencies),
  ...Object.keys(packageManifest.peerDependencies),
]);

const testExclude = [
  "**/*.stories.tsx",
  "./postcss.config.js",
  "./tailwind.config.js",
  "./src/tests/storybook.tsx",
];

export default defineConfig({
  root: ".",
  plugins: [
    react(),
    dts({
      exclude: [
        ".storybook/**",
        "src/tests/**",
        "**/*.stories.{ts,tsx}",
        "**/*.test.{ts,tsx}",
        "testSetup.ts",
        "vite.config.ts",
      ],
      insertTypesEntry: true,
    }),
    viteStaticCopy({
      targets: [
        {
          src: "src/tailwind.css",
          dest: ".",
          rename: "tailwind.css",
        },
        {
          src: "src/base.css",
          dest: ".",
          rename: "base.css",
        },
      ],
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    lib: {
      entry: Object.fromEntries(
        entries.map((entry) => [
          entry[0],
          path.resolve(import.meta.dirname, entry[1]),
        ]),
      ),
      formats: ["es"],
      name: "@schmiedmayerlab/grove-design-system",
      fileName: (format, name) => {
        if (format === "es") return `${name}.js`;
        return `${name}.${format}`;
      },
    },
    rollupOptions: {
      external: (source) =>
        [...externalPackages].some(
          (packageName) =>
            source === packageName || source.startsWith(`${packageName}/`),
        ),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./testSetup.ts"],
    exclude: [...testExclude, ...configDefaults.exclude],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "lcov"],
      exclude: [...testExclude, ...(configDefaults.coverage.exclude ?? [])],
      thresholds: {
        branches: 80,
        functions: 90,
        lines: 90,
        statements: 90,
      },
    },
  },
});
