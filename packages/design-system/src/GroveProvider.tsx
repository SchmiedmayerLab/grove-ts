//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT

import { NextIntlClientProvider } from "next-intl";
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
  useMemo,
} from "react";
import { messages as defaultMessages, type AllMessages } from "@/messages";

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
  const value = useContext(GroveContext);
  if (!value) {
    throw new Error(
      "useGroveContext must be used within GroveProvider. Make sure to wrap your application with GroveProvider",
    );
  }
  return value;
};

interface GroveProviderProps extends GroveContextType {
  children?: ReactNode;
  /**
   * Allows overriding default localization messages.
   */
  messages?: Partial<AllMessages>;
}

/**
 * Injects necessary context providers for Grove components.
 * Wrap your entire application with this component
 * Injected elements:
 * - router configuration (Link component used by your application)
 * - CSS variables for theme
 * - localization messages
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
  messages,
  router,
}: GroveProviderProps) => {
  const resolvedMessages = useMemo(
    () => ({ ...defaultMessages, ...messages }),
    [messages],
  );

  const groveContextValue = useMemo(() => ({ router }), [router]);

  return (
    <NextIntlClientProvider messages={resolvedMessages} locale="en">
      <GroveContext.Provider value={groveContextValue}>
        {children}
      </GroveContext.Provider>
    </NextIntlClientProvider>
  );
};
