//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { createContext, useContext } from "react";

export interface NotificationContextType {
  /**
   * Indicates whether a notification has been read, affects styling.
   */
  isRead: boolean;
}

export const NotificationContext =
  createContext<NotificationContextType | null>(null);

/**
 * Returns NotificationContextType from context and validates its presence.
 * @throws {Error} When used outside NotificationRoot..
 */
export const useNotificationContext = () => {
  const notification = useContext(NotificationContext);
  if (!notification) {
    throw new Error("Missing NotificationContext provider.");
  }
  return notification;
};
