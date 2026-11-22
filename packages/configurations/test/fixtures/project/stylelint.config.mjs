//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

// Synthetic tool configuration for the configuration tests.

export default {
  rules: { 'color-no-invalid-hex': process.env.CI ? true : null },
}
