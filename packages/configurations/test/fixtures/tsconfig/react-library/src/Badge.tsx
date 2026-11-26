//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import type { ReactNode } from "react";

export interface BadgeProps {
  children: ReactNode;
}

export const Badge = ({ children }: BadgeProps) => <span>{children}</span>;
