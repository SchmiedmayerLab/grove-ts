//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { useGroveContext } from "@/GroveProvider";
import {
  NotificationRoot,
  type NotificationRootProps,
} from "@/molecules/Notifications/NotificationRoot";

interface NotificationLinkProps extends Omit<NotificationRootProps, "asChild"> {
  href: string;
}

/**
 * Composes {@link NotificationRoot} to provide a linkable notification.
 */
export const NotificationLink = ({
  notification,
  children,
  href,
}: NotificationLinkProps) => {
  const {
    router: { Link },
  } = useGroveContext();
  return (
    <NotificationRoot asChild notification={notification}>
      <Link
        href={href}
        data-slot="notification-link"
        className="hover:bg-accent/50 cursor-pointer transition"
      >
        {children}
      </Link>
    </NotificationRoot>
  );
};
