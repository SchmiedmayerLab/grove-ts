//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type Mock } from 'vitest'

/**
 * Test helpers and utilities.
 */

// Add custom test utilities here

/**
 * Sleep for a specified number of milliseconds
 * @param ms Milliseconds to wait
 * @returns Promise that resolves after the specified delay
 */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Create a mock document reference
 * @param id Document ID
 * @param path Document path
 * @param data Document data
 * @returns Mock document reference
 */
interface MockDocumentReference {
  id: string
  path: string
  set: Mock<() => Promise<void>>
  get: Mock<
    () => Promise<{
      id: string
      data: () => Record<string, any>
      exists: boolean
      ref: { path: string }
    }>
  >
  delete: Mock<() => Promise<void>>
}

export const createMockDocRef = (
  id: string,
  path: string,
  data: Record<string, any> = {},
): MockDocumentReference => ({
  id,
  path,
  set: vi.fn().mockResolvedValue(undefined),
  get: vi.fn().mockResolvedValue({
    id,
    data: () => data,
    exists: true,
    ref: { path },
  }),
  delete: vi.fn().mockResolvedValue(undefined),
})
