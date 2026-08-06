//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import type { ComponentProps } from "react";
import { useNotificationContext } from "@/molecules/Notifications/NotificationContext";
import { cn } from "@/utils/className";

interface NotificationTitleProps extends ComponentProps<"div"> {}

/**
 * Title component for notification.
 * Adjusts its styling based on notification read status from context.
 *
 * @example
 * ```ts
 * <NotificationTitle>New message received</NotificationTitle>
 * ```
 */
export const NotificationTitle = ({
  className,
  ...props
}: NotificationTitleProps) => {
  const notification = useNotificationContext();
  return (
    <h5
      data-slot="notification-title"
      className={cn(
        "flex-1 text-sm",
        notification.isRead ?
          "text-foreground/70 font-medium"
        : "font-semibold",
        className,
      )}
      {...props}
    />
  );
};
