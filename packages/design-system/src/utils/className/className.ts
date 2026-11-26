//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

type CustomClassGroup =
  | "focus-ring"
  | "no-scrollbar"
  | "interactive-opacity"
  | "hide-all-hidden";

/**
 * tailwind-merge that knows the custom utilities defined in tailwind.css.
 * Theme colors such as `bg-surface-primary` need no configuration, because tailwind-merge accepts any color name.
 */
const twMerge = extendTailwindMerge<CustomClassGroup>({
  extend: {
    classGroups: {
      animate: [
        {
          animate: [
            "entrance-fade",
            "entrance-fade-zoom",
            "entrance-fade-slide",
          ],
        },
      ],
      "focus-ring": ["focus-ring"],
      "no-scrollbar": ["no-scrollbar"],
      "interactive-opacity": ["interactive-opacity"],
      "hide-all-hidden": ["hide-all-hidden"],
    },
  },
});

/**
 * Combines class names with conditional logic and resolves Tailwind CSS conflicts.
 * Removes falsy values and supports nested arrays and conditional checks, like [clsx](https://github.com/lukeed/clsx).
 * When two classes set the same property, the later one wins, so `className` overrides a component's defaults.
 * Built on [tailwind-merge](https://github.com/dcastil/tailwind-merge), configured for Grove's custom utilities.
 *
 * @example
 * ```ts
 * cn("w-full bg-muted", isActive && "bg-primary", "w-55");
 * // "bg-primary w-55" when isActive is true
 * ```
 */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
