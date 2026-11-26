//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import type { Shape } from "./types";

export class Base {
  describe(): string {
    return "base";
  }
}

export class Derived extends Base {
  override describe(): string {
    return "derived";
  }
}

export const area = (shape: Shape, size: number): number => {
  switch (shape) {
    case "circle":
      return Math.PI * size ** 2;
    case "square":
      return size ** 2;
  }
};

export const first = (values: number[]): number => values[0] ?? 0;
