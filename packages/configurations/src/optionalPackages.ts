//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

/**
 * Loads an optional peer dependency synchronously, only when a configuration uses it.
 * The entry points cannot use top-level `await`, because CommonJS projects load them with `require()`.
 * Some plugins only export an `import` condition, so the path is resolved as ESM and then required.
 * A missing package fails with `message`, which says what to install or to use instead.
 */
export const loadOptionalPackage = (
  name: string,
  message: string,
): { module: unknown; path: string } => {
  let path: string;
  try {
    path = fileURLToPath(import.meta.resolve(name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND") {
      throw new Error(message, { cause: error });
    }
    throw error;
  }
  return { module: require(path) as unknown, path };
};
