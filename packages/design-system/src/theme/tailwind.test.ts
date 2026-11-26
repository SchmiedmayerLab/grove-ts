//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { compile } from "tailwindcss";
import { lightTheme } from "./light";

const require = createRequire(import.meta.url);
const sourceDirectory = path.resolve(import.meta.dirname, "..");

/**
 * Stylesheet packages imported by tailwind.css.
 * tw-animate-css exposes its stylesheet only under the `style` export condition, which Node.js cannot resolve.
 */
const packageStylesheets: Record<string, string> = {
  tailwindcss: require.resolve("tailwindcss/index.css"),
  "tw-animate-css": path.resolve(
    sourceDirectory,
    "../node_modules/tw-animate-css/dist/tw-animate.css",
  ),
};

const loadStylesheet = async (id: string, base: string) => {
  const file = packageStylesheets[id] ?? path.resolve(base, id);
  return {
    path: file,
    base: path.dirname(file),
    content: await readFile(file, "utf8"),
  };
};

const readTailwindSource = () =>
  readFile(path.resolve(sourceDirectory, "tailwind.css"), "utf8");

/**
 * Reads the token declarations of the `@theme static` block as a Theme-shaped record.
 */
const readThemeTokens = async () => {
  const source = await readTailwindSource();
  const start = source.indexOf("@theme static {");
  const block = source.slice(
    source.indexOf("{", start) + 1,
    source.indexOf("}", start),
  );
  const tokens: Record<string, string> = {};
  for (const declaration of block.split(";")) {
    const [name, value] = declaration.split(": ").map((part) => part.trim());
    if (name?.startsWith("--") && value) tokens[name.slice(2)] = value;
  }
  return tokens;
};

const buildTailwindCss = async () => {
  const source = await readTailwindSource();
  const compiler = await compile(source, {
    base: sourceDirectory,
    loadStylesheet,
  });
  return compiler.build(["bg-primary"]);
};

describe("tailwind.css", () => {
  it("declares exactly the light theme tokens", async () => {
    expect(await readThemeTokens()).toEqual(lightTheme);
  });

  it("emits every light theme token as a CSS variable", async () => {
    const css = await buildTailwindCss();

    for (const [name, value] of Object.entries(lightTheme)) {
      expect(css).toContain(`--${name}: ${value};`);
    }
  });

  it("makes utilities read the token variables", async () => {
    const css = await buildTailwindCss();

    expect(css).toContain("background-color: var(--color-primary);");
  });
});
