//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { groveExchangeProtocol } from '../src/contract/measurement-catalog.generated.js'
import {
  isSemanticallyEqual,
  parseExchangeGraph,
  parseRetractionEvent,
  retractionTargets,
} from '../src/r4/index.js'

interface CorpusEvent {
  readonly path: string
  readonly sha256: string
  readonly eventIdentity: { readonly system: string; readonly value: string }
}

interface CorpusSequence {
  readonly id: string
  readonly steps: ReadonlyArray<{ readonly event: string }>
}

interface CorpusSequences {
  readonly sequences: readonly CorpusSequence[]
}

const corpusRoot = new URL(
  '../fixtures/conformance/receiver-lifecycle/',
  import.meta.url,
)
const readCorpus = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(name, corpusRoot), 'utf8'))

const { events } = readCorpus('events.json') as {
  readonly events: Record<string, CorpusEvent>
}
const sequences = [
  ...(readCorpus('sequences.json') as CorpusSequences).sequences,
  ...(readCorpus('revision-sequences.json') as CorpusSequences).sequences,
]
const bytesOf = (alias: string): Uint8Array => {
  const event = events[alias]
  if (event === undefined) throw new Error(`Unknown corpus event ${alias}.`)
  return new Uint8Array(readFileSync(new URL(event.path, corpusRoot)))
}
const identityOf = (alias: string): string => {
  const event = events[alias]
  if (event === undefined) throw new Error(`Unknown corpus event ${alias}.`)
  return `${event.eventIdentity.system}|${event.eventIdentity.value}`
}
// Equality is decided over tokens: the reformatted replay is the exact retry, every
// other replay under a reused identifier is different content.
const expectedEqual = (left: string, right: string): boolean =>
  left === right ||
  (identityOf(left) === identityOf(right) &&
    [left, right].every((alias) =>
      ['original', 'reformatted-retry'].includes(alias),
    ))

const unwrap = <Value>(
  result: { ok: true; value: Value } | { ok: false },
): Value => {
  if (!result.ok) throw new Error('Expected an accepted value.')
  return result.value
}

describe('receiver-lifecycle corpus', () => {
  it('carries the exact pinned fixture bytes', () => {
    for (const [alias, event] of Object.entries(events)) {
      expect([
        alias,
        createHash('sha256').update(bytesOf(alias)).digest('hex'),
      ]).toEqual([alias, event.sha256])
    }
    expect(
      Buffer.compare(bytesOf('original'), bytesOf('reformatted-retry')),
    ).not.toBe(0)
  })

  it('parses every event as the graph kind it claims', () => {
    for (const alias of Object.keys(events)) {
      const text = Buffer.from(bytesOf(alias)).toString('utf8')
      const parsed =
        alias === 'retraction' ?
          parseRetractionEvent(JSON.parse(text))
        : parseExchangeGraph(JSON.parse(text))
      expect([alias, parsed.ok]).toEqual([alias, true])
    }
  })

  it('decides the exact retry over lossless tokens, never bytes', () => {
    expect(
      isSemanticallyEqual(bytesOf('original'), bytesOf('reformatted-retry')),
    ).toEqual({
      ok: true,
      value: true,
    })
    expect(
      isSemanticallyEqual(bytesOf('original'), bytesOf('lexeme-retry')),
    ).toEqual({
      ok: true,
      value: false,
    })
    expect(
      isSemanticallyEqual(bytesOf('original'), bytesOf('altered-retry')),
    ).toEqual({
      ok: true,
      value: false,
    })
    expect(groveExchangeProtocol.payload.equality.vectors).toContain(
      'reformatted-retry',
    )
  })

  it.each(sequences.map((sequence) => [sequence.id, sequence] as const))(
    'agrees with every equality decision in %s',
    (_id, sequence) => {
      const delivered: string[] = []
      for (const step of sequence.steps) {
        for (const prior of delivered) {
          expect({
            pair: `${prior} vs ${step.event}`,
            equality: isSemanticallyEqual(bytesOf(prior), bytesOf(step.event)),
          }).toEqual({
            pair: `${prior} vs ${step.event}`,
            equality: { ok: true, value: expectedEqual(prior, step.event) },
          })
        }
        delivered.push(step.event)
      }
    },
  )

  it('compares decimal lexemes as text and member order as irrelevant', () => {
    expect(isSemanticallyEqual('{"a":72}', '{"a":72.0}')).toEqual({
      ok: true,
      value: false,
    })
    expect(isSemanticallyEqual('{"a":1e2}', '{"a":100}')).toEqual({
      ok: true,
      value: false,
    })
    expect(
      isSemanticallyEqual('{"a":1,"b":[1,2]}', ' {"b" : [1, 2], "a":1}'),
    ).toEqual({
      ok: true,
      value: true,
    })
    expect(isSemanticallyEqual('{"a":"\\u00e9"}', '{"a":"é"}')).toEqual({
      ok: true,
      value: true,
    })
    expect(isSemanticallyEqual('[1,2]', '[2,1]')).toEqual({
      ok: true,
      value: false,
    })
    expect(isSemanticallyEqual('{"a":null}', '{"a":false}')).toEqual({
      ok: true,
      value: false,
    })
    expect(isSemanticallyEqual('{"a":1,"a":2}', '{"a":2}').ok).toBe(false)
    expect(isSemanticallyEqual('{"a":1} x', '{"a":1}').ok).toBe(false)
    expect(isSemanticallyEqual('{"a":01}', '{"a":1}').ok).toBe(false)
    expect(isSemanticallyEqual(new Uint8Array([0xff]), '1').ok).toBe(false)
    expect(
      isSemanticallyEqual('['.repeat(600) + ']'.repeat(600), '[]').ok,
    ).toBe(false)
  })

  it('types the retraction targets the retraction fixture names', () => {
    const original = unwrap(
      parseExchangeGraph(
        JSON.parse(Buffer.from(bytesOf('original')).toString('utf8')),
      ),
    )
    const retraction = unwrap(
      parseRetractionEvent(
        JSON.parse(Buffer.from(bytesOf('retraction')).toString('utf8')),
      ),
    )
    const targets = unwrap(retractionTargets(original))
    const provenance = retraction.entry.find(
      ({ resource }) => resource.resourceType === 'Provenance',
    )?.resource
    if (provenance?.resourceType !== 'Provenance')
      throw new Error('No Provenance.')
    for (const named of provenance.target) {
      const matching = targets.find(
        ({ identifier }) =>
          identifier.system === named.identifier?.system &&
          identifier.value === named.identifier.value,
      )
      expect(matching).toBeDefined()
      expect(matching?.resourceType).toBe(named.type)
      expect(matching?.role).toBe(
        named.extension?.find(({ url }) =>
          url?.endsWith('grove-retraction-target-role'),
        )?.valueCode,
      )
    }
    const roles = Object.keys(
      groveExchangeProtocol.lifecycle.retraction.targetRoles,
    )
    for (const target of targets) {
      expect(roles).toContain(target.role)
      expect(
        groveExchangeProtocol.lifecycle.retraction.targetRoles[target.role]
          .resourceTypes,
      ).toContain(target.resourceType)
    }
  })
})
