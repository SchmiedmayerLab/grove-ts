//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT

import { NextIntlClientProvider } from "next-intl";
import {
  type CSSProperties,
  type ComponentProps,
  createContext,
  type ReactNode,
  use,
  useMemo,
} from "react";
import { messages as defaultMessages, type AllMessages } from "@/messages";
import { darkTheme } from "@/theme/dark";
import { lightTheme } from "@/theme/light";
import {
  type ColorScheme,
  type GroveThemes,
  type ResolvedColorScheme,
  themeToCSSProperties,
} from "@/theme/utils";
import { usePrefersDarkMode } from "@/utils/useMedia";

/**
 * Allows injecting the necessary router-related components.
 *
 * @remarks
 * Grove Web is router-agnostic.
 * We need to provide a way to inject router-specific dependencies.
 * Projects can have different routers:
 * Tanstack Router, React Router, Next router.
 * See {@link GroveProvider} for examples with Next and Tanstack Router.
 */
export interface GroveContextRouter {
  /**
   * Link component. Make sure to provide your router's Link component.
   */
  Link: (props: ComponentProps<"a">) => ReactNode;
}

export interface GroveContextType {
  router: GroveContextRouter;
}

export const GroveContext = createContext<GroveContextType | null>(null);

/**
 * Returns GroveContextType from context and validates its presence.
 * @throws {Error} When used outside GroveProvider.
 */
export const useGroveContext = () => {
  const value = use(GroveContext);
  if (!value) {
    throw new Error(
      "useGroveContext must be used within GroveProvider. Make sure to wrap your application with GroveProvider",
    );
  }
  return value;
};

export interface GroveProviderProps extends GroveContextType {
  children?: ReactNode;
  /**
   * Allows overriding default localization messages.
   */
  messages?: Partial<AllMessages>;
  /**
   * Selects the active color scheme. `system` follows browser and operating-system settings.
   * Existing applications remain light unless this property is provided.
   *
   * @default "light"
   */
  colorScheme?: ColorScheme;
  /**
   * Overrides either of Grove's default theme token sets.
   */
  themes?: Partial<GroveThemes>;
}

const resolveColorScheme = (
  preference: ColorScheme,
  prefersDarkMode: boolean,
): ResolvedColorScheme => {
  if (preference !== "system") return preference;
  return prefersDarkMode ? "dark" : "light";
};

/**
 * Injects necessary context providers for Grove components.
 * Wrap your entire application with this component
 * Injected elements:
 * - router configuration (Link component used by your application)
 * - CSS variables for theme
 * - localization messages
 *
 * @example
 * // Follow the browser or operating-system color scheme
 * ```tsx
 * <GroveProvider router={routerProps} colorScheme="system">
 *   <App />
 * </GroveProvider>
 * ```
 *
 * @example
 * // Usage with Next.js
 * ```ts
 * import { GroveProvider, GroveContextRouter } from "@schmiedmayerlab/grove-design-system";
 * import Link from "next/link";
 *
 * const routerProps: GroveContextRouter = {
 *   Link: ({ href, ...props }) => <Link href={href ?? "#"} {...props} />,
 * };
 * <GroveProvider router={routerProps}>...</GroveProvider>;
 * ```
 *
 * @example
 * // Usage with @tanstack/react-router
 * ```ts
 * import { GroveProvider, GroveContextRouter } from "@schmiedmayerlab/grove-design-system";
 * import { Link } from "@tanstack/react-router";
 *
 * const routerProps: GroveContextRouter = {
 *   Link: ({ href, ...props }) => <Link to={href} {...props} />,
 * };
 * <GroveProvider router={routerProps}>...</GroveProvider>;
 * ```
 */
export const GroveProvider = ({
  children,
  colorScheme,
  messages,
  router,
  themes,
}: GroveProviderProps) => {
  const prefersDarkMode = usePrefersDarkMode();
  const colorSchemePreference = colorScheme ?? "light";
  const resolvedColorScheme = resolveColorScheme(
    colorSchemePreference,
    prefersDarkMode,
  );
  const selectedTheme =
    themes?.[resolvedColorScheme] ??
    (resolvedColorScheme === "dark" ? darkTheme : lightTheme);

  const resolvedMessages = useMemo(
    () => ({ ...defaultMessages, ...messages }),
    [messages],
  );

  const groveContextValue = useMemo(() => ({ router }), [router]);
  const themeStyle = useMemo<CSSProperties>(
    () => ({
      ...themeToCSSProperties(selectedTheme),
      color: "var(--color-foreground)",
      colorScheme: resolvedColorScheme,
      display: "contents",
    }),
    [resolvedColorScheme, selectedTheme],
  );

  const themedChildren =
    colorScheme !== undefined || themes !== undefined ?
      <div
        data-grove-color-scheme={resolvedColorScheme}
        data-grove-color-scheme-preference={colorSchemePreference}
        style={themeStyle}
      >
        {children}
      </div>
    : children;

  return (
    <NextIntlClientProvider messages={resolvedMessages} locale="en">
      <GroveContext value={groveContextValue}>{themedChildren}</GroveContext>
    </NextIntlClientProvider>
  );
};
