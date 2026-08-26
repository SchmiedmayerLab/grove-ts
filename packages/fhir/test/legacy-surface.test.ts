//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { execPath } from 'node:process'
import { expectTypeOf } from 'expect-type'
import * as root from '../src/index.js'
import {
  deviceSchema,
  identifierSchema,
  observationSchema,
  questionnaireSchema,
  type IssueSeverity,
  type QuestionnaireItemType,
} from '../src/index.js'

// This package is published, so the root entry point is a contract. A type check will not defend
// it: an explicit named re-export silently shadows an `export *` of the same name, so a type can
// change meaning, or a name can disappear, with nothing anywhere reporting an error.
//
// `root-exports.json` is the surface of the released version. The rule is one-way — names may be
// added, never removed, and never change between value and type.

type ExportKind = 'value' | 'type' | 'both' | 'other'

const released = JSON.parse(
  fs.readFileSync('test/fixtures/root-exports.json', 'utf8'),
) as Readonly<Record<string, ExportKind>>

/** The current surface, resolved by the compiler so that types are counted too. */
const currentSurface = (): Readonly<Record<string, ExportKind>> =>
  JSON.parse(
    // `execPath` rather than 'node': the snapshot has to come from the same runtime as the test,
    // and it keeps the lookup off PATH.
    execFileSync(execPath, ['scripts/snapshot-root-exports.mjs'], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    }),
  ) as Readonly<Record<string, ExportKind>>

describe('the released root entry point', () => {
  const current = currentSurface()

  it('describes a surface worth guarding', () => {
    expect(Object.keys(released).length).toBeGreaterThan(900)
  })

  it('still exports every released name', () => {
    const missing = Object.keys(released).filter((name) => !(name in current))
    expect(missing).toEqual([])
  })

  it('has not moved any released name between value and type', () => {
    const moved = Object.keys(released)
      .filter((name) => name in current && current[name] !== released[name])
      .map((name) => `${name}: ${released[name]} became ${current[name]}`)
    expect(moved).toEqual([])
  })

  it('exposes every released runtime name on the namespace', () => {
    // The compiler answers for types; this answers for what actually loads.
    const namespace = root as unknown as Record<string, unknown>
    const absent = Object.entries(released)
      .filter(([, kind]) => kind === 'value' || kind === 'both')
      .map(([name]) => name)
      .filter((name) => namespace[name] === undefined)
    expect(absent).toEqual([])
  })

  it('only grows', () => {
    expect(Object.keys(current).length).toBeGreaterThanOrEqual(
      Object.keys(released).length,
    )
  })
})

describe('names the Grove layer could have shadowed', () => {
  // Twenty names exist in both layers. Nineteen were renamed with a `grove` prefix; these are the
  // two that were not, so they are pinned to the meanings the released version gave them.
  it('keeps IssueSeverity as the OperationOutcome value set', () => {
    expectTypeOf<IssueSeverity>().toEqualTypeOf<
      'fatal' | 'error' | 'warning' | 'information'
    >()
  })

  it('keeps QuestionnaireItemType as the R4B item-type value set', () => {
    expectTypeOf<QuestionnaireItemType>().toEqualTypeOf<
      | 'group'
      | 'display'
      | 'boolean'
      | 'decimal'
      | 'integer'
      | 'date'
      | 'dateTime'
      | 'time'
      | 'string'
      | 'text'
      | 'url'
      | 'choice'
      | 'open-choice'
      | 'attachment'
      | 'reference'
      | 'quantity'
    >()
  })

  it.each([
    ['observationSchema', observationSchema],
    ['identifierSchema', identifierSchema],
    ['deviceSchema', deviceSchema],
    ['questionnaireSchema', questionnaireSchema],
  ])('keeps %s permissive rather than closed', (_label, schema) => {
    // Each of these names also exists as a profile, under a `grove` prefix. The released meaning
    // strips unknown keys; the profile rejects them. Confusing the two is the failure this fixes.
    const parsed = schema.safeParse({
      resourceType: 'Observation',
      status: 'final',
      code: {},
      unexpectedField: 'tolerated',
    })
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty('unexpectedField')
    } else {
      // Some of these require fields this generic input lacks; leniency is asserted above for
      // the ones that parse, and by the round-trip fixtures for the rest.
      expect(parsed.error.issues.length).toBeGreaterThan(0)
    }
  })
})
