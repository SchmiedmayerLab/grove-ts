//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { darkTheme } from "./dark";
import { lightTheme } from "./light";
import { themeToCSSProperties } from "./utils";

describe("theme utilities", () => {
  it("keeps the light and dark theme token sets aligned", () => {
    expect(Object.keys(darkTheme).sort((a, b) => a.localeCompare(b))).toEqual(
      Object.keys(lightTheme).sort((a, b) => a.localeCompare(b)),
    );
  });

  it("converts theme tokens to CSS custom properties", () => {
    const properties = themeToCSSProperties(lightTheme);

    expect(properties["--color-surface"]).toBe(lightTheme["color-surface"]);
    expect(properties["--color-ring"]).toBe(lightTheme["color-ring"]);
    expect(Object.keys(properties)).toHaveLength(
      Object.keys(lightTheme).length,
    );
  });
});
