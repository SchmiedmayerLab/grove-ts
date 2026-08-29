//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  parseAbsoluteUri,
  type AbsoluteUri,
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
  isOpaqueIdentityValue,
  validateDeploymentIdentity,
  type DeploymentIdentityInput,
  type GroveOpaqueIdentityComponents,
  type GroveOpaqueIdentityKind,
} from '../src/mobile/index.js'

const unwrap = <Value>(result: Result<Value>): Value => {
  if (!result.ok) throw new Error(result.issues[0]?.message)
  return result.value
}

const uri = (value: string): AbsoluteUri => unwrap(parseAbsoluteUri(value))

const conformanceDeployment = {
  opaqueIdentifierSystems: {
    'source-record': uri(
      'https://study.example.org/fhir/NamingSystem/grove-source-record-v2/test-key/1',
    ),
    'source-output': uri(
      'https://study.example.org/fhir/NamingSystem/grove-source-output-v2/test-key/1',
    ),
    'writer-record': uri(
      'https://study.example.org/fhir/NamingSystem/grove-writer-record-v2/test-key/1',
    ),
    'provider-record': uri(
      'https://study.example.org/fhir/NamingSystem/grove-provider-record-v2/test-key/1',
    ),
    'provider-output': uri(
      'https://study.example.org/fhir/NamingSystem/grove-provider-output-v2/test-key/1',
    ),
    'source-artifact': uri(
      'https://study.example.org/fhir/NamingSystem/grove-source-artifact-v2/test-key/1',
    ),
    'provider-artifact': uri(
      'https://study.example.org/fhir/NamingSystem/grove-provider-artifact-v2/test-key/1',
    ),
    'source-context': uri(
      'https://study.example.org/fhir/NamingSystem/grove-source-context-v2/test-key/1',
    ),
    'recording-device': uri(
      'https://study.example.org/fhir/NamingSystem/grove-recording-device-v2/test-key/1',
    ),
    'device-snapshot': uri(
      'https://study.example.org/fhir/NamingSystem/grove-device-snapshot-v2/test-key/1',
    ),
  },
  eventIdentifierSystem: uri(groveExchangeProtocol.testVectors.event.system),
  entryNodeIdentifierSystem: uri(
    groveExchangeProtocol.testVectors.entryNode.system,
  ),
  keyId: groveExchangeProtocol.testVectors.keyId,
  keyEpoch: groveExchangeProtocol.testVectors.epoch,
  secretBase64Url: Buffer.from(
    groveExchangeProtocol.testVectors.keyHex,
    'hex',
  ).toString('base64url'),
  producerInstance: groveExchangeProtocol.testVectors.event.producerInstance,
} as const satisfies DeploymentIdentityInput

const runtimeDeployment: DeploymentIdentityInput = {
  ...conformanceDeployment,
  secretBase64Url: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY',
}

const identityVectors = groveExchangeProtocol.testVectors.identities
const invalidIdentityVectors =
  groveExchangeProtocol.testVectors.invalidIdentities

const deriveVectorIdentity = <Kind extends GroveOpaqueIdentityKind>(
  kind: Kind,
  components: GroveOpaqueIdentityComponents[Kind],
) =>
  deriveConformanceVectorOpaqueIdentifier(
    conformanceDeployment,
    kind,
    components,
  )

