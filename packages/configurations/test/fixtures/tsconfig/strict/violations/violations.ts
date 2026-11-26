//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

// Each statement violates one option of the strict preset.
import { Shape } from "./types";
import "./missing-side-effect";

export enum Direction {
  Up,
  Down,
}

export const implicitAny = (value) => value;

export const unchecked = (values: number[]): number => values[0] + 1;

export const implicitReturn = (value: number) => {
  if (value > 0) {
    return value;
  }
};

export class Base {
  describe(): string {
    return "base";
  }
}

export class Derived extends Base {
  describe(): string {
    return "derived";
  }
}

export const unusedLocal = () => {
  const unused = 1;
  return 2;
};

export const shape: Shape = "circle";
