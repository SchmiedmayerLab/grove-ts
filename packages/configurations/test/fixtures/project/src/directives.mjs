//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

// Synthetic suppression in a JavaScript file for the configuration tests.

import { spawnSync } from "node:child_process";

// eslint-disable-next-line sonarjs/no-os-command-from-path -- The fixture runs the developer's git on purpose.
export const status = () => spawnSync("git", ["status"]);
