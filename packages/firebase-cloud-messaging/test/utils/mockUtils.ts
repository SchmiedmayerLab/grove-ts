//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type Mock } from 'vitest'

type MockFunction<R> = Mock<(...args: any[]) => R>

/**
 * Creates a stub function that returns a preset value
 * @param returnValue The value to return when the stub is called
 * @returns A stub function that returns the specified value
 */
export const createStub = <T>(
  returnValue: T,
): MockFunction<T> & {
  resolves: (value?: any) => MockFunction<T>
  rejects: (error?: any) => MockFunction<T>
  callCount: number
  calledOnce: boolean
  called: boolean
  reset: () => void
  mockResolvedValue: (value?: any) => MockFunction<T>
} => {
  const stub = vi.fn().mockReturnValue(returnValue)
  let callCount = 0

  const enhancedStub = stub as MockFunction<T> & {
    resolves: (value?: any) => MockFunction<T>
    rejects: (error?: any) => MockFunction<T>
    callCount: number
    calledOnce: boolean
    called: boolean
    reset: () => void
    mockResolvedValue: (value?: any) => MockFunction<T>
  }

  // Add sinon-like API
  enhancedStub.resolves = (value?: any) => {
    stub.mockResolvedValue(value === undefined ? returnValue : value)
    return enhancedStub
  }

  // Override mockResolvedValue to support empty cals
  const originalMockResolvedValue = stub.mockResolvedValue.bind(stub)
  stub.mockResolvedValue = (value?: any) =>
    originalMockResolvedValue(value === undefined ? undefined : value)

  enhancedStub.rejects = (error: any = new Error('Rejected')) => {
    stub.mockRejectedValue(error)
    return enhancedStub
  }

  // Track calls
  const originalMockImplementation = stub.mockImplementation.bind(stub)
  stub.mockImplementation = (fn) => {
    originalMockImplementation((...args: any[]) => {
      callCount++
      return fn(...args)
    })
    return enhancedStub
  }

  // Add call count properties
  Object.defineProperties(enhancedStub, {
    callCount: {
      get: () => callCount,
    },
    calledOnce: {
      get: () => callCount === 1,
    },
    called: {
      get: () => callCount > 0,
    },
  })

  // Add reset method
  enhancedStub.reset = () => {
    callCount = 0
    stub.mockReset()
  }

  return enhancedStub
}
