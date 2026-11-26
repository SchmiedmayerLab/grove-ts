//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

/**
 * Vite resolves imported SVG files to their URL.
 */
declare module "*.svg" {
  const url: string;
  export default url;
}
