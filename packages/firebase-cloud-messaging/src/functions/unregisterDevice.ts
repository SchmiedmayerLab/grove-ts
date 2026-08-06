//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

/**
 * Firebase function for unregistering a device
 */

import { z } from 'zod'
import { type NotificationService } from '../services/notificationService.js'

/**
 * Zod schema for unregister device input validation
 */
export const unregisterDeviceInputSchema = z.object({
  notificationToken: z.string(),
  platform: z.string(),
})

/**
 * Type for unregister device input data
 */
export type UnregisterDeviceInput = z.input<typeof unregisterDeviceInputSchema>

/**
 * Type for unregister device output (undefined)
 */
export type UnregisterDeviceOutput = undefined

/**
 * Create an unregister device function handler
 * @param notificationService The notification service
 * @returns A function that handles device unregistration
 */
export const createUnregisterDeviceHandler =
  (notificationService: NotificationService) =>
  async (
    userId: string,
    data: UnregisterDeviceInput,
  ): Promise<UnregisterDeviceOutput> => {
    const { notificationToken, platform } =
      unregisterDeviceInputSchema.parse(data)
    await notificationService.unregisterDevice(
      userId,
      notificationToken,
      platform,
    )
  }
