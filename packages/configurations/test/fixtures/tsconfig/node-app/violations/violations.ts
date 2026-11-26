//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

// Relative imports need an extension under module nodenext, and the DOM is not available.
import { double } from "./helper";

export const title = document.title;
export const doubled = double(2);
