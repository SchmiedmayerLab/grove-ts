//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { createContext } from "react";

export interface DashboardContextValue {
  /**
   * Enables auto-shrink of dashboard's aside on lg screens. This optimizes real estate.
   *
   * @default true
   */
  shrinkable: boolean;
}

export const DashboardContext = createContext<DashboardContextValue>({
  shrinkable: true,
});