describe('Grove exchange protocol v2 identity', () => {
  it('fails closed without throwing at every untyped identity boundary', () => {
    const invalidValues = [null, undefined, 42, 'wrong-shape', Symbol('x')]
    for (const invalid of invalidValues) {
      const operations = [
        () => validateDeploymentIdentity(invalid),
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
            runtimeDeployment,
            'source-record',
            invalid as never,
          ),
        () =>
          deriveEntryNodeIdentifier(
            runtimeDeployment,
            invalid as never,
            'conversion-provenance',
            '0',
          ),
      ]
      for (const operation of operations) {
        expect(operation).not.toThrow()
        expect(operation().ok).toBe(false)
      }
    }

    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() => validateDeploymentIdentity(cyclic as never)).not.toThrow()
    expect(validateDeploymentIdentity(cyclic as never).ok).toBe(false)
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
        value: { value: vector.value },
      })
    },
  )

  it('matches the shared event, entry-node, and fullUrl vectors', () => {
    const vector = groveExchangeProtocol.testVectors
    const event = unwrap(
      deriveEventIdentifier(runtimeDeployment, vector.event.sequence),
    )
    expect(event).toEqual({
      system: vector.event.system,
      value: vector.event.value,
      role: 'event',
    })

    const node = unwrap(
      deriveEntryNodeIdentifier(
        runtimeDeployment,
        event,
        vector.entryNode.role,
        vector.entryNode.ordinal,
      ),
    )
    expect(node.value).toBe(vector.entryNode.value)
    expect(deriveEntryFullUrl(node)).toEqual({
      ok: true,
      value: vector.entryNode.fullUrl,
    })
    const fullUrlVector = vector.fullUrls[0]
    expect(
      deriveEntryFullUrl({
        system: uri(fullUrlVector.system),
        value: fullUrlVector.value,
      }),
    ).toEqual({
      ok: true,
      value: fullUrlVector.fullUrl,
    })
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
    expect(validateDeploymentIdentity(conformanceDeployment).ok).toBe(false)
    expect(
      validateDeploymentIdentity({
        ...runtimeDeployment,
        keyUse: 'conformance-testing',
      }).ok,
    ).toBe(false)
    const sourceVector = identityVectors[0]
    expect(
      deriveOpaqueIdentifier(
        conformanceDeployment,
        sourceVector.identityKind,
        sourceVector.components as never,
      ).ok,
    ).toBe(false)
    expect(
      validateDeploymentIdentity({
        ...runtimeDeployment,
        opaqueIdentifierSystems: {
          ...runtimeDeployment.opaqueIdentifierSystems,
          'source-record':
            runtimeDeployment.opaqueIdentifierSystems['source-output'],
        },
      }).ok,
    ).toBe(false)
    const withWrongKinds = {
      ...runtimeDeployment,
      opaqueIdentifierSystems: Object.fromEntries(
        Object.entries(runtimeDeployment.opaqueIdentifierSystems).map(
          ([kind, system], index) => [
            index === 0 ? 'unknown-kind' : kind,
            system,
          ],
        ),
      ),
    } as unknown as DeploymentIdentityInput
    expect(validateDeploymentIdentity(withWrongKinds).ok).toBe(false)
    for (const badSystem of [
      'https://例.example/identity',
      'https://example.org/%ZZ',
      'https://example.org/identity value',
    ]) {
      expect(
        validateDeploymentIdentity({
          ...runtimeDeployment,
          eventIdentifierSystem: badSystem as AbsoluteUri,
        }).ok,
      ).toBe(false)
    }
  })

  it.each([
    { opaqueIdentifierSystems: null },
    { opaqueIdentifierSystems: [] },
    { keyId: 42 },
    { keyId: 'not a token' },
    { keyEpoch: 1 },
    { keyEpoch: '0' },
    { producerInstance: 42 },
    { producerInstance: runtimeDeployment.producerInstance.toUpperCase() },
    { secretBase64Url: 42 },
    { secretBase64Url: '*' },
    { secretBase64Url: 'A' },
    { secretBase64Url: 'AA' },
    { eventIdentifierSystem: '/relative' },
    { entryNodeIdentifierSystem: '/relative' },
  ])('rejects malformed deployment field set %#', (replacement) => {
    expect(
      validateDeploymentIdentity({
        ...runtimeDeployment,
        ...replacement,
      }).ok,
    ).toBe(false)
  })

  it('rejects unknown identity kinds and every wrong component arity at runtime', () => {
    const source = identityVectors.find(
      ({ identityKind }) => identityKind === 'source-output',
    )
    if (source === undefined) throw new Error('Missing source-output vector.')
    expect(
      deriveOpaqueIdentifier(
        runtimeDeployment,
        'unknown-kind' as GroveOpaqueIdentityKind,
        source.components as never,
      ).ok,
    ).toBe(false)
    expect(
      deriveOpaqueIdentifier(
        runtimeDeployment,
        'source-output',
        source.components.slice(0, -1) as never,
      ).ok,
    ).toBe(false)
    expect(
      deriveOpaqueIdentifier(runtimeDeployment, 'source-output', [
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
        runtimeDeployment,
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
          runtimeDeployment,
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
      const result = deriveOpaqueIdentifier(
        runtimeDeployment,
        kind,
        components as never,
      )
      expect(result).toMatchObject({
        ok: false,
        issues: [{ code: 'invalid-code', path: ['components', 0] }],
      })
    }
  })

  it('rejects every shared invalid opaque-identity vector', () => {
    expect(invalidIdentityVectors).toHaveLength(4)
    for (const vector of invalidIdentityVectors) {
      const result = deriveOpaqueIdentifier(
        runtimeDeployment,
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
      deriveEventIdentifier(
        runtimeDeployment,
        groveExchangeProtocol.testVectors.event.sequence,
      ),
    )
    expect(
      deriveEntryNodeIdentifier(
        runtimeDeployment,
        { system: event.system, value: event.value },
        'conversion-provenance',
        '0',
      ).ok,
    ).toBe(false)
    expect(
      deriveEntryNodeIdentifier(
        runtimeDeployment,
        {
          ...event,
          value: 'e2:13ed2fea-25b0-4d0d-9a26-c6d2a7f057a2:1',
        },
        'conversion-provenance',
        '0',
      ).ok,
    ).toBe(false)
  })

  it('validates event and entry-node lexical boundaries independently', () => {
    const event = unwrap(
      deriveEventIdentifier(
        runtimeDeployment,
        groveExchangeProtocol.testVectors.event.sequence,
      ),
    )
    expect(deriveEventIdentifier(runtimeDeployment, 1 as never).ok).toBe(false)
    expect(deriveEventIdentifier(runtimeDeployment, '0').ok).toBe(false)
    expect(
      deriveEntryNodeValue('/relative', event.value, 'resource', '0').ok,
    ).toBe(false)
    expect(
      deriveEntryNodeValue(event.system, event.value, 42 as never, '0').ok,
    ).toBe(false)
    expect(
      deriveEntryNodeValue(event.system, event.value, 'Uppercase', '0').ok,
    ).toBe(false)
    expect(
      deriveEntryNodeValue(event.system, event.value, 'resource', 0 as never)
        .ok,
    ).toBe(false)
    expect(
      deriveEntryNodeValue(event.system, event.value, 'resource', '01').ok,
    ).toBe(false)
    expect(
      deriveEntryNodeIdentifier(runtimeDeployment, event, 'Uppercase', '0').ok,
    ).toBe(false)
    expect(isEventIdentityValue(42 as never)).toBe(false)
    expect(isEventIdentityValue('e2:not-a-uuid:1')).toBe(false)
    expect(containsIsolatedSurrogate(42 as never)).toBe(true)
  })

  it('rejects noncanonical base64url digest spellings', () => {
    const noncanonicalDigest = `${'A'.repeat(42)}B`
    expect(isOpaqueIdentityValue(`v2:key:1:${noncanonicalDigest}`)).toBe(false)
    expect(
      isEntryNodeIdentityValue(`n2:resource:0:${noncanonicalDigest}`),
    ).toBe(false)
  })
})
