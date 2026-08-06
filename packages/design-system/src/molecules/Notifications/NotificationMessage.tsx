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

interface NotificationMessageProps extends ComponentProps<"p"> {}

/**
 * Main content of the notification.
 */
export const NotificationMessage = ({
  className,
  ...props
}: NotificationMessageProps) => {
  const notification = useNotificationContext();
  return (
    <p
      data-slot="notification-message"
      className={cn(
        "flex-1 text-sm",
        notification.isRead && "text-foreground/70",
        className,
      )}
      {...props}
    />
  );
};
