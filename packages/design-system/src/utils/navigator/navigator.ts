//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

/**
 * Gets user locale, providing en-US as fallback
 */
export const getNavigatorLanguage = () => {
  if (typeof window === "undefined") return "en-US"; // Fallback for SSR
  const preferredLanguage = navigator.languages.find(
    (language) => language.length > 0,
  );
  if (preferredLanguage) return preferredLanguage;
  return navigator.language || "en-US";
};
