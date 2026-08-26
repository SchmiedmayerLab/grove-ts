//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { readFileSync } from 'node:fs'
import { expectTypeOf } from 'expect-type'
import { assert, property, uint8Array } from 'fast-check'
import {
  parseAbsoluteUri,
  parseFhirId,
  parseFhirInstant,
  parsePatientReference,
  parsePositiveInteger,
  type FhirInstant,
  type Result,
} from '../src/index.js'
import {
  buildProviderRecordingBundle,
  providerRawMappings,
  encodeRecordingBytes,
  parseCanonicalBase64,
  parseProviderRecordingBundleInput,
  parseImmutableRecordingUrl,
  parseMediaType,
  parseSha1Base64,
  type ApplicationDeviceInput,
  type ProviderRecordingBundleInput,
  type ConnectedRawProvider,
} from '../src/providers/index.js'

const unwrap = <T>(result: Result<T>): T => {
  if (!result.ok) {
    throw new Error(result.issues.map((issue) => issue.message).join('\n'))
  }
  return result.value
}

const uri = (value: string) => unwrap(parseAbsoluteUri(value))
const instant = (value: string): FhirInstant => unwrap(parseFhirInstant(value))
const identity = (system: string, value: string) => ({
  identifier: { system: uri(system), value },
})

const converter: ApplicationDeviceInput = {
  identity: identity('https://example.org/applications', 'converter'),
  name: 'Grove converter',
  version: '0.0.0',
}

const rawInput = (
  provider: ConnectedRawProvider,
  sourceType: string,
): ProviderRecordingBundleInput =>
  ({
    source: {
      adapter: { kind: 'providers', provider },
      providerAccountIdentifier: {
        system: uri('https://provider.example.org/accounts'),
        value: 'account-pseudonym-001',
        assurance: 'deployment-scoped-pseudonym',
      },
      sourceType,
      sourceNativeId: `native-record-${provider}-${sourceType}`,
      dataOrigin: {
        identity: identity(
          'https://example.org/provider-applications',
          `origin-${provider}`,
        ),
        name: `${provider} source`,
      },
    },
    attachment: {
      kind: 'embedded',
      contentType: unwrap(parseMediaType('application/json')),
      title: 'Authorized minimized provider recording',
      format: 'provider-json-1',
      payloadAssertion: 'caller-authorized-opaque-payload',
      dataBase64: unwrap(encodeRecordingBytes(Uint8Array.of(1, 2, 3))),
    },
    subject: unwrap(parsePatientReference('Patient/example')),
    application: converter,
    eventSequence: unwrap(parsePositiveInteger(1)),
    graphIdentifierSystem: uri(
      'urn:grove:provider-graph:org.grovealliance.example',
    ),
    documentDate: instant('2026-08-20T17:00:01Z'),
    recorded: instant('2026-08-20T17:00:02Z'),
  }) as ProviderRecordingBundleInput

const recordingSources = Object.entries(providerRawMappings).flatMap(
  ([provider, sources]) =>
    Object.keys(sources).map((sourceType) => [provider, sourceType] as const),
)

