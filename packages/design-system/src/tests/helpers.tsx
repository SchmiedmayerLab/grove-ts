//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactNode } from "react";
import { GroveProvider, type GroveContextType } from "@/GroveProvider";

interface TestProvidersProps {
  children: ReactNode;
}

const queryClient = new QueryClient();

const groveProviderContext: GroveContextType = {
  router: {
    Link: (props) => <a {...props} />,
  },
};

/**
 * Renders all required context providers for test environments.
 */
export const TestProviders = ({ children }: TestProvidersProps) => (
  <QueryClientProvider client={queryClient}>
    <GroveProvider {...groveProviderContext}>{children}</GroveProvider>
  </QueryClientProvider>
);

interface DefaultWrapperProps {
  children?: ReactNode;
}

const DefaultWrapper = ({ children }: DefaultWrapperProps) => <>{children}</>;

/**
 * Utility for tests that ensures component is rendered with every required context.
 */
export const renderWithProviders = (node: ReactNode, options?: RenderOptions) =>
  render(node, {
    wrapper: ({ children }) => {
      const Wrapper = options?.wrapper ?? DefaultWrapper;
      return (
        <TestProviders>
          <Wrapper>{children}</Wrapper>
        </TestProviders>
      );
    },
  });
