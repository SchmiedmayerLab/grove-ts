//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { renderHook, act } from "@testing-library/react";
import { screens } from "@/theme/breakpoints";
import { useIsTouchDevice, useIsScreen, usePrefersDarkMode } from "./useMedia";

describe("useMedia", () => {
  let matchMediaMock = vi.fn<typeof window.matchMedia>();

  const createMediaQueryList = (matches: boolean) => ({
    matches,
    media: "",
    onchange: null,
    addEventListener: vi.fn<(type: string, listener: () => void) => void>(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });

  const mockMatchMedia = (matches: boolean) => {
    const mediaQueryList = createMediaQueryList(matches);
    matchMediaMock = vi.fn().mockImplementation(() => mediaQueryList);
    window.matchMedia = matchMediaMock;
    return mediaQueryList;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useIsTouchDevice", () => {
    it("returns true for touch devices", () => {
      mockMatchMedia(true);
      const { result } = renderHook(() => useIsTouchDevice());
      expect(result.current).toBe(true);
    });

    it("returns false for non-touch devices", () => {
      mockMatchMedia(false);
      const { result } = renderHook(() => useIsTouchDevice());
      expect(result.current).toBe(false);
    });

    it("updates when media query changes", () => {
      const mediaQueryList = mockMatchMedia(false);
      const { result } = renderHook(() => useIsTouchDevice());

      expect(result.current).toBe(false);

      // Simulate media query change
      act(() => {
        mediaQueryList.matches = true;
        const changeListener =
          mediaQueryList.addEventListener.mock.calls[0]?.[1];
        if (changeListener == null) throw new Error("Missing change listener.");
        changeListener();
      });

      expect(result.current).toBe(true);
    });
  });

  describe("usePrefersDarkMode", () => {
    it("tracks the system color-scheme preference", () => {
      mockMatchMedia(true);
      const { result } = renderHook(() => usePrefersDarkMode());

      expect(result.current).toBe(true);
      expect(matchMediaMock).toHaveBeenCalledWith(
        "(prefers-color-scheme: dark)",
      );
    });
  });

  describe("useIsScreen", () => {
    it("returns true when screen width matches breakpoint", () => {
      mockMatchMedia(true);
      const { result } = renderHook(() => useIsScreen("md"));
      expect(result.current).toBe(true);
    });

    it("returns false when screen width is below breakpoint", () => {
      mockMatchMedia(false);
      const { result } = renderHook(() => useIsScreen("md"));
      expect(result.current).toBe(false);
    });

    it("uses correct breakpoint value", () => {
      mockMatchMedia(false);
      renderHook(() => useIsScreen("md"));

      expect(matchMediaMock).toHaveBeenCalledWith(`(min-width: ${screens.md})`);
    });

    it("updates when media query changes", () => {
      const mediaQueryList = mockMatchMedia(false);
      const { result } = renderHook(() => useIsScreen("md"));

      expect(result.current).toBe(false);

      // Simulate media query change
      act(() => {
        mediaQueryList.matches = true;
        const changeListener =
          mediaQueryList.addEventListener.mock.calls[0]?.[1];
        if (changeListener == null) throw new Error("Missing change listener.");
        changeListener();
      });

      expect(result.current).toBe(true);
    });

    it("cleans up event listeners on unmount", () => {
      const mediaQueryList = mockMatchMedia(false);
      const { unmount } = renderHook(() => useIsScreen("md"));

      unmount();

      expect(mediaQueryList.removeEventListener).toHaveBeenCalled();
    });
  });
});