describe('Provider native recording graph', () => {
  it.each([
    'google-health-heart-rate-recording.json',
    'oura-heart-rate-recording.json',
    'withings-activity-intraday-recording.json',
    'withings-sleep-intraday-recording.json',
  ])('accepts the provider-neutral normalized %s fixture', (name) => {
    const fixture = JSON.parse(
      readFileSync(new URL(`../fixtures/normalized/${name}`, import.meta.url), {
        encoding: 'utf8',
      }),
    ) as Pick<ProviderRecordingBundleInput, 'attachment' | 'source'>
    const graph = rawInput('google-health-api', 'heart-rate')
    expect(
      buildProviderRecordingBundle({
        ...graph,
        ...fixture,
      }).ok,
    ).toBe(true)
  })

  it.each(recordingSources)(
    'admits the exact catalogued %s/%s raw source',
    (provider, sourceType) => {
      const result = buildProviderRecordingBundle(
        rawInput(provider as ConnectedRawProvider, sourceType),
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.value.entry).toHaveLength(4)
      expect(Object.isFrozen(result.value)).toBe(true)
      const document = result.value.entry.find(
        ({ resource }) => resource.resourceType === 'DocumentReference',
      )?.resource
      expect(document?.resourceType).toBe('DocumentReference')
      if (document?.resourceType !== 'DocumentReference') return
      expect(document.meta?.profile).toEqual([
        'https://grovealliance.org/fhir/sensor/StructureDefinition/grove-sensor-recording-document',
        'https://grovealliance.org/fhir/providers/StructureDefinition/provider-recording-document',
      ])
      expect(document.extension).toEqual([
        {
          url: 'https://grovealliance.org/fhir/providers/StructureDefinition/provider',
          valueCode: provider,
        },
        {
          url: 'https://grovealliance.org/fhir/providers/StructureDefinition/provider-source-type',
          valueCode: `${provider}/${sourceType}`,
        },
      ])
      // A recording document is a one-to-one conversion, so the source record identifies it and
      // no second output namespace appears.
      expect(document.identifier?.map(({ system }) => system)).toEqual([
        'https://grovealliance.org/fhir/providers/NamingSystem/provider-source-record-id',
      ])
      expect(document.id).toBeUndefined()
    },
  )

  it('emits exact embedded bytes, computed SHA-1 integrity, and a complete audit graph', () => {
    const input = rawInput('google-health-api', 'heart-rate')
    const result = buildProviderRecordingBundle(input)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const documentEntry = result.value.entry.find(
      ({ resource }) => resource.resourceType === 'DocumentReference',
    )
    const provenance = result.value.entry.find(
      ({ resource }) => resource.resourceType === 'Provenance',
    )?.resource
    expect(documentEntry?.resource.resourceType).toBe('DocumentReference')
    if (documentEntry?.resource.resourceType !== 'DocumentReference') return
    expect(documentEntry.resource.content).toEqual([
      {
        attachment: {
          contentType: 'application/json',
          data: 'AQID',
          size: 3,
          hash: 'cDeAcZjCKn0rCAc3HXY3eahP388=',
          title: 'Authorized minimized provider recording',
        },
        format: {
          system:
            'https://grovealliance.org/fhir/sensor/CodeSystem/grove-recording-format',
          code: 'provider-json-1',
          display: 'Provider JSON 1',
        },
      },
    ])
    expect(documentEntry.resource.status).toBe('current')
    expect(documentEntry.resource.date).toBe(input.documentDate)
    expect(documentEntry.resource.author).toHaveLength(1)
    expect(provenance?.resourceType).toBe('Provenance')
    if (provenance?.resourceType !== 'Provenance') return
    expect(provenance.meta?.profile).toEqual([
      'https://grovealliance.org/fhir/providers/StructureDefinition/provider-conversion-provenance',
    ])
    expect(provenance.target).toEqual([{ reference: documentEntry.fullUrl }])
    expect(provenance.entity).toHaveLength(1)
    expect(provenance.entity?.[0]?.what.identifier?.system).toBe(
      'https://grovealliance.org/fhir/providers/NamingSystem/provider-source-record-id',
    )
    const serialized = JSON.stringify(result.value)
    // The provider's own record key travels in the clear; the caller's payload assertion does not.
    expect(serialized).toContain(input.source.sourceNativeId)
    expect(serialized).not.toContain(input.attachment.payloadAssertion)
    expect(serialized).not.toContain('payloadAssertion')
  })

  it('matches the frozen raw source/output identity vectors', () => {
    const input = rawInput('google-health-api', 'heart-rate')
    const result = buildProviderRecordingBundle({
      ...input,
      source: {
        ...input.source,
        providerAccountIdentifier: {
          system: uri('https://provider.example.org/accounts'),
          value: 'account-001',
          assurance: 'deployment-scoped-pseudonym',
        },
        sourceNativeId: 'heart-rate-2026-08-20',
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const document = result.value.entry.find(
      ({ resource }) => resource.resourceType === 'DocumentReference',
    )?.resource
    if (document?.resourceType !== 'DocumentReference') {
      throw new Error('Missing recording document')
    }
    // Google Health is account-scoped, and a recording document is a one-to-one conversion, so
    // the source record is the document's only identity.
    expect(document.identifier?.map(({ value }) => value)).toEqual([
      'v1:google-health-api|account-001|heart-rate|heart-rate-2026-08-20',
    ])
  })

  it('supports an immutable external attachment without copying or fetching it', () => {
    const input = rawInput('oura', 'heartrate')
    const result = buildProviderRecordingBundle({
      ...input,
      attachment: {
        kind: 'external',
        contentType: unwrap(parseMediaType('application/json')),
        title: 'Authorized minimized Oura recording',
        format: 'provider-json-1',
        payloadAssertion: 'verified-sanitized-input',
        url: unwrap(
          parseImmutableRecordingUrl(
            'https://objects.example.org/recordings/version-42',
          ),
        ),
        size: unwrap(parsePositiveInteger(3)),
        hash: unwrap(parseSha1Base64('cDeAcZjCKn0rCAc3HXY3eahP388=')),
        immutabilityAssurance: 'immutable-version-specific',
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const document = result.value.entry.find(
      ({ resource }) => resource.resourceType === 'DocumentReference',
    )?.resource
    if (document?.resourceType !== 'DocumentReference') return
    expect(document.content[0]?.attachment).toMatchObject({
      url: 'https://objects.example.org/recordings/version-42',
      size: 3,
      hash: 'cDeAcZjCKn0rCAc3HXY3eahP388=',
    })
    expect(document.content[0]?.attachment.data).toBeUndefined()
    const serialized = JSON.stringify(result.value)
    expect(serialized).not.toContain('verified-sanitized-input')
    expect(serialized).not.toContain('payloadAssertion')
  })

  it('retains repository-assigned ids while keeping digest identities out of Resource.id', () => {
    const input = rawInput('withings', 'activityIntraday')
    const result = buildProviderRecordingBundle({
      ...input,
      repositoryIds: {
        bundle: unwrap(parseFhirId('bundle-42')),
        document: unwrap(parseFhirId('document-42')),
        provenance: unwrap(parseFhirId('provenance-42')),
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.id).toBe('bundle-42')
    expect(
      result.value.entry.find(
        ({ resource }) => resource.resourceType === 'DocumentReference',
      )?.resource.id,
    ).toBe('document-42')
  })

  it.each([
    ['google-health-api', 'steps'],
    ['google-health-api', 'blood-glucose'],
    ['oura', 'sleep'],
    ['withings', 'getmeas:11'],
  ] as const)('fails closed for non-raw %s/%s sources', (provider, source) => {
    expect(buildProviderRecordingBundle(rawInput(provider, source)).ok).toBe(
      false,
    )
  })

  it('rejects unknown provider fields rather than silently stripping them', () => {
    const input = rawInput('google-health-api', 'heart-rate')
    expect(
      parseProviderRecordingBundleInput({
        ...input,
        source: { ...input.source, vendorPayload: { bpm: 64 } },
      }).ok,
    ).toBe(false)
    expect(
      parseProviderRecordingBundleInput({
        ...input,
        attachment: { ...input.attachment, bearerToken: 'secret' },
      }).ok,
    ).toBe(false)
  })

  it('fails closed for absent, ambiguous, or unsupported raw payload assertions', () => {
    const input = rawInput('google-health-api', 'heart-rate')
    const attachmentWithoutAssertion = {
      kind: 'embedded',
      contentType: input.attachment.contentType,
      title: input.attachment.title,
      dataBase64:
        input.attachment.kind === 'embedded' ?
          input.attachment.dataBase64
        : 'AQID',
    }
    for (const attachment of [
      attachmentWithoutAssertion,
      {
        ...attachmentWithoutAssertion,
        payloadAssertion: [
          'caller-authorized-opaque-payload',
          'verified-sanitized-input',
        ],
      },
      { ...attachmentWithoutAssertion, payloadAssertion: 'unreviewed' },
    ]) {
      expect(
        parseProviderRecordingBundleInput({
          ...input,
          attachment,
        }).ok,
      ).toBe(false)
    }
  })

  it.each([
    ['empty data', { dataBase64: '' }],
    ['noncanonical base64', { dataBase64: 'AQI' }],
    ['invalid media type', { contentType: 'application/json; charset=utf-8' }],
  ])('rejects %s', (_name, change) => {
    const input = rawInput('google-health-api', 'heart-rate')
    expect(
      buildProviderRecordingBundle({
        ...input,
        attachment: { ...input.attachment, ...change },
      } as ProviderRecordingBundleInput).ok,
    ).toBe(false)
  })

  it('rejects invalid external integrity and URL metadata', () => {
    const input = rawInput('oura', 'heartrate')
    const external = {
      kind: 'external',
      contentType: 'application/json',
      title: 'Authorized recording',
      format: 'provider-json-1',
      payloadAssertion: 'caller-authorized-opaque-payload',
      url: 'ftp://objects.example.org/recording',
      size: 0,
      hash: 'AQID',
      immutabilityAssurance: 'immutable-version-specific',
    } as const
    expect(
      buildProviderRecordingBundle({
        ...input,
        attachment: external,
      } as unknown as ProviderRecordingBundleInput).ok,
    ).toBe(false)

    expect(
      buildProviderRecordingBundle({
        ...input,
        attachment: {
          ...external,
          url: 'https://objects.example.org/recording/version-42',
          size: 2_147_483_648,
          hash: 'cDeAcZjCKn0rCAc3HXY3eahP388=',
        },
      } as unknown as ProviderRecordingBundleInput).ok,
    ).toBe(false)
  })

  it('rejects a 32-byte SHA-256 digest where R4 requires a 20-byte SHA-1 hash', () => {
    expect(
      parseSha1Base64('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=').ok,
    ).toBe(false)
  })

  it('fails closed across the base64, media-type, and immutable-URL primitive boundaries', () => {
    expect(parseCanonicalBase64(42).ok).toBe(false)
    expect(parseCanonicalBase64('AB==').ok).toBe(false)
    expect(encodeRecordingBytes(new Uint8Array()).ok).toBe(false)
    expect(encodeRecordingBytes('AQID' as unknown as Uint8Array).ok).toBe(false)
    expect(parseSha1Base64(42).ok).toBe(false)
    expect(parseMediaType(42).ok).toBe(false)
    expect(parseImmutableRecordingUrl(42).ok).toBe(false)
    expect(
      parseImmutableRecordingUrl('https://objects.example.org/a b').ok,
    ).toBe(false)
    expect(
      parseImmutableRecordingUrl('https://user@example.org/recording').ok,
    ).toBe(false)
    expect(
      parseImmutableRecordingUrl('https://objects.example.org/%FF').ok,
    ).toBe(false)
    expect(
      parseImmutableRecordingUrl('https://objects.example.org/%ZZ').ok,
    ).toBe(false)
    expect(parseImmutableRecordingUrl('::::').ok).toBe(false)
    expect(parseImmutableRecordingUrl('not an absolute URL').ok).toBe(false)
  })

  it.each(['title', 'url', 'repository', 'application'] as const)(
    'rejects sourceNativeId leakage through %s metadata',
    (location) => {
      const input = rawInput('google-health-api', 'heart-rate')
      const nativeId = input.source.sourceNativeId
      let candidate: unknown
      if (location === 'title') {
        candidate = {
          ...input,
          attachment: {
            ...input.attachment,
            title: `Recording ${nativeId}`,
          },
        }
      } else if (location === 'url') {
        candidate = {
          ...input,
          attachment: {
            kind: 'external',
            contentType: unwrap(parseMediaType('application/json')),
            title: 'Authorized recording',
            format: 'provider-json-1',
            payloadAssertion: 'caller-authorized-opaque-payload',
            url: `https://objects.example.org/${nativeId}`,
            size: unwrap(parsePositiveInteger(3)),
            hash: unwrap(parseSha1Base64('cDeAcZjCKn0rCAc3HXY3eahP388=')),
            immutabilityAssurance: 'immutable-version-specific',
          },
        }
      } else if (location === 'repository') {
        candidate = { ...input, repositoryIds: { document: nativeId } }
      } else {
        candidate = {
          ...input,
          application: {
            ...input.application,
            name: `Converter ${nativeId}`,
          },
        }
      }
      expect(
        buildProviderRecordingBundle(candidate as ProviderRecordingBundleInput)
          .ok,
      ).toBe(false)
    },
  )

  it('rejects provider-account pseudonym leakage through emitted metadata', () => {
    const input = rawInput('google-health-api', 'heart-rate')
    expect(
      buildProviderRecordingBundle({
        ...input,
        attachment: {
          ...input.attachment,
          title: `Recording ${input.source.providerAccountIdentifier.value}`,
        },
      }).ok,
    ).toBe(false)
  })

  it('rejects identity leakage through external and computed Attachment.hash metadata', () => {
    const input = rawInput('google-health-api', 'heart-rate')
    const emittedHash = 'cDeAcZjCKn0rCAc3HXY3eahP388='
    const privateSource = {
      ...input.source,
      sourceNativeId: emittedHash,
    }
    expect(
      buildProviderRecordingBundle({
        ...input,
        source: privateSource,
      }).ok,
    ).toBe(false)
    expect(
      buildProviderRecordingBundle({
        ...input,
        source: privateSource,
        attachment: {
          kind: 'external',
          contentType: unwrap(parseMediaType('application/json')),
          title: 'Authorized recording',
          format: 'provider-json-1',
          payloadAssertion: 'verified-sanitized-input',
          url: unwrap(
            parseImmutableRecordingUrl(
              'https://objects.example.org/recordings/version-42',
            ),
          ),
          size: unwrap(parsePositiveInteger(3)),
          hash: unwrap(parseSha1Base64(emittedHash)),
          immutabilityAssurance: 'immutable-version-specific',
        },
      }).ok,
    ).toBe(false)
  })

  it('rejects recursively percent-encoded identity leakage through attachment URLs', () => {
    const input = rawInput('google-health-api', 'heart-rate')
    const privateValue = 'native record/42'
    const encoded = encodeURIComponent(encodeURIComponent(privateValue))
    expect(
      buildProviderRecordingBundle({
        ...input,
        source: { ...input.source, sourceNativeId: privateValue },
        attachment: {
          kind: 'external',
          contentType: unwrap(parseMediaType('application/json')),
          title: 'Authorized recording',
          format: 'provider-json-1',
          payloadAssertion: 'verified-sanitized-input',
          url: unwrap(
            parseImmutableRecordingUrl(
              `https://objects.example.org/recordings/${encoded}`,
            ),
          ),
          size: unwrap(parsePositiveInteger(3)),
          hash: unwrap(parseSha1Base64('cDeAcZjCKn0rCAc3HXY3eahP388=')),
          immutabilityAssurance: 'immutable-version-specific',
        },
      }).ok,
    ).toBe(false)
  })

  it('rejects duplicate business identities in the resource graph', () => {
    const input = rawInput('withings', 'sleepIntraday')
    expect(
      buildProviderRecordingBundle({
        ...input,
        source: { ...input.source, dataOrigin: input.application },
      }).ok,
    ).toBe(false)
  })

  it.each(['source', 'application', 'data-origin'] as const)(
    'rejects invalid Unicode identity input in the %s identity role',
    (role) => {
      const input = rawInput('google-health-api', 'heart-rate')
      const invalid = '\ud800'
      let candidate: ProviderRecordingBundleInput
      if (role === 'source') {
        candidate = {
          ...input,
          source: { ...input.source, sourceNativeId: invalid },
        }
      } else if (role === 'application') {
        candidate = {
          ...input,
          application: {
            ...input.application,
            identity: identity('https://example.org/applications', invalid),
          },
        }
      } else {
        candidate = {
          ...input,
          source: {
            ...input.source,
            dataOrigin: {
              ...input.source.dataOrigin,
              identity: identity('https://example.org/data-origins', invalid),
            },
          },
        }
      }
      expect(parseProviderRecordingBundleInput(candidate).ok).toBe(false)
      expect(buildProviderRecordingBundle(candidate).ok).toBe(false)
    },
  )

  it.each([
    [
      'provider account value',
      (input: ProviderRecordingBundleInput) => ({
        ...input,
        source: {
          ...input.source,
          providerAccountIdentifier: {
            ...input.source.providerAccountIdentifier,
            value: '  ',
          },
        },
      }),
    ],
    [
      'source native id',
      (input: ProviderRecordingBundleInput) => ({
        ...input,
        source: { ...input.source, sourceNativeId: '\t' },
      }),
    ],
    [
      'source type',
      (input: ProviderRecordingBundleInput) => ({
        ...input,
        source: { ...input.source, sourceType: '\n ' },
      }),
    ],
    [
      'converter identifier',
      (input: ProviderRecordingBundleInput) => ({
        ...input,
        application: {
          ...input.application,
          identity: {
            ...input.application.identity,
            identifier: {
              ...input.application.identity.identifier,
              value: '   ',
            },
          },
        },
      }),
    ],
    [
      'data-origin identifier',
      (input: ProviderRecordingBundleInput) => ({
        ...input,
        source: {
          ...input.source,
          dataOrigin: {
            ...input.source.dataOrigin,
            identity: {
              ...input.source.dataOrigin.identity,
              identifier: {
                ...input.source.dataOrigin.identity.identifier,
                value: ' \t ',
              },
            },
          },
        },
      }),
    ],
  ] as const)('rejects a whitespace-only %s', (_name, mutate) => {
    expect(
      parseProviderRecordingBundleInput(
        mutate(rawInput('google-health-api', 'heart-rate')),
      ).ok,
    ).toBe(false)
  })

  it('round-trips arbitrary non-empty byte arrays to canonical base64', () => {
    assert(
      property(uint8Array({ minLength: 1, maxLength: 512 }), (bytes) => {
        const encoded = encodeRecordingBytes(bytes)
        expect(encoded.ok).toBe(true)
        if (!encoded.ok) return
        expect(
          parseProviderRecordingBundleInput({
            ...rawInput('google-health-api', 'heart-rate'),
            attachment: {
              ...rawInput('google-health-api', 'heart-rate').attachment,
              dataBase64: encoded.value,
            },
          }).ok,
        ).toBe(true)
      }),
    )
  })

  it('exposes a result-typed, closed recording facade', () => {
    const result = buildProviderRecordingBundle(
      rawInput('google-health-api', 'heart-rate'),
    )
    expectTypeOf(result).toExtend<
      Result<import('../src/r4/index.js').CollectionBundle>
    >()
  })
})
