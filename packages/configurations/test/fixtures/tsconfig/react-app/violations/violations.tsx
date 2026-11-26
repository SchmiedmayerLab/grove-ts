//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

// Node globals are not available in the browser, and unused parameters are errors.
export const environment = process.env.NODE_ENV;

export const Label = (props: { text: string }, unused: number) => <span />;
