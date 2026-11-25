//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

/**
 * The rules of typescript-eslint's strict-type-checked and stylistic-type-checked presets, in preset order.
 * `tsdown.config.ts` writes them into the build.
 */
declare module "virtual:typescript-eslint-presets" {
  const rules: Array<[name: string, entry: unknown]>;
  export default rules;
}
