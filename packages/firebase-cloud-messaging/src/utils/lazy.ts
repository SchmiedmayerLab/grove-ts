//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

/**
 * Utility for lazy initialization of values
 */

/**
 * A utility class that implements lazy initialization pattern
 */
export class Lazy<T> {
  private factory: () => T
  private _value?: T

  /**
   * Creates a new Lazy instance
   * @param factory Function that produces the value when first accessed
   */
  constructor(factory: () => T) {
    this.factory = factory
  }

  /**
   * Gets the lazily-initialized value, computing it on first access
   * @returns The computed or cached value
   */
  get value(): T {
    if (this._value === undefined) {
      this._value = this.factory()
    }
    return this._value
  }
}
