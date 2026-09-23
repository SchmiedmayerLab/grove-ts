//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { inspect } from 'node:util'
import {
  ok,
  parseEntryNodeOrdinal,
  parseEventSequence,
  parseIdentifierSystem,
  parseKeyEpoch,
  parsePartIndex,
  type EntryNodeOrdinal,
  type EventSequence,
  type IdentifierSystem,
  type PartIndex,
  type Result,
} from '../src/core/index.js'
import {
  containsIsolatedSurrogate,
  deriveConformanceVectorOpaqueIdentifier,
  deriveConformanceVectorRecordIdentity,
} from '../src/mobile/identity.js'
import {
  createEntryIdentity,
  deriveEntryFullUrl,
  deriveEntryNodeIdentifier,
  deriveEntryNodeValue,
  deriveEventIdentifier,
  deriveOpaqueIdentifier,
  deriveSourceRecordIdentity,
  entryIdentifierName,
  encodeLengthFramedUtf8,
  groveExchangeProtocol,
  isEntryNodeIdentityValue,
  isEventIdentityValue,
  isOpaqueIdentityScope,
  isOpaqueIdentityValue,
  validateOpaqueIdentityScope,
  type OpaqueIdentityKind,
  type OpaqueIdentityScopeInput,
  type OpaqueIdentitySystems,
  type RoledIdentifier,
  type SourceRecordCoordinates,
  type SourceRecordIdentity,
} from '../src/mobile/index.js'
import { providerCoordinateIssue } from '../src/providers/identity.js'
import {
  deriveProviderRecordIdentity,
  type ProviderRecordCoordinates,
} from '../src/providers/index.js'

const unwrap = <Value>(result: Result<Value>): Value => {
  if (!result.ok) throw new Error(result.issues[0]?.message)
  return result.value
}

const identifierSystem = (value: string): IdentifierSystem =>
  unwrap(parseIdentifierSystem(value))
const sequence = (value: string): EventSequence =>
  unwrap(parseEventSequence(value))
const ordinal = (value: string): EntryNodeOrdinal =>
  unwrap(parseEntryNodeOrdinal(value))

const vectors = groveExchangeProtocol.testVectors
const vectorSystems = Object.fromEntries(
  vectors.identitySystems.map(({ identityKind, system }) => [
    identityKind,
    identifierSystem(system),
  ]),
) as OpaqueIdentitySystems

