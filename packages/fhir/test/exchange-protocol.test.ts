//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  parseAbsoluteUri,
  parseEntryNodeOrdinal,
  parseEventSequence,
  parseKeyEpoch,
  type AbsoluteUri,
  type EntryNodeOrdinal,
  type EventSequence,
  type Result,
} from '../src/core/index.js'
import {
  containsIsolatedSurrogate,
  deriveConformanceVectorOpaqueIdentifier,
} from '../src/mobile/identity.js'
import {
  createEntryIdentity,
  deriveEntryFullUrl,
  deriveEntryNodeIdentifier,
  deriveEntryNodeValue,
  deriveEventIdentifier,
  deriveOpaqueIdentifier,
  entryIdentifierName,
  encodeLengthFramedUtf8,
  groveExchangeProtocol,
  isEntryNodeIdentityValue,
  isEventIdentityValue,
  isOpaqueIdentityScope,
  isOpaqueIdentityValue,
  validateOpaqueIdentityScope,
  type OpaqueIdentityComponents,
  type OpaqueIdentityKind,
  type OpaqueIdentityScopeInput,
  type OpaqueIdentitySystems,
} from '../src/mobile/index.js'
import {
  deriveProviderOpaqueIdentifier,
  providerCoordinateIssue,
} from '../src/providers/identity.js'

const unwrap = <Value>(result: Result<Value>): Value => {
  if (!result.ok) throw new Error(result.issues[0]?.message)
  return result.value
}

const uri = (value: string): AbsoluteUri => unwrap(parseAbsoluteUri(value))
const sequence = (value: string): EventSequence =>
  unwrap(parseEventSequence(value))
const ordinal = (value: string): EntryNodeOrdinal =>
  unwrap(parseEntryNodeOrdinal(value))

const vectors = groveExchangeProtocol.testVectors
const vectorSystems = Object.fromEntries(
  vectors.identitySystems.map(({ identityKind, system }) => [
    identityKind,
    uri(system),
  ]),
) as OpaqueIdentitySystems

const conformanceScope: OpaqueIdentityScopeInput = {
  systems: {
    opaque: vectorSystems,
    event: uri(vectors.event.system),
    entryNode: uri(vectors.entryNode.system),
  },
  keyId: vectors.keyId,
  keyEpoch: unwrap(parseKeyEpoch(vectors.epoch)),
  secretBase64Url: Buffer.from(vectors.keyHex, 'hex').toString('base64url'),
  producerInstance: vectors.event.producerInstance,
}

const runtimeInput: OpaqueIdentityScopeInput = {
  ...conformanceScope,
  secretBase64Url: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY',
}
const runtimeScope = unwrap(validateOpaqueIdentityScope(runtimeInput))

const identityVectors = vectors.identities
const invalidIdentityVectors = vectors.invalidIdentities

const deriveVectorIdentity = <Kind extends OpaqueIdentityKind>(
  kind: Kind,
  components: OpaqueIdentityComponents[Kind],
) => deriveConformanceVectorOpaqueIdentifier(conformanceScope, kind, components)

