//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import * as core from '../src/core/index.js'
import * as base from '../src/index.js'
import * as grove from '../src/r4/index.js'

// A profile closes its own object, but that alone does not close the tree: any nested field left
// bound to the permissive base schema would still strip unknown keys instead of rejecting them,
// and a `superRefine` cannot see a key that was already stripped. So every nested field in
// `src/r4` is re-bound, and this test is what makes forgetting one a failure rather than a
// silently permissive branch several levels down.
//
// Shared primitives are deliberately not guarded. `dateTimeSchema` and its siblings are the
// specification's own anchored patterns, and reusing them is the point of deriving at all.

interface ZodNode {
  readonly _zod?: {
    readonly def?: {
      readonly type?: string
      readonly shape?: Record<string, unknown>
      readonly getter?: () => unknown
      readonly innerType?: unknown
      readonly element?: unknown
      readonly in?: unknown
      readonly options?: readonly unknown[]
    }
  }
}

const isNode = (value: unknown): value is ZodNode =>
  typeof value === 'object' && value !== null && '_zod' in value

/**
 * The object-valued base schemas: the ones whose leniency would matter if one leaked through.
 *
 * The root entry point re-exports the profiles as well, so anything the Grove layer owns is
 * subtracted by identity — otherwise every profile would be found inside itself.
 */
const guardedBaseSchemas = (): ReadonlyMap<unknown, string> => {
  const groveOwned = new Set<unknown>([
    ...Object.values(grove),
    ...Object.values(core),
  ])
  const guarded = new Map<unknown, string>()
  for (const [name, value] of Object.entries(base)) {
    if (!name.endsWith('Schema') || !isNode(value)) continue
    if (groveOwned.has(value)) continue
    const type = value._zod?.def?.type
    if (type === 'object' || type === 'lazy' || type === 'pipe') {
      guarded.set(value, name)
    }
  }
  return guarded
}

const findLeaks = (
  entry: string,
  schema: unknown,
  guarded: ReadonlyMap<unknown, string>,
): readonly string[] => {
  const leaks: string[] = []
  const visited = new Set<unknown>()

  const walk = (path: string, node: unknown, depth: number): void => {
    if (!isNode(node) || depth > 14 || visited.has(node)) return
    visited.add(node)

    const name = guarded.get(node)
    if (name !== undefined) {
      leaks.push(`${path} -> ${name}`)
      return
    }

    const definition = node._zod?.def
    if (definition === undefined) return
    switch (definition.type) {
      case 'object':
        for (const [key, value] of Object.entries(definition.shape ?? {})) {
          walk(`${path}.${key}`, value, depth + 1)
        }
        return
      case 'lazy':
        walk(path, definition.getter?.(), depth + 1)
        return
      case 'optional':
      case 'nullable':
      case 'readonly':
      case 'default':
        walk(path, definition.innerType, depth + 1)
        return
      case 'array':
        walk(`${path}[]`, definition.element, depth + 1)
        return
      case 'pipe':
        walk(path, definition.in, depth + 1)
        return
      case 'union':
        ;(definition.options ?? []).forEach((option, index) => {
          walk(`${path}|${index}`, option, depth + 1)
        })
        return
      default:
        return
    }
  }

  walk(entry, schema, 0)
  return leaks
}

const groveSchemas: ReadonlyArray<readonly [string, unknown]> = Object.entries(
  grove,
).filter(([name, value]) => name.startsWith('grove') && isNode(value))

describe('profile graphs', () => {
  it('guards every object-valued base schema', () => {
    // A regression here would quietly narrow what the leak test covers.
    expect(guardedBaseSchemas().size).toBeGreaterThan(150)
  })

  it('exposes every profile schema for inspection', () => {
    expect(groveSchemas.length).toBeGreaterThanOrEqual(20)
  })

  it.each(groveSchemas)('keeps a base schema out of %s', (name, schema) => {
    expect(findLeaks(name, schema, guardedBaseSchemas())).toEqual([])
  })

  it('would notice a base schema if one were reachable', () => {
    // The guard is only worth having if it fires, so it is pointed at a base schema on purpose.
    const leaks = findLeaks(
      'untypedObservationSchema',
      base.untypedObservationSchema,
      guardedBaseSchemas(),
    )
    expect(leaks.length).toBeGreaterThan(0)
  })
})
