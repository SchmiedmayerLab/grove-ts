//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { oxlintNodeConfig } from "@schmiedmayerlab/grove-configurations/oxlint";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [oxlintNodeConfig],
});
