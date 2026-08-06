//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

/**
 * Checks if the view mode of Storybook is "Docs" overview or Story directly.
 */
export const useIsDocs = () => {
  const location = window.location;
  const params = new URLSearchParams(location.search);
  const viewMode = params.get("viewMode") ?? "story";
  return viewMode === "docs";
};
