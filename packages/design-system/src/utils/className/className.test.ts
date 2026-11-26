//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { readFileSync } from "node:fs";
import path from "node:path";
import { cn } from "./className";

const tailwindCss = readFileSync(
  path.resolve(import.meta.dirname, "../../tailwind.css"),
  "utf8",
);

const customUtilities = tailwindCss
  .split("\n")
  .filter((line) => line.startsWith("@utility "))
  .map((line) => line.slice("@utility ".length).replace("{", "").trim());

describe("cn", () => {
  it("combines conditional class names", () => {
    expect(cn("a", false, undefined, ["b", { c: true, d: false }])).toBe(
      "a b c",
    );
  });

  it("lets later classes override conflicting earlier ones", () => {
    expect(cn("h-10 w-full bg-surface-primary", "h-9 w-55 bg-muted")).toBe(
      "h-9 w-55 bg-muted",
    );
  });

  it("keeps a font size and a theme text color together", () => {
    expect(cn("text-sm", "text-muted-foreground")).toBe(
      "text-sm text-muted-foreground",
    );
  });

  it("resolves theme colors against each other", () => {
    expect(cn("text-warning-dark", "text-inverted-foreground")).toBe(
      "text-inverted-foreground",
    );
  });

  it("treats the entrance animations as animations", () => {
    expect(cn("animate-entrance-fade-zoom", "animate-spin")).toBe(
      "animate-spin",
    );
  });

  it.each(customUtilities)("knows the %s utility from tailwind.css", (name) => {
    expect(cn(name, name)).toBe(name);
  });
});
