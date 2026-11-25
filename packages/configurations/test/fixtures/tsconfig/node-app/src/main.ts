//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { readFile } from "node:fs/promises";
import process from "node:process";
import { double } from "./helper.js";

const union = new Set([1, 2]).union(new Set([3]));
const collected = await Array.fromAsync([Promise.resolve(1)]);
const isError = Error.isError(new Error("synthetic"));

class Resource implements Disposable {
  [Symbol.dispose]() {
    process.stdout.write("disposed\n");
  }
}

{
  using resource = new Resource();
  process.stdout.write(`${String(resource)}\n`);
}

const content = await readFile(new URL(import.meta.url), "utf8");

export const result = [double(union.size), collected, isError, content.length];
