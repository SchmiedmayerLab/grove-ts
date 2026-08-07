//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { act, render } from "@testing-library/react";
import { type ComponentProps } from "react";
import { darkTheme } from "@/theme/dark";
import { lightTheme } from "@/theme/light";
import { GroveProvider } from "./GroveProvider";

const router = {
  Link: (props: ComponentProps<"a">) => <a {...props} />,
};

const createMediaQueryList = (matches: boolean) => ({
  matches,
  media: "(prefers-color-scheme: dark)",
  onchange: null,
  addEventListener: vi.fn<(type: string, listener: () => void) => void>(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  dispatchEvent: vi.fn(),
});

describe("GroveProvider themes", () => {
  beforeEach(() => {
    const mediaQueryList = createMediaQueryList(false);
    window.matchMedia = vi.fn(() => mediaQueryList);
  });

  it("preserves the existing wrapper-free light default", () => {
    const { container } = render(
      <GroveProvider router={router}>
        <main>Application</main>
      </GroveProvider>,
    );

    expect(container.querySelector("[data-grove-color-scheme]")).toBeNull();
    expect(container.firstElementChild).toHaveTextContent("Application");
  });

  it.each([
    ["light", lightTheme],
    ["dark", darkTheme],
  ] as const)("applies the %s theme", (colorScheme, theme) => {
    const { container } = render(
      <GroveProvider router={router} colorScheme={colorScheme}>
        <main>Application</main>
      </GroveProvider>,
    );

    const themeBoundary = container.querySelector<HTMLElement>(
      "[data-grove-color-scheme]",
    );
    expect(themeBoundary).toHaveAttribute(
      "data-grove-color-scheme",
      colorScheme,
    );
    expect(themeBoundary).toHaveAttribute(
      "data-grove-color-scheme-preference",
      colorScheme,
    );
    expect(themeBoundary?.style.getPropertyValue("--color-surface")).toBe(
      theme["color-surface"],
    );
    expect(themeBoundary?.style.colorScheme).toBe(colorScheme);
    expect(themeBoundary?.style.color).toBe("var(--color-foreground)");
    expect(themeBoundary?.style.display).toBe("contents");
  });

  it("follows changes to the system color scheme", () => {
    const mediaQueryList = createMediaQueryList(true);
    window.matchMedia = vi.fn(() => mediaQueryList);
    const { container } = render(
      <GroveProvider router={router} colorScheme="system">
        <main>Application</main>
      </GroveProvider>,
    );
    const themeBoundary = container.querySelector<HTMLElement>(
      "[data-grove-color-scheme]",
    );

    expect(themeBoundary).toHaveAttribute("data-grove-color-scheme", "dark");
    expect(themeBoundary).toHaveAttribute(
      "data-grove-color-scheme-preference",
      "system",
    );

    act(() => {
      mediaQueryList.matches = false;
      const listener = mediaQueryList.addEventListener.mock.calls[0]?.[1];
      if (!listener) throw new Error("Missing color-scheme listener.");
      listener();
    });

    expect(themeBoundary).toHaveAttribute("data-grove-color-scheme", "light");
    expect(themeBoundary?.style.getPropertyValue("--color-surface")).toBe(
      lightTheme["color-surface"],
    );
  });

  it("accepts custom tokens for either color scheme", () => {
    const customDarkTheme = {
      ...darkTheme,
      "color-primary": "rgb(125 211 252)",
    };
    const { container } = render(
      <GroveProvider
        router={router}
        colorScheme="dark"
        themes={{ dark: customDarkTheme }}
      >
        <main>Application</main>
      </GroveProvider>,
    );
    const themeBoundary = container.querySelector<HTMLElement>(
      "[data-grove-color-scheme]",
    );

    expect(themeBoundary?.style.getPropertyValue("--color-primary")).toBe(
      customDarkTheme["color-primary"],
    );
  });
});