const conformanceScope: OpaqueIdentityScopeInput = {
  systems: {
    opaque: vectorSystems,
    event: identifierSystem(vectors.event.system),
    entryNode: identifierSystem(vectors.entryNode.system),
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

type RecordKind = 'provider-record' | 'source-record'
type RecordExtension = 'artifact' | 'output'

// A record-family vector lists its record's five components, then its output's or artifact's two.
const recordFamilies: Partial<
  Record<OpaqueIdentityKind, readonly [RecordKind, RecordExtension?]>
> = {
  'source-record': ['source-record'],
  'source-output': ['source-record', 'output'],
  'source-artifact': ['source-record', 'artifact'],
  'provider-record': ['provider-record'],
  'provider-output': ['provider-record', 'output'],
  'provider-artifact': ['provider-record', 'artifact'],
}

const recordCoordinates = (
  kind: RecordKind,
  [
    adapter = '',
    sourceType = '',
    system = '',
    value = '',
    nativeRecordId = '',
  ]: readonly string[],
) =>
  kind === 'source-record' ?
    {
      adapterId: adapter,
      sourceType,
      repositoryScope: { system: system as IdentifierSystem, value },
      nativeRecordId,
    }
  : {
      providerCode: adapter,
      sourceType,
      providerScope: { system: system as IdentifierSystem, value },
      nativeRecordId,
    }

const extendRecord = (
  record: SourceRecordIdentity,
  extension: RecordExtension | undefined,
  [first = '', second = '']: readonly string[],
): Result<RoledIdentifier> => {
  if (extension === undefined) return ok(record.identifier)
  return extension === 'output' ?
      record.output({ role: first, discriminator: second })
    : record.artifact({ formatCode: first, partIndex: second as PartIndex })
}

const deriveVectorIdentity = (
  kind: OpaqueIdentityKind,
  components: readonly string[],
): Result<RoledIdentifier> => {
  const family = recordFamilies[kind]
  if (family === undefined) {
    return deriveConformanceVectorOpaqueIdentifier(
      conformanceScope,
      kind as never,
      components as never,
    )
  }
  const [recordKind, extension] = family
  const record = deriveConformanceVectorRecordIdentity(
    conformanceScope,
    recordKind,
    recordCoordinates(recordKind, components),
  )
  return record.ok ?
      extendRecord(record.value, extension, components.slice(5))
    : record
}

const deriveRuntimeIdentity = (
  kind: OpaqueIdentityKind,
  components: readonly string[],
): Result<RoledIdentifier> => {
  const family = recordFamilies[kind]
  if (family === undefined) {
    return deriveOpaqueIdentifier(
      runtimeScope,
      kind as never,
      components as never,
    )
  }
  const [recordKind, extension] = family
  const coordinates = recordCoordinates(recordKind, components)
  const record =
    recordKind === 'source-record' ?
      deriveSourceRecordIdentity(
        runtimeScope,
        coordinates as SourceRecordCoordinates,
      )
    : deriveProviderRecordIdentity(
        runtimeScope,
        coordinates as ProviderRecordCoordinates,
      )
  return record.ok ?
      extendRecord(record.value, extension, components.slice(5))
    : record
}

const vectorOf = (kind: OpaqueIdentityKind) => {
  const vector = identityVectors.find(
    ({ identityKind }) => identityKind === kind,
  )
  if (vector === undefined) throw new Error(`Missing ${kind} vector.`)
  return vector
}

const part = (value: string): PartIndex => unwrap(parsePartIndex(value))

const sourceRecordPaths = [
  ['adapterId'],
  ['sourceType'],
  ['repositoryScope', 'system'],
  ['repositoryScope', 'value'],
  ['nativeRecordId'],
]

const heartRateRecord: SourceRecordCoordinates = {
  adapterId: 'healthkit',
  sourceType: 'HKQuantityTypeIdentifierHeartRate',
  repositoryScope: {
    system: identifierSystem(
      'https://study.example.org/fhir/NamingSystem/participant',
    ),
    value: 'participant-1',
  },
  nativeRecordId: 'native-1',
}

const withingsRecord: ProviderRecordCoordinates = {
  providerCode: 'withings',
  sourceType: 'getmeas:11',
  providerScope: {
    system: identifierSystem('https://accounts.example.org'),
    value: 'patient-001',
  },
  nativeRecordId: '17348211',
}

describe('Grove exchange protocol identity', () => {
  it('fails closed without throwing at every untyped identity boundary', () => {
    const record = unwrap(
      deriveSourceRecordIdentity(runtimeScope, heartRateRecord),
    )
    const invalidValues = [null, undefined, 42, 'wrong-shape', Symbol('x')]
    for (const invalid of invalidValues) {
      const operations = [
        () => validateOpaqueIdentityScope(invalid as never),
        () => encodeLengthFramedUtf8(invalid as never),
        () => deriveEntryFullUrl(invalid as never),
        () => entryIdentifierName(invalid as never),
        () => createEntryIdentity(invalid as never),
        () => deriveSourceRecordIdentity(invalid as never, heartRateRecord),
        () => deriveSourceRecordIdentity(runtimeScope, invalid as never),
        () => deriveProviderRecordIdentity(runtimeScope, invalid as never),
        () => record.output(invalid as never),
        () => record.artifact(invalid as never),
        () =>
          deriveOpaqueIdentifier(
            runtimeScope,
            'writer-record',
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
    expect(deriveSourceRecordIdentity(forged, heartRateRecord)).toMatchObject({
      ok: false,
      issues: [{ code: 'invalid-identifier', path: ['scope'] }],
    })
    expect(deriveEventIdentifier(forged, sequence('1')).ok).toBe(false)
  })

  it('keeps a reused scope handle immune to mutation', () => {
    const before = unwrap(
      deriveSourceRecordIdentity(runtimeScope, heartRateRecord),
    ).identifier
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
      unwrap(deriveSourceRecordIdentity(runtimeScope, heartRateRecord))
        .identifier,
    ).toEqual(before)
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
        system: identifierSystem(fullUrlVector.system),
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
    expect(
      deriveConformanceVectorRecordIdentity(
        runtimeInput,
        'source-record',
        heartRateRecord,
      ).ok,
    ).toBe(false)
    expect(
      deriveConformanceVectorOpaqueIdentifier(
        runtimeInput,
        'writer-record',
        vectorOf('writer-record').components as never,
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
          systems: {
            ...runtimeInput.systems,
            event: badSystem as IdentifierSystem,
          },
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
    const writer = vectorOf('writer-record')
    expect(
      deriveOpaqueIdentifier(
        runtimeScope,
        'unknown-kind' as never,
        writer.components as never,
      ).ok,
    ).toBe(false)
    expect(
      deriveOpaqueIdentifier(
        runtimeScope,
        'writer-record',
        writer.components.slice(0, -1) as never,
      ).ok,
    ).toBe(false)
    expect(
      deriveOpaqueIdentifier(runtimeScope, 'writer-record', [
        ...writer.components,
        'extra',
      ] as never).ok,
    ).toBe(false)
  })

  it('mints every record kind only through its record identity', () => {
    for (const vector of identityVectors) {
      if (recordFamilies[vector.identityKind] === undefined) continue
      expect(
        deriveOpaqueIdentifier(
          runtimeScope,
          vector.identityKind as never,
          vector.components as never,
        ),
      ).toMatchObject({
        ok: false,
        issues: [{ code: 'invalid-code', path: ['identityKind'] }],
      })
    }
  })

  it('rejects non-string identity components after validating their arity', () => {
    const components: unknown[] = [...vectorOf('writer-record').components]
    components[1] = 42
    expect(
      deriveOpaqueIdentifier(
        runtimeScope,
        'writer-record',
        components as never,
      ),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'invalid-identifier', path: ['components'] }],
    })
  })

  it('rejects empty or malformed Unicode only at the typed opaque-identity boundary', () => {
    const record = unwrap(
      deriveSourceRecordIdentity(runtimeScope, heartRateRecord),
    )
    for (const invalid of ['', 'prefix\ud800suffix']) {
      for (const vector of identityVectors) {
        if (recordFamilies[vector.identityKind] !== undefined) continue
        const components: string[] = [...vector.components]
        components[0] = invalid
        expect(
          deriveOpaqueIdentifier(
            runtimeScope,
            vector.identityKind as never,
            components as never,
          ),
        ).toMatchObject({ ok: false, issues: [{ path: ['components', 0] }] })
      }
      const refusals = [
        [
          deriveSourceRecordIdentity(runtimeScope, {
            ...heartRateRecord,
            adapterId: invalid,
          }),
          ['adapterId'],
        ],
        [
          deriveSourceRecordIdentity(runtimeScope, {
            ...heartRateRecord,
            repositoryScope: {
              ...heartRateRecord.repositoryScope,
              value: invalid,
            },
          }),
          ['repositoryScope', 'value'],
        ],
        [
          deriveProviderRecordIdentity(runtimeScope, {
            ...withingsRecord,
            nativeRecordId: invalid,
          }),
          ['nativeRecordId'],
        ],
        [record.output({ role: invalid, discriminator: 'single' }), ['role']],
        [
          record.output({ role: 'sample', discriminator: invalid }),
          ['discriminator'],
        ],
        [
          record.artifact({ formatCode: invalid, partIndex: part('0') }),
          ['formatCode'],
        ],
      ] as const
      for (const [result, path] of refusals) {
        expect(result).toMatchObject({
          ok: false,
          issues: [{ code: 'invalid-identifier', path }],
        })
      }
    }
  })

  it('admits exactly the named coordinates and a canonical part index', () => {
    const record = unwrap(
      deriveSourceRecordIdentity(runtimeScope, heartRateRecord),
    )
    expect(
      deriveSourceRecordIdentity(runtimeScope, {
        ...heartRateRecord,
        version: '2',
      } as never),
    ).toMatchObject({ ok: false, issues: [{ code: 'schema-invalid' }] })
    expect(
      deriveSourceRecordIdentity(runtimeScope, {
        ...heartRateRecord,
        repositoryScope: {
          ...heartRateRecord.repositoryScope,
          system: 'participants' as IdentifierSystem,
        },
      }),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'invalid-uri', path: ['repositoryScope', 'system'] }],
    })
    expect(
      record.output({
        role: 'sample',
        discriminator: 'single',
        index: '0',
      } as never),
    ).toMatchObject({ ok: false, issues: [{ code: 'schema-invalid' }] })
    expect(
      record.artifact({ formatCode: 'native-recording', partIndex: part('7') })
        .ok,
    ).toBe(true)
    for (const partIndex of ['0', '10']) {
      expect(parsePartIndex(partIndex)).toEqual({ ok: true, value: partIndex })
    }
    for (const partIndex of ['01', '-1', '1.0', 0]) {
      expect(parsePartIndex(partIndex).ok).toBe(false)
      expect(
        record.artifact({
          formatCode: 'native-recording',
          partIndex: partIndex as never,
        }),
      ).toMatchObject({ ok: false, issues: [{ path: ['partIndex'] }] })
    }
  })

  it('holds its scope and coordinates privately and serializes only its identifier', () => {
    const coordinates = { ...heartRateRecord }
    const record = unwrap(deriveSourceRecordIdentity(runtimeScope, coordinates))
    const output = unwrap(
      record.output({ role: 'sample', discriminator: 'single' }),
    )
    Object.assign(coordinates, { nativeRecordId: 'native-2' })
    expect(Object.isFrozen(record)).toBe(true)
    expect(record.output({ role: 'sample', discriminator: 'single' })).toEqual({
      ok: true,
      value: output,
    })
    expect(JSON.parse(JSON.stringify(record))).toEqual({
      identifier: record.identifier,
    })
    for (const printed of [
      JSON.stringify(record),
      inspect(record, { depth: null, showHidden: true }),
    ]) {
      expect(printed).not.toContain(heartRateRecord.nativeRecordId)
      expect(printed).not.toContain(heartRateRecord.repositoryScope.value)
      expect(printed).not.toContain(runtimeInput.secretBase64Url)
    }
  })

  it('keeps provider codes and generic adapters in their own record families', () => {
    for (const provider of ['google-health-api', 'oura', 'withings']) {
      expect(providerCoordinateIssue('source-record', provider)).toMatchObject({
        code: 'invalid-code',
        path: ['adapterId'],
      })
      expect(
        providerCoordinateIssue('provider-record', provider),
      ).toBeUndefined()
    }
    expect(
      providerCoordinateIssue('source-record', 'healthkit'),
    ).toBeUndefined()
    expect(
      deriveProviderRecordIdentity(runtimeScope, {
        ...withingsRecord,
        providerCode: 'healthkit' as never,
      }),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'invalid-code', path: ['providerCode'] }],
    })
  })

  it('rejects every shared invalid opaque-identity vector', () => {
    expect(invalidIdentityVectors).toHaveLength(6)
    for (const vector of invalidIdentityVectors) {
      const [recordKind = 'source-record'] =
        recordFamilies[vector.identityKind] ?? []
      if (vector.expectedError === 'provider-kind-required') {
        expect(
          providerCoordinateIssue(recordKind, vector.components[0]),
        ).toMatchObject({ code: 'invalid-code', path: ['adapterId'] })
      } else if (vector.expectedError === 'non-canonical-part-index') {
        const names: readonly string[] =
          groveExchangeProtocol.opaqueIdentity.identityKinds.find(
            ({ kind }) => kind === vector.identityKind,
          )?.components ?? []
        const partIndex = names.indexOf('part-index')
        expect(
          deriveConformanceVectorOpaqueIdentifier(
            conformanceScope,
            vector.identityKind as never,
            vector.components as never,
          ),
        ).toMatchObject({
          ok: false,
          issues: [
            { code: 'invalid-identifier', path: ['components', partIndex] },
          ],
        })
        expect(
          deriveRuntimeIdentity(vector.identityKind, vector.components),
        ).toMatchObject({
          ok: false,
          issues: [{ code: 'invalid-identifier', path: ['partIndex'] }],
        })
      } else {
        expect(
          deriveRuntimeIdentity(vector.identityKind, vector.components),
        ).toMatchObject({
          ok: false,
          issues: [
            {
              code: 'invalid-identifier',
              path: sourceRecordPaths[vector.components.indexOf('')],
            },
          ],
        })
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
