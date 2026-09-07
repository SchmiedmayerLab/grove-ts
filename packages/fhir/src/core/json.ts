//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { err, ok, type Result } from './result.js'

export type JsonValue =
  | boolean
  | number
  | string
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

const invalidJson = (path: ReadonlyArray<string | number>): Result<JsonValue> =>
  err(
    'invalid-type',
    'Expected an acyclic JSON value made only of null, booleans, finite numbers, strings, dense arrays, and plain data-property objects.',
    path,
  )

const enumerableDataProperty = (
  object: object,
  key: PropertyKey,
  path: ReadonlyArray<string | number>,
): Result<unknown> => {
  const descriptor = Object.getOwnPropertyDescriptor(object, key)
  if (
    descriptor === undefined ||
    !('value' in descriptor) ||
    descriptor.enumerable !== true
  ) {
    return invalidJson(path)
  }
  const propertyValue: unknown = descriptor.value
  return ok(propertyValue)
}

const cloneJsonArray = (
  value: readonly unknown[],
  keys: readonly PropertyKey[],
  ancestors: WeakSet<object>,
  path: ReadonlyArray<string | number>,
): Result<JsonValue> => {
  if (
    keys.some((key) => typeof key !== 'string') ||
    keys.length !== value.length + 1 ||
    !keys.includes('length')
  ) {
    return invalidJson(path)
  }
  const clone: JsonValue[] = []
  for (let index = 0; index < value.length; index += 1) {
    const property = enumerableDataProperty(value, String(index), [
      ...path,
      index,
    ])
    if (!property.ok) return property
    const nested = cloneJsonNode(property.value, ancestors, [...path, index])
    if (!nested.ok) return nested
    clone.push(nested.value)
  }
  return ok(clone)
}

const cloneJsonObject = (
  value: object,
  keys: readonly PropertyKey[],
  ancestors: WeakSet<object>,
  path: ReadonlyArray<string | number>,
): Result<JsonValue> => {
  const clone: Record<string, JsonValue> = Object.create(null) as Record<
    string,
    JsonValue
  >
  for (const key of keys) {
    if (typeof key !== 'string') return invalidJson(path)
    const property = enumerableDataProperty(value, key, [...path, key])
    if (!property.ok) return property
    const nested = cloneJsonNode(property.value, ancestors, [...path, key])
    if (!nested.ok) return nested
    Object.defineProperty(clone, key, {
      value: nested.value,
      enumerable: true,
      configurable: true,
      writable: true,
    })
  }
  return ok(clone)
}

const cloneJsonNode = (
  value: unknown,
  ancestors: WeakSet<object>,
  path: ReadonlyArray<string | number>,
): Result<JsonValue> => {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return ok(value)
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? ok(value) : invalidJson(path)
  }
  if (typeof value !== 'object' || ancestors.has(value)) {
    return invalidJson(path)
  }

  const array = Array.isArray(value)
  const prototype: unknown = Object.getPrototypeOf(value)
  // Realm-local identity is not a JSON property: browser frames, workers, and
  // VM-backed test runners give ordinary objects a different Object.prototype.
  // A direct prototype whose own prototype is null is still a plain record;
  // class instances retain an extra prototype level and remain rejected.
  const plainRecord =
    prototype === null ||
    (typeof prototype === 'object' && Object.getPrototypeOf(prototype) === null)
  if (!array && !plainRecord) {
    return invalidJson(path)
  }

  ancestors.add(value)
  try {
    const keys = Reflect.ownKeys(value)
    return array ?
        cloneJsonArray(value, keys, ancestors, path)
      : cloneJsonObject(value, keys, ancestors, path)
  } finally {
    ancestors.delete(value)
  }
}

/**
 * Takes an isolated snapshot of caller-owned JSON before validation.
 *
 * Accessors, proxies that throw, cycles, sparse arrays, special object instances, and values
 * JSON cannot represent are rejected. Shared acyclic subgraphs are copied independently, just
 * as they are after a JSON round trip. The function itself never throws for hostile input.
 */
export const cloneJsonValue = (value: unknown): Result<JsonValue> => {
  try {
    return cloneJsonNode(value, new WeakSet(), [])
  } catch {
    return invalidJson([])
  }
}
