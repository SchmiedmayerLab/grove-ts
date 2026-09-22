//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { readdirSync, readFileSync } from 'node:fs'
import { expectTypeOf } from 'expect-type'
import {
  context,
  identityScope,
  scopeInput,
  study,
  subject,
  unwrap,
  uri,
} from './provider-test-support.js'
import * as mobileContract from '../src/contract/measurement-catalog.generated.js'
import {
  parseFhirId,
  parseFhirInstant,
  parseSemVer,
  type FhirInstant,
} from '../src/core/index.js'
import * as mobile from '../src/mobile/index.js'
import {
  canonicalizeMobileEffectiveInstant,
  createEntryIdentity,
  deriveEntryFullUrl,
  deriveEventIdentifier,
  encodeLengthFramedUtf8,
  entryIdentifierName,
  groveFhirVersion,
  groveMobilePackageMetadata,
  mobileEffectiveCanonicalizationVectors,
  parseExchangeEventContext,
  sharedMobileMeasurementCatalog,
  validateOpaqueIdentityScope,
  type MobileMeasurement,
} from '../src/mobile/index.js'

const instant = (value: string): FhirInstant => unwrap(parseFhirInstant(value))

describe('source-neutral Mobile contract', () => {
  it('exports only source-neutral data, types, identity, and time contracts', () => {
    expect(groveFhirVersion).toBe('4.0.1')
    expect(groveMobilePackageMetadata.packageId).toBe(
      'org.grovealliance.fhir.mobile',
    )
    expect(parseSemVer(groveMobilePackageMetadata.version).ok).toBe(true)
    expect(Object.isFrozen(groveMobilePackageMetadata)).toBe(true)
    expect(mobile.groveExchangeProtocol.schemaVersion).toBe(0)
    expect(mobile.groveExchangeProtocol.protocolVersion).toBe(0)
    expect(mobile.groveExchangeProtocol).not.toHaveProperty('version')
    expect(mobile.groveExchangeProtocol).not.toHaveProperty('releaseVersion')
    expect(mobile.groveRecordingFormatRegistry).not.toHaveProperty('version')
    expect('groveMobileContract' in mobile).toBe(false)
    expect('groveFhirContractVersion' in mobile).toBe(false)
    expect('buildProviderExchangeGraph' in mobile).toBe(false)
    expect('providerAdapterCatalog' in mobile).toBe(false)
    expect('PROFILES' in mobile).toBe(false)
    expect('providerAdapterCatalog' in mobileContract).toBe(false)
    expect('providerScalarOutputRoles' in mobileContract).toBe(false)
    expect('groveProviderPackageMetadata' in mobileContract).toBe(false)
    expect('adapterMeasurementCatalog' in mobileContract).toBe(false)
  })

  it('never imports the provider catalog, so a mobile-only consumer does not ship it', () => {
    const mobileRoot = new URL('../src/mobile/', import.meta.url)
    for (const name of readdirSync(mobileRoot)) {
      const source = readFileSync(new URL(name, mobileRoot), 'utf8')
      expect(source).not.toMatch(/providers\.generated|\/providers\//u)
    }
  })

  it('contains only evidenced shared measurements', () => {
    const entries = Object.values(sharedMobileMeasurementCatalog)
    expect(entries).toHaveLength(84)
    expect(sharedMobileMeasurementCatalog).not.toHaveProperty('body-mass-index')
    expect(sharedMobileMeasurementCatalog).not.toHaveProperty('blood-glucose')
    expect(sharedMobileMeasurementCatalog).not.toHaveProperty(
      'apple-stand-hour',
    )
    expect(sharedMobileMeasurementCatalog).not.toHaveProperty(
      'sleeping-heart-rate-average',
    )

    for (const definition of entries) {
      expect(definition).not.toHaveProperty('coverage')
      expect(definition).not.toHaveProperty('coverageDetails')
      expect(definition).not.toHaveProperty('generation')
      expect(definition).not.toHaveProperty('owner')
    }
    expect(JSON.stringify(sharedMobileMeasurementCatalog)).not.toMatch(
      /healthkit|health-connect|sensorkit|google-health-api|oura|withings|sourceTokens/u,
    )
    expect(Object.isFrozen(sharedMobileMeasurementCatalog)).toBe(true)
    expect(Object.isFrozen(entries[0])).toBe(true)
  })

  it('keeps the source-neutral measurement union discriminated', () => {
    const measurement = {
      kind: 'heart-rate',
      value: 64,
      effective: {
        kind: 'date-time',
        value: instant('2026-08-20T12:00:00Z'),
      },
    } as const satisfies MobileMeasurement
    expectTypeOf(measurement).toExtend<MobileMeasurement>()
    expect(measurement.kind).toBe('heart-rate')
  })
})

describe('Mobile exchange entry identity', () => {
  it('names an identifier with unambiguous unsigned-32-bit length framing', () => {
    const expected = unwrap(
      encodeLengthFramedUtf8(['https://example.org/source', 'record-1']),
    )
    expect(
      entryIdentifierName({
        system: 'https://example.org/source' as never,
        value: 'record-1',
      }),
    ).toEqual({ ok: true, value: expected })
  })

  it('admits separators in either component without tuple collisions', () => {
    const first = unwrap(
      entryIdentifierName({
        system: 'https://example.org/a;b' as never,
        value: 'c',
      }),
    )
    const second = unwrap(
      entryIdentifierName({
        system: 'https://example.org/a' as never,
        value: 'b;c',
      }),
    )
    expect(first).not.toEqual(second)
  })

  it('matches the protocol Unicode-value and escaped-system UUID-v5 vector', () => {
    const vector = mobile.groveExchangeProtocol.testVectors.fullUrls[0]
    expect(
      deriveEntryFullUrl({
        system: uri(vector.system),
        value: vector.value,
      }),
    ).toEqual({
      ok: true,
      value: vector.fullUrl,
    })
  })

  it('retains a complete roled Identifier and optional repository id', () => {
    const identifier = {
      system: uri('https://example.org/identifiers'),
      value: 'record-1',
      role: 'source-output' as const,
    }
    const id = unwrap(parseFhirId('repository-id'))
    const fullUrl = unwrap(deriveEntryFullUrl(identifier))
    const result = createEntryIdentity(identifier, id)
    expect(result.ok && result.value).toEqual({ identifier, id, fullUrl })
    expect(result.ok && Object.isFrozen(result.value)).toBe(true)
    expect(Object.isFrozen(identifier)).toBe(false)
    identifier.value = 'caller-mutated-after-construction'
    expect(result.ok && result.value.identifier.value).toBe('record-1')
    expect(
      createEntryIdentity({
        system: uri('https://example.org/identifiers'),
        value: 'record-1',
        role: 'not-a-role',
      } as never).ok,
    ).toBe(false)
  })

  it.each([
    { system: '/relative', value: 'record-1' },
    { system: 'https://例.example/識別子', value: 'record-1' },
    { system: 'https://example.org/%ZZ', value: 'record-1' },
    { system: 'https://example.org/a b', value: 'record-1' },
    { system: 'https://example.org/identifiers', value: '' },
    { system: 'https://example.org/identifiers', value: 'invalid-\ud800' },
    { system: 'https://example.org/identifiers', value: 'invalid-\udc00' },
  ])('rejects incomplete or non-Unicode-scalar identity %#', (input) => {
    expect(
      entryIdentifierName({
        system: input.system as never,
        value: input.value,
      }).ok,
    ).toBe(false)
  })

  it('rejects an invalid repository id and accepts a valid surrogate pair', () => {
    const identifier = {
      system: uri('https://example.org/identifiers'),
      value: 'valid-😀',
      role: 'source-output' as const,
    }
    expect(deriveEntryFullUrl(identifier).ok).toBe(true)
    expect(createEntryIdentity(identifier, 'invalid/id' as never).ok).toBe(
      false,
    )
  })

  it('preserves nonempty whitespace because Identifier.value is lexical data', () => {
    expect(
      entryIdentifierName({
        system: uri('https://example.org/identifiers'),
        value: ' \t\n ',
      }).ok,
    ).toBe(true)
  })
})

describe('Mobile effective-time canonicalization', () => {
  it.each(mobileEffectiveCanonicalizationVectors)(
    'matches the IG $id vector',
    ({ input, output }) => {
      expect(canonicalizeMobileEffectiveInstant(input)).toEqual({
        ok: true,
        value: output,
      })
    },
  )

  it.each([
    42,
    'not-an-instant',
    '2026-08-20T12:00:00',
    '9999-12-31T23:59:59.9996Z',
  ])('fails closed for invalid or out-of-range instant %p', (value) => {
    expect(canonicalizeMobileEffectiveInstant(value).ok).toBe(false)
  })
})

describe('exchange event context', () => {
  it('defaults the conversion instant to now', () => {
    const {
      subject,
      event,
      identityScope: scope,
      repositoryScope,
      application,
      host,
    } = context()
    const before = Date.now()
    const result = parseExchangeEventContext({
      subject,
      event,
      identityScope: scope,
      repositoryScope,
      application,
      host,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const instant = Date.parse(result.value.conversionInstant)
    expect(instant).toBeGreaterThanOrEqual(before - 1)
    expect(instant).toBeLessThanOrEqual(Date.now() + 1)
  })

  it('validates a context once and keeps the scope handle by reference', () => {
    const result = parseExchangeEventContext(context())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.isFrozen(result.value)).toBe(true)
    expect(result.value.identityScope).toBe(identityScope)
    expect(result.value.converterRole).toEqual({ kind: 'assembler' })
    expect(result.value.studies).toEqual([])
    expect(result.value).not.toHaveProperty('repositoryIds')
  })

  it('treats an optional field set to undefined as absent', () => {
    const result = parseExchangeEventContext({
      ...context(),
      converterRole: undefined,
      studies: undefined,
      repositoryIds: undefined,
      application: { ...context().application, version: undefined },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.application).not.toHaveProperty('version')
  })

  it('reports deployment faults under schema codes, never registry codes', () => {
    const otherScope = unwrap(
      validateOpaqueIdentityScope({
        ...scopeInput,
        producerInstance: '9ae7b610-bac2-4f13-97b4-53b84b8a90cf',
      }),
    )
    const faults: ReadonlyArray<[string, unknown, string]> = [
      [
        'a forged scope',
        { ...context(), identityScope: { ...identityScope } },
        'identityScope',
      ],
      [
        'an event another producer minted',
        {
          ...context(),
          event: unwrap(deriveEventIdentifier(otherScope, '1' as never)),
        },
        'event',
      ],
      ['an unknown field', { ...context(), extra: true }, 'extra'],
      ['a missing host', { ...context(), host: undefined }, 'host'],
      [
        'a blank application name',
        { ...context(), application: { sourceDeviceToken: 'a', name: ' ' } },
        'application',
      ],
      [
        'a subject of unknown kind',
        {
          ...context(),
          subject: { kind: 'remote', identifier: subject.identifier },
        },
        'subject',
      ],
      [
        'a bundled Patient without the subject identifier',
        {
          ...context(),
          subject: {
            kind: 'bundled',
            identifier: subject.identifier,
            patient: { resourceType: 'Patient' },
          },
        },
        'subject',
      ],
      [
        'a duplicated study',
        { ...context(), studies: [study('a'), study('a')] },
        'studies',
      ],
      [
        'an unknown graph node',
        { ...context(), repositoryIds: { patient: 'x' } },
        'repositoryIds',
      ],
      [
        'a converter role without its application',
        { ...context(), converterRole: { kind: 'gateway-application' } },
        'converterRole',
      ],
      [
        'an instant without offset',
        { ...context(), conversionInstant: '2026-08-20T12:00:00' },
        'conversionInstant',
      ],
    ]
    for (const [label, candidate, field] of faults) {
      const result = parseExchangeEventContext(candidate)
      expect([label, result.ok]).toEqual([label, false])
      if (result.ok) continue
      expect([label, result.issues.map(({ path }) => path[0])]).toEqual([
        label,
        expect.arrayContaining([field]),
      ])
      expect(
        result.issues
          .filter(({ code }) => code.includes('.'))
          .map(({ code }) => code),
      ).toEqual([])
    }
  })
})
