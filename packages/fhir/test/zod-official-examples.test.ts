//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  EXAMPLE_PACKAGES,
  fhirPackage,
} from '../scripts/generate-zod-schemas.mjs'
import * as r4 from '../src/zod/r4/index.js'
import * as r4b from '../src/zod/r4b/index.js'

/**
 * Examples the release publishes that do not satisfy the release's own definitions.
 *
 * Each entry states why, and is a claim about the corpus rather than a licence to weaken a
 * schema. The list is asserted to stay small so it cannot quietly become a place to put
 * failures whose cause has not been established.
 */
// Defects in the published corpora themselves, keyed by the defect and listing the files it
// spans. Keyed by cause rather than by file so the cap below counts distinct specification
// defects, not the number of files each happens to touch; `*` matches any run of characters.
const NONCONFORMANT_EXAMPLES: Readonly<Record<string, readonly string[]>> = {
  // Questionnaire.item.linkId is 1..1, and these nested items omit it.
  'nested items omit the required linkId': ['Questionnaire-qs1.json'],
  // SearchParameter.base is 1..*, and the generated extension stubs carry none.
  'extension stubs omit the required base': [
    'SearchParameter-*-extensions-*.json',
  ],
  // ImplementationGuide.name and .status are both 1..1 and this descriptor states neither.
  'the core IG descriptor omits name and status': [
    'ImplementationGuide-fhir.json',
    'ig-r4*.json',
  ],
  // status is 1..1 on both CodeSystem and ValueSet; the catalogType pair states neither, and
  // the value-set bundle carries that same pair.
  'the catalogType terminology omits the required status': [
    '*catalogType.json',
    'Bundle-valuesets.json',
  ],
}

const matches = (pattern: string, file: string): boolean =>
  pattern.includes('*') ?
    new RegExp(
      `^${pattern
        .split('*')
        .map((part) => part.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`))
        .join('.*')}$`,
      'u',
    ).test(file)
  : pattern === file

const isNonconformant = (file: string): boolean =>
  Object.values(NONCONFORMANT_EXAMPLES).some((patterns) =>
    patterns.some((pattern) => matches(pattern, file)),
  )

const MODULES: { readonly r4: unknown; readonly r4b: unknown } = { r4, r4b }

interface Schema {
  safeParse: (value: unknown) => { success: boolean }
}

/**
 * Validate each release against its own published examples.
 *
 * A corpus this project did not author is the only check that the generated schemas describe
 * FHIR rather than describing the fixtures. Every schema defect found in review — an abstract
 * `Resource` stamped with a literal `resourceType`, a dropped `id` on backbones, a required
 * array satisfied by `[]` — was invisible to the project's own fixtures and immediately visible
 * here.
 */
// The count travels with the release: it is the lowest number of resources each corpus is known
// to cover, so a naming change that stopped resolving most schemas fails rather than passing.
describe.each([
  ['r4', 130],
  ['r4b', 138],
] as const)('the %s published examples', (release, expectedCoverage) => {
  let directory: string
  const schemas = MODULES[release] as Record<string, unknown>

  beforeAll(async () => {
    directory = await fhirPackage(EXAMPLE_PACKAGES[release])
  }, 180_000)

  const schemaFor = (resourceType: string): Schema | undefined => {
    const name = `${resourceType.charAt(0).toLowerCase()}${resourceType.slice(1)}Schema`
    const schema = schemas[name]
    return schema === undefined ? undefined : (schema as Schema)
  }

  /** A resource and everything nested inside it that carries its own resourceType. */
  const nested = (resource: unknown): Array<{ resourceType: string }> => {
    if (typeof resource !== 'object' || resource === null) return []
    const value = resource as {
      resourceType?: string
      entry?: Array<{ resource?: unknown }>
      contained?: unknown[]
    }
    const found =
      value.resourceType === undefined ?
        []
      : [value as { resourceType: string }]
    for (const entry of value.entry ?? []) found.push(...nested(entry.resource))
    for (const contained of value.contained ?? [])
      found.push(...nested(contained))
    return found
  }

  it('accepts every example of a resource type the package models', () => {
    const failures: string[] = []
    let checked = 0
    for (const file of readdirSync(directory)) {
      if (!file.endsWith('.json')) continue
      let resource: unknown
      try {
        resource = JSON.parse(readFileSync(join(directory, file), 'utf8'))
      } catch {
        continue
      }
      // Bundle entries and contained resources count: fix 1 made those slots open, so a defect
      // inside one would otherwise never be exercised.
      for (const candidate of nested(resource)) {
        const schema = schemaFor(candidate.resourceType)
        if (schema === undefined) continue
        checked += 1
        if (schema.safeParse(candidate).success) continue
        if (isNonconformant(file)) continue
        failures.push(`${file} (${candidate.resourceType})`)
      }
    }
    expect(failures).toEqual([])
    // Pinned, not a floor: a naming change that stopped resolving most schemas would otherwise
    // leave this green while checking almost nothing.
    expect(checked).toBeGreaterThanOrEqual(expectedCoverage)
    expect(Object.keys(NONCONFORMANT_EXAMPLES).length).toBeLessThan(5)
  }, 180_000)
})
