//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import * as r4 from '../src/zod/r4/index.js'

const DIRECTORY = join(process.cwd(), 'fixtures/conformance/resources')

/** The schema for a resource type, when the generated surface covers it. */
const schemaFor = (
  resourceType: string,
): { parse: (value: unknown) => unknown } | undefined => {
  const name = `${resourceType.charAt(0).toLowerCase()}${resourceType.slice(1)}Schema`
  const exports = r4 as unknown as Record<string, unknown>
  const schema = exports[name]
  return schema === undefined ? undefined : (
      (schema as { parse: (value: unknown) => unknown })
    )
}

describe('generated schemas against the published conformance fixtures', () => {
  const files = readdirSync(DIRECTORY).filter((file) => file.endsWith('.json'))

  it('has fixtures to check', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files)('accepts %s', (file) => {
    const bundle = JSON.parse(readFileSync(join(DIRECTORY, file), 'utf8')) as {
      resourceType: string
      entry?: Array<{ resource: unknown }>
    }
    const resources =
      bundle.resourceType === 'Bundle' ?
        (bundle.entry ?? []).map(
          (entry: { resource: unknown }) => entry.resource,
        )
      : [bundle]
    for (const resource of resources) {
      const schema = schemaFor(
        (resource as { resourceType: string }).resourceType,
      )
      if (!schema) continue
      expect(() => schema.parse(resource)).not.toThrow()
    }
  })
})
