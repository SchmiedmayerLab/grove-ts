//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { getEslintTypeAwareReactConfig } from "@schmiedmayerlab/grove-configurations/eslint-type-aware";

export default [
  { ignores: ["storybook-static"] },
  ...getEslintTypeAwareReactConfig({ tsconfigRootDir: import.meta.dirname }),
];
