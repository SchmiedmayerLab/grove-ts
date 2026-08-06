//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT

import { messages as signInFormMessages } from "./modules/auth/SignInForm";

export const messages = {
  ...signInFormMessages,
};

export type AllMessages = typeof messages;
