//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { jest } from '@jest/globals'

global.jest = jest

// Custom Jest matchers for improved readability
expect.extend({
  toBeObject(received) {
    const pass =
      received !== null &&
      typeof received === 'object' &&
      !Array.isArray(received)
    if (pass) {
      return {
        message: () => `expected ${received} not to be an object`,
        pass: true,
      }
    } else {
      return {
        message: () => `expected ${received} to be an object`,
        pass: false,
      }
    }
  },
})
