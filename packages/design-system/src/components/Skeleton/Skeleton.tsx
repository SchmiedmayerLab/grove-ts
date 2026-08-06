//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type ComponentProps } from "react";
import { cn } from "@/utils/className";

type SkeletonProps = ComponentProps<"div"> & {
  /**
   * Full circle skeleton.
   */
  round?: boolean;
};

/**
 * Skeleton to indicate the content loading state.
 * Useful if you load data partially and want to preserve layout size.
 *
 *
 * @example
 * ```tsx
 * // Basic usage, width and height classes are necessary
 * <Skeleton className="w-12 h-4">
 * ```
 */
export const Skeleton = ({ className, round, ...props }: SkeletonProps) => (
  <div
    data-slot="skeleton"
    className={cn(
      "bg-accent animate-pulse",
      round ? "rounded-full" : "rounded-md",
      className,
    )}
    aria-hidden={true}
    {...props}
  />
);