describe('Grove exchange protocol identity', () => {
  it('fails closed without throwing at every untyped identity boundary', () => {
    const invalidValues = [null, undefined, 42, 'wrong-shape', Symbol('x')]
    for (const invalid of invalidValues) {
      const operations = [
        () => validateOpaqueIdentityScope(invalid as never),
        () => encodeLengthFramedUtf8(invalid as never),
        () => deriveEntryFullUrl(invalid as never),
        () => entryIdentifierName(invalid as never),
        () => createEntryIdentity(invalid as never),
        () =>
          deriveOpaqueIdentifier(invalid as never, 'source-record', [
            'healthkit',
            'type',
            'scope-system',
            'scope-value',
            'native-id',
          ]),
        () =>
          deriveOpaqueIdentifier(
            runtimeScope,
            'source-record',
            invalid as never,
          ),
        () => deriveEventIdentifier(runtimeScope, invalid as never),
        () => deriveEntryNodeIdentifier(runtimeScope, invalid as never),
        () => deriveEntryNodeValue(invalid as never),
      ]
      for (const operation of operations) {
        expect(operation).not.toThrow()
        expect(operation().ok).toBe(false)
      }
    }

    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() => validateOpaqueIdentityScope(cyclic as never)).not.toThrow()
    expect(validateOpaqueIdentityScope(cyclic as never).ok).toBe(false)
  })

  it('accepts only the handle it validated and keeps its key private', () => {
    expect(isOpaqueIdentityScope(runtimeScope)).toBe(true)
    expect(Object.isFrozen(runtimeScope)).toBe(true)
    expect(runtimeScope).not.toHaveProperty('secretBase64Url')
    expect(JSON.stringify(runtimeScope)).not.toContain(
      runtimeInput.secretBase64Url,
    )
    const forged = { ...runtimeScope }
    expect(isOpaqueIdentityScope(forged)).toBe(false)
    expect(
      deriveOpaqueIdentifier(forged, 'source-record', [
        'healthkit',
        'HKQuantityTypeIdentifierHeartRate',
        'https://study.example.org/fhir/NamingSystem/participant',
        'participant-1',
        'native-1',
      ]),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'invalid-identifier', path: ['scope'] }],
    })
    expect(deriveEventIdentifier(forged, sequence('1')).ok).toBe(false)
  })

  it('keeps a reused scope handle immune to mutation', () => {
    const components: OpaqueIdentityComponents['source-record'] = [
      'healthkit',
      'HKQuantityTypeIdentifierHeartRate',
      'https://study.example.org/fhir/NamingSystem/participant',
      'participant-1',
      'native-1',
    ]
    const before = unwrap(
      deriveOpaqueIdentifier(runtimeScope, 'source-record', components),
    )
    const event = unwrap(deriveEventIdentifier(runtimeScope, sequence('1')))
    const mutable = runtimeScope as { keyId: string; secret?: Uint8Array }
    for (const mutate of [
      () => {
        mutable.keyId = 'TAMPERED'
      },
      () => {
        mutable.secret = new Uint8Array(32)
      },
    ]) {
      try {
        mutate()
      } catch {
        // A frozen handle rejects the write; a sloppy-mode caller silently keeps the original.
      }
    }
    expect(runtimeScope.keyId).toBe(runtimeInput.keyId)
    expect(
      deriveOpaqueIdentifier(runtimeScope, 'source-record', components),
    ).toEqual({ ok: true, value: before })
    expect(deriveEventIdentifier(runtimeScope, sequence('1'))).toEqual({
      ok: true,
      value: event,
    })
  })

  it.each(identityVectors)(
    'matches the shared $identityKind HMAC vector byte for byte',
    (vector) => {
      const derived = deriveVectorIdentity(
        vector.identityKind,
        vector.components,
      )
      expect(derived).toMatchObject({
        ok: true,
        value: {
          value: vector.value,
          system: vectorSystems[vector.identityKind],
        },
      })
    },
  )

  it('matches the shared event, entry-node, and fullUrl vectors', () => {
    const event = unwrap(
      deriveEventIdentifier(runtimeScope, sequence(vectors.event.sequence)),
    )
    expect(event).toEqual({
      system: vectors.event.system,
      value: vectors.event.value,
      role: 'event',
    })

    const node = unwrap(
      deriveEntryNodeIdentifier(runtimeScope, {
        event,
        role: vectors.entryNode.role,
        ordinal: ordinal(vectors.entryNode.ordinal),
      }),
    )
    expect(node).toEqual({
      system: vectors.entryNode.system,
      value: vectors.entryNode.value,
      role: 'entry-node',
    })
    expect(deriveEntryFullUrl(node)).toEqual({
      ok: true,
      value: vectors.entryNode.fullUrl,
    })
    const fullUrlVector = vectors.fullUrls[0]
    expect(
      deriveEntryFullUrl({
        system: uri(fullUrlVector.system),
        value: fullUrlVector.value,
      }),
    ).toEqual({ ok: true, value: fullUrlVector.fullUrl })
  })

  it('length-frames tuples without delimiter collisions', () => {
    expect(unwrap(encodeLengthFramedUtf8(['']))).toEqual(
      Uint8Array.from([0, 0, 0, 0]),
    )
    expect(unwrap(encodeLengthFramedUtf8(['a', 'bc']))).not.toEqual(
      unwrap(encodeLengthFramedUtf8(['ab', 'c'])),
    )
    expect(unwrap(encodeLengthFramedUtf8(['a|b', 'c']))).not.toEqual(
      unwrap(encodeLengthFramedUtf8(['a', 'b|c'])),
    )
  })

  it('returns an out-of-range Result when the runtime cannot allocate UTF-8 bytes', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'TextEncoder')
    Object.defineProperty(globalThis, 'TextEncoder', {
      configurable: true,
      value: class {
        encode(): Uint8Array {
          throw new RangeError('simulated allocation failure')
        }
      },
    })
    try {
      expect(() => encodeLengthFramedUtf8(['field'])).not.toThrow()
      expect(encodeLengthFramedUtf8(['field'])).toMatchObject({
        ok: false,
        issues: [{ code: 'out-of-range', path: [0] }],
      })
    } finally {
      if (original === undefined) {
        Reflect.deleteProperty(globalThis, 'TextEncoder')
      } else {
        Object.defineProperty(globalThis, 'TextEncoder', original)
      }
    }
  })

  it('fails closed for the public test key at public APIs and malformed key spaces', () => {
    expect(validateOpaqueIdentityScope(conformanceScope).ok).toBe(false)
    expect(
      validateOpaqueIdentityScope({
        ...runtimeInput,
        keyUse: 'conformance-testing',
      } as never).ok,
    ).toBe(false)
    const sourceVector = identityVectors[0]
    expect(
      deriveConformanceVectorOpaqueIdentifier(
        runtimeInput,
        sourceVector.identityKind,
        sourceVector.components as never,
      ).ok,
    ).toBe(false)
    expect(
      validateOpaqueIdentityScope({
        ...runtimeInput,
        systems: {
          ...runtimeInput.systems,
          opaque: {
            ...runtimeInput.systems.opaque,
            'source-record': runtimeInput.systems.opaque['source-output'],
          },
        },
      }).ok,
    ).toBe(false)
    const withWrongKinds = {
      ...runtimeInput,
      systems: {
        ...runtimeInput.systems,
        opaque: Object.fromEntries(
          Object.entries(runtimeInput.systems.opaque).map(
            ([kind, system], index) => [
              index === 0 ? 'unknown-kind' : kind,
              system,
            ],
          ),
        ),
      },
    } as unknown as OpaqueIdentityScopeInput
    expect(validateOpaqueIdentityScope(withWrongKinds).ok).toBe(false)
    for (const badSystem of [
      'https://例.example/identity',
      'https://example.org/%ZZ',
      'https://example.org/identity value',
    ]) {
      expect(
        validateOpaqueIdentityScope({
          ...runtimeInput,
          systems: { ...runtimeInput.systems, event: badSystem as AbsoluteUri },
        }).ok,
      ).toBe(false)
    }
  })

  it.each([
    { systems: null },
    { systems: { ...runtimeInput.systems, opaque: [] } },
    { keyId: 42 },
    { keyId: 'not a token' },
    { keyEpoch: 1 },
    { keyEpoch: '0' },
    { producerInstance: 42 },
    { producerInstance: runtimeInput.producerInstance.toUpperCase() },
    { secretBase64Url: 42 },
    { secretBase64Url: '*' },
    { secretBase64Url: 'A' },
    { secretBase64Url: 'AA' },
    { systems: { ...runtimeInput.systems, event: '/relative' } },
    { systems: { ...runtimeInput.systems, entryNode: '/relative' } },
  ])('rejects malformed scope field set %#', (replacement) => {
    expect(
      validateOpaqueIdentityScope({
        ...runtimeInput,
        ...replacement,
      } as never).ok,
    ).toBe(false)
  })

  it('rejects unknown identity kinds and every wrong component arity at runtime', () => {
    const source = identityVectors.find(
      ({ identityKind }) => identityKind === 'source-output',
    )
    if (source === undefined) throw new Error('Missing source-output vector.')
    expect(
      deriveOpaqueIdentifier(
        runtimeScope,
        'unknown-kind' as OpaqueIdentityKind,
        source.components as never,
      ).ok,
    ).toBe(false)
    expect(
      deriveOpaqueIdentifier(
        runtimeScope,
        'source-output',
        source.components.slice(0, -1) as never,
      ).ok,
    ).toBe(false)
    expect(
      deriveOpaqueIdentifier(runtimeScope, 'source-output', [
        ...source.components,
        'extra',
      ] as never).ok,
    ).toBe(false)
  })

  it('rejects non-string identity components after validating their arity', () => {
    const source = identityVectors.find(
      ({ identityKind }) => identityKind === 'source-output',
    )
    if (source === undefined) throw new Error('Missing source-output vector.')
    const components: unknown[] = [...source.components]
    components[1] = 42
    expect(
      deriveOpaqueIdentifier(
        runtimeScope,
        'source-output',
        components as never,
      ),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'invalid-identifier', path: ['components'] }],
    })
  })

  it('rejects empty or malformed Unicode only at the typed opaque-identity boundary', () => {
    for (const vector of identityVectors) {
      for (const invalid of ['', 'prefix\ud800suffix']) {
        const components: string[] = [...vector.components]
        components[0] = invalid
        const result = deriveOpaqueIdentifier(
          runtimeScope,
          vector.identityKind,
          components as never,
        )
        expect(result.ok).toBe(false)
        if (!result.ok) {
          expect(result.issues[0]?.path).toEqual(['components', 0])
        }
      }
    }
  })

  it('rejects provider coordinates under every generic source identity kind', () => {
    const invalidProviderCoordinates = [
      {
        kind: 'source-record',
        components: [
          'oura',
          'daily_activity',
          'https://accounts.example.org',
          'patient-001',
          'activity-001',
        ],
      },
      {
        kind: 'source-output',
        components: [
          'withings',
          'getmeas:9+10',
          'https://accounts.example.org',
          'patient-001',
          '17348211',
          'blood-pressure-panel',
          'single',
        ],
      },
      {
        kind: 'source-artifact',
        components: [
          'google-health-api',
          'heart-rate',
          'https://accounts.example.org',
          'patient-001',
          'recording-001',
          'provider-recording',
          '0',
        ],
      },
    ] as const

    for (const { kind, components } of invalidProviderCoordinates) {
      expect(
        deriveProviderOpaqueIdentifier(runtimeScope, kind, components as never),
      ).toMatchObject({
        ok: false,
        issues: [{ code: 'invalid-code', path: ['components', 0] }],
      })
    }
    expect(
      providerCoordinateIssue('provider-record', [
        'not-a-provider',
        'type',
        's',
        'v',
        'id',
      ]),
    ).toMatchObject({ code: 'invalid-code' })
  })

  it('rejects every shared invalid opaque-identity vector', () => {
    expect(invalidIdentityVectors).toHaveLength(4)
    for (const vector of invalidIdentityVectors) {
      const result =
        vector.expectedError === 'provider-kind-required' ?
          deriveProviderOpaqueIdentifier(
            runtimeScope,
            vector.identityKind,
            vector.components as never,
          )
        : deriveOpaqueIdentifier(
            runtimeScope,
            vector.identityKind,
            vector.components as never,
          )
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.issues[0]?.path).toEqual([
          'components',
          vector.expectedError === 'empty-component' ?
            vector.components.indexOf('')
          : 0,
        ])
      }
    }
  })

  it('binds entry-node derivation to this producer typed event identity', () => {
    const event = unwrap(
      deriveEventIdentifier(runtimeScope, sequence(vectors.event.sequence)),
    )
    expect(
      deriveEntryNodeIdentifier(runtimeScope, {
        event: { system: event.system, value: event.value } as never,
        role: 'conversion-provenance',
        ordinal: ordinal('0'),
      }).ok,
    ).toBe(false)
    expect(
      deriveEntryNodeIdentifier(runtimeScope, {
        event: {
          ...event,
          value: 'e0:13ed2fea-25b0-4d0d-9a26-c6d2a7f057a2:1',
        },
        role: 'conversion-provenance',
        ordinal: ordinal('0'),
      }).ok,
    ).toBe(false)
  })

  it('validates event and entry-node lexical boundaries independently', () => {
    const event = unwrap(
      deriveEventIdentifier(runtimeScope, sequence(vectors.event.sequence)),
    )
    expect(deriveEventIdentifier(runtimeScope, 1 as never).ok).toBe(false)
    expect(deriveEventIdentifier(runtimeScope, '0' as never).ok).toBe(false)
    const node = (
      key: Partial<{ system: unknown; value: unknown; role: unknown }>,
      role: unknown,
      nodeOrdinal: unknown,
    ) =>
      deriveEntryNodeValue({
        event: { ...event, ...key },
        role,
        ordinal: nodeOrdinal,
      } as never)
    expect(node({ system: '/relative' }, 'resource', '0').ok).toBe(false)
    expect(node({}, 42, '0').ok).toBe(false)
    expect(node({}, 'Uppercase', '0').ok).toBe(false)
    expect(node({}, 'resource', 0).ok).toBe(false)
    expect(node({}, 'resource', '01').ok).toBe(false)
    expect(node({ role: 'source-record' }, 'resource', '0').ok).toBe(false)
    expect(node({}, 'resource', '0').ok).toBe(true)
    expect(
      deriveEntryNodeIdentifier(runtimeScope, {
        event,
        role: 'Uppercase',
        ordinal: ordinal('0'),
      }).ok,
    ).toBe(false)
    expect(isEventIdentityValue(42)).toBe(false)
    expect(isEventIdentityValue('e0:not-a-uuid:1')).toBe(false)
    expect(containsIsolatedSurrogate(42 as never)).toBe(true)
  })

  it('rejects noncanonical base64url digest spellings', () => {
    const noncanonicalDigest = `${'A'.repeat(42)}B`
    expect(isOpaqueIdentityValue(`v0:key:1:${noncanonicalDigest}`)).toBe(false)
    expect(
      isEntryNodeIdentityValue(`n0:resource:0:${noncanonicalDigest}`),
    ).toBe(false)
  })
})
