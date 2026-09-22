//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  parseAbsoluteUri,
  parseKeyEpoch,
  type AbsoluteUri,
  type KeyEpoch,
  type Result,
} from '../src/core/index.js'
import {
  deriveOpaqueIdentitySystems,
  groveExchangeProtocol,
  validateOpaqueIdentityScope,
} from '../src/mobile/index.js'

const unwrap = <Value>(result: Result<Value>): Value => {
  if (!result.ok) throw new Error(result.issues[0]?.message)
  return result.value
}
const uri = (value: string): AbsoluteUri => unwrap(parseAbsoluteUri(value))
const epoch = (value: string): KeyEpoch => unwrap(parseKeyEpoch(value))

const vectors = groveExchangeProtocol.testVectors
// The normative vectors name their systems under this root; nothing else hard-codes it.
const vectorRoot = vectors.event.system.slice(
  0,
  vectors.event.system.indexOf('/NamingSystem/'),
)

describe('derived deployment identifier systems', () => {
  it('reproduces the vectors identitySystems byte for byte from root, key id and epoch', () => {
    const systems = unwrap(
      deriveOpaqueIdentitySystems(
        uri(vectorRoot),
        vectors.keyId,
        epoch(vectors.epoch),
      ),
    )
    for (const { identityKind, system } of vectors.identitySystems) {
      expect(systems.opaque[identityKind]).toBe(system)
    }
    expect(Object.keys(systems.opaque)).toHaveLength(
      vectors.identitySystems.length,
    )
    expect(systems.event).toBe(vectors.event.system)
    expect(systems.entryNode).toBe(vectors.entryNode.system)
    expect(Object.isFrozen(systems)).toBe(true)
    expect(Object.isFrozen(systems.opaque)).toBe(true)
  })

  it('follows the catalog forms rather than a literal', () => {
    const systems = unwrap(
      deriveOpaqueIdentitySystems(
        uri('https://myheartcounts.stanford.edu/fhir'),
        'store',
        epoch('1'),
      ),
    )
    expect(systems.opaque['source-record']).toBe(
      groveExchangeProtocol.opaqueIdentity.recommendedSystemForm
        .replace('<deployment-root>', 'https://myheartcounts.stanford.edu/fhir')
        .replace('<identity-kind>', 'source-record')
        .replace('<key-id>', 'store')
        .replace('<epoch>', '1'),
    )
    expect(systems.event).toBe(
      groveExchangeProtocol.event.bundleIdentifier.recommendedSystemForm.replace(
        '<deployment-root>',
        'https://myheartcounts.stanford.edu/fhir',
      ),
    )
  })

  it('mints a scope from the derived systems', () => {
    const systems = unwrap(
      deriveOpaqueIdentitySystems(uri(vectorRoot), 'store', epoch('7')),
    )
    const scope = validateOpaqueIdentityScope({
      systems,
      keyId: 'store',
      keyEpoch: epoch('7'),
      secretBase64Url: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY',
      producerInstance: vectors.event.producerInstance,
    })
    expect(scope.ok && scope.value.systems).toEqual(systems)
  })

  it.each([
    ['a trailing slash', 'https://study.example.org/fhir/', 'key', '1'],
    ['a query', 'https://study.example.org/fhir?x=1', 'key', '1'],
    ['a fragment', 'https://study.example.org/fhir#x', 'key', '1'],
    ['a relative root', '/fhir', 'key', '1'],
    ['a key id with spaces', 'https://study.example.org/fhir', 'my key', '1'],
    ['a zero epoch', 'https://study.example.org/fhir', 'key', '0'],
    ['a padded epoch', 'https://study.example.org/fhir', 'key', '01'],
  ])('rejects %s', (_label, root, keyId, keyEpoch) => {
    expect(
      deriveOpaqueIdentitySystems(
        root as AbsoluteUri,
        keyId,
        keyEpoch as KeyEpoch,
      ).ok,
    ).toBe(false)
  })
})
