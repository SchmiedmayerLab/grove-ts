//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { useCallback, useSyncExternalStore } from "react";
import { screens } from "@/theme/breakpoints";

/**
 * Hook that subscribes to browser media query changes.
 *
 * @example
 * ```ts
 * const isLargeScreen = useMedia('(min-width: 1024px)');
 * ```
 */
const useMedia = (query: string) => {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const match = window.matchMedia(query);
      match.addEventListener("change", onStoreChange);
      return () => match.removeEventListener("change", onStoreChange);
    },
    [query],
  );
  const getSnapshot = useCallback(
    () => window.matchMedia(query).matches,
    [query],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
};

/**
 * Checks if the user uses a touch device
 */
export const useIsTouchDevice = () => useMedia("(pointer: coarse)");

/**
 * Allows creating a {@link useIsScreen} hook with provided breakpoints.
 * Use {@link useIsScreen} directly if you just need default Tailwind's screens.
 *
 * @example
 * ```ts
 * const useIsScreen = createUseIsScreen({ sm: '560px', lg: "1200px" });
 * useIsScreen("sm");
 * ```
 */
export const createUseIsScreen =
  <TBreakpoints extends Record<string, string>>(breakpoints: TBreakpoints) =>
  (key: keyof TBreakpoints) =>
    useMedia(`(min-width: ${breakpoints[key]})`);

/**
 * Subscribes to media query checking minimal width of screen.
 * Matches default Tailwind's screen sizes and breakpoint methodology.
 *
 * @example
 * ```ts
 * const isLg = useIsScreen("lg");
 * if (isLg) // do something on large screens
 * ```
 *
 * @example
 * ```tsx
 * // those are equivalents
 * useIsScreen("xl")
 * <div className="xl:flex" />
 * ```
 *
 */
export const useIsScreen = createUseIsScreen(screens);
