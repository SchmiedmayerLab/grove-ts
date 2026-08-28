//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { assertSafeGeneratorInput } from '../scripts/zod-generator-input.mjs'

interface GeneratorElement {
  readonly path: string
  readonly min: unknown
  readonly max: unknown
  readonly type?: ReadonlyArray<Readonly<Record<string, unknown>>>
  readonly contentReference?: unknown
  readonly minValueInteger?: unknown
  readonly maxValueInteger?: unknown
}

const structure = (
  name: string,
  elements: readonly GeneratorElement[] = [{ path: name, min: 0, max: '1' }],
) => ({
  resourceType: 'StructureDefinition',
  name,
  kind: 'complex-type',
  snapshot: { element: elements },
})

const input = (
  structures: ReadonlyMap<string, unknown>,
  declaredTypes: ReadonlySet<string> = new Set(),
) => ({
  structures: new Map(structures),
  valueSets: new Map(),
  codeSystems: new Map(),
  declaredTypes: new Set(declaredTypes),
})

describe('Zod generator package boundary', () => {
  it('admits a safe package while allowing reserved words as quoted property keys', () => {
    const definition = structure('Example', [
      { path: 'Example', min: 0, max: '1' },
      {
        path: 'Example.class',
        min: 0,
        max: '1',
        type: [{ code: 'string' }],
      },
    ])

    expect(() =>
      assertSafeGeneratorInput(input(new Map([['Example', definition]]))),
    ).not.toThrow()
  })

  it.each([
    ['quote', 'Bad";globalThis.compromised=true;//'],
    ['newline', 'Bad\nexport const compromised = true'],
    ['backtick', 'Bad`compromised`'],
    ['template interpolation', 'Bad${globalThis.compromised=true}'],
    ['regular-expression metacharacters', 'Bad.*'],
    ['reserved word', 'class'],
  ])('rejects a %s in a structure/type identifier', (_label, malicious) => {
    expect(() =>
      assertSafeGeneratorInput(
        input(new Map([[malicious, structure(malicious)]])),
      ),
    ).toThrow(/FHIR name/u)
  })

  it.each([
    ['quote', 'Example.bad";globalThis.compromised=true;//'],
    ['newline', 'Example.bad\ncompromised'],
    ['backtick', 'Example.bad`compromised`'],
    ['template interpolation', 'Example.bad${compromised}'],
    ['regular-expression metacharacters', 'Example.bad.*'],
  ])('rejects a %s in an element path before rendering', (_label, path) => {
    const definition = structure('Example', [
      { path: 'Example', min: 0, max: '1' },
      { path, min: 0, max: '1', type: [{ code: 'string' }] },
    ])

    expect(() =>
      assertSafeGeneratorInput(input(new Map([['Example', definition]]))),
    ).toThrow(/FHIR path/u)
  })

  it('rejects an executable choice type code before deriving a property or schema name', () => {
    const definition = structure('Example', [
      { path: 'Example', min: 0, max: '1' },
      {
        path: 'Example.value[x]',
        min: 0,
        max: '1',
        type: [{ code: 'string`);globalThis.compromised=true;//' }],
      },
    ])

    expect(() =>
      assertSafeGeneratorInput(input(new Map([['Example', definition]]))),
    ).toThrow(/type\[0\]\.code/u)
  })

  it.each([
    ['minimum', '0);globalThis.compromised=true;//', '1'],
    ['maximum', 0, '1);globalThis.compromised=true;//'],
  ])(
    'rejects a non-numeric %s cardinality before interpolation',
    (_label, min, max) => {
      const definition = structure('Example', [{ path: 'Example', min, max }])

      expect(() =>
        assertSafeGeneratorInput(input(new Map([['Example', definition]]))),
      ).toThrow(/must be/u)
    },
  )

  it('rejects an unsafe local content-reference path', () => {
    const definition = structure('Example', [
      { path: 'Example', min: 0, max: '1' },
      {
        path: 'Example.node',
        min: 0,
        max: '*',
        contentReference: '#Example.node.*',
      },
    ])

    expect(() =>
      assertSafeGeneratorInput(input(new Map([['Example', definition]]))),
    ).toThrow(/contentReference/u)
  })

  it('rejects distinct release paths that collapse to one generated identifier', () => {
    const parent = structure('Foo', [
      { path: 'Foo', min: 0, max: '1' },
      {
        path: 'Foo.bar',
        min: 0,
        max: '1',
        type: [{ code: 'BackboneElement' }],
      },
    ])
    const collidingRoot = structure('FooBar')

    expect(() =>
      assertSafeGeneratorInput(
        input(
          new Map([
            ['Foo', parent],
            ['FooBar', collidingRoot],
          ]),
          new Set(['FooBar']),
        ),
      ),
    ).toThrow(/identifier fooBarSchema collides/u)
  })
})
