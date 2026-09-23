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
  application,
  context,
  conversionInstant,
  identifierSystem,
  identityScope,
  instant,
  repositoryScope,
  unwrap,
  uri,
} from './provider-test-support.js'
import { adapterSourceMarkerClaims } from '../src/contract/measurement-catalog.generated.js'
import {
  parseFhirId,
  parseExchangeGraph,
  parsePartIndex,
  parsePositiveInteger,
  type Result,
} from '../src/index.js'
import {
  buildProviderRecordingGraph,
  deriveProviderRecordIdentity,
  groveRecordingFormatRegistry,
  healthKitClinicalRecordAdmission,
  providerRawOutputRoles,
  encodeRecordingBytes,
  parseCanonicalBase64,
  parseProviderRecordingAttachment,
  parseProviderRecordingSource,
  parseImmutableRecordingUrl,
  parseMediaType,
  parseSha1Base64,
  type ConnectedRawProvider,
  type ProviderRecordingAttachment,
  type ProviderRecordingConversion,
  type ProviderRecordingSource,
} from '../src/providers/index.js'

const rawSource = (
  provider: ConnectedRawProvider,
  sourceType: string,
): ProviderRecordingSource =>
  ({
    adapter: { kind: 'providers', provider },
    sourceType,
    sourceNativeId: `native-record-${provider}-${sourceType}`,
    writer: {
      sourceDeviceToken: `origin-${provider}`,
      name: `${provider} source`,
    },
    effective: {
      kind: 'period',
      start: instant('2026-08-20T00:00:00Z'),
      end: instant('2026-08-20T12:00:00Z'),
    },
  }) as ProviderRecordingSource

const embedded: ProviderRecordingAttachment = {
  kind: 'embedded',
  contentType: unwrap(
    parseMediaType(
      groveRecordingFormatRegistry.formats['provider-recording']
        .contentTypes[0],
    ),
  ),
  title: 'Authorized minimized provider recording',
  format: 'provider-recording',
  payloadAssertion: 'caller-authorized-opaque-payload',
  dataBase64: unwrap(encodeRecordingBytes(Uint8Array.of(1, 2, 3))),
}

const build = (
  source: ProviderRecordingSource,
  attachment: ProviderRecordingAttachment = embedded,
  overrides = {},
): Result<ProviderRecordingConversion> =>
  buildProviderRecordingGraph(
    source,
    attachment,
    context(source.adapter.provider, '1', overrides),
  )

const recordingSources = Object.entries(providerRawOutputRoles).flatMap(
  ([provider, sources]) =>
    Object.keys(sources).map((sourceType) => [provider, sourceType] as const),
)

type MutableJsonObject = Record<string, unknown>

const mutableObject = (value: unknown, label: string): MutableJsonObject => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Expected ${label} to be a JSON object.`)
  }
  return value as MutableJsonObject
}

const mutableRecordingGraph = (): {
  readonly bundle: unknown
  readonly document: MutableJsonObject
} => {
  const bundle = structuredClone(
    unwrap(build(rawSource('google-health-api', 'heart-rate'))).graph,
  )
  const entries = mutableObject(bundle, 'Bundle').entry
  if (!Array.isArray(entries)) throw new Error('Expected Bundle.entry.')
  const documentEntry: unknown = entries.find(
    (entry: unknown) =>
      mutableObject(mutableObject(entry, 'entry').resource, 'resource')
        .resourceType === 'DocumentReference',
  )
  if (documentEntry === undefined) {
    throw new Error('Expected a recording DocumentReference entry.')
  }
  return {
    bundle,
    document: mutableObject(
      mutableObject(documentEntry, 'DocumentReference entry').resource,
      'DocumentReference',
    ),
  }
}

const documentOf = (conversion: ProviderRecordingConversion) => {
  const document = conversion.graph.entry.find(
    ({ resource }) => resource.resourceType === 'DocumentReference',
  )?.resource
  if (document?.resourceType !== 'DocumentReference') {
    throw new Error('Missing recording document.')
  }
  return document
}

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
    ) as {
      source: ProviderRecordingSource
      attachment: ProviderRecordingAttachment
    }
    expect(parseProviderRecordingSource(fixture.source).ok).toBe(true)
    expect(parseProviderRecordingAttachment(fixture.attachment).ok).toBe(true)
    expect(build(fixture.source, fixture.attachment).ok).toBe(true)
  })

  it.each(recordingSources)(
    'admits the exact catalogued %s/%s raw source',
    (provider, sourceType) => {
      const result = build(
        rawSource(provider as ConnectedRawProvider, sourceType),
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.value.graph.entry).toHaveLength(5)
      expect(Object.isFrozen(result.value.graph)).toBe(true)
      expect(result.value.warnings).toEqual([])
      const document = documentOf(result.value)
      expect(document.meta?.profile).toEqual([
        'https://grovealliance.org/fhir/sensor/StructureDefinition/grove-sensor-recording-document',
        'https://grovealliance.org/fhir/providers/StructureDefinition/providers-recording-document',
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
      expect(document.identifier?.map(({ system }) => system)).toEqual([
        identityScope.systems.opaque['provider-record'],
        identityScope.systems.opaque['provider-output'],
        identityScope.systems.opaque['provider-artifact'],
      ])
      expect(document.id).toBeUndefined()
      expect(document.date).toBe(conversionInstant)
      expect(result.value.identifiers.sourceArtifact?.role).toBe(
        'source-artifact',
      )
      expect(result.value.identifiers.outputs).toHaveLength(1)
      const sourceRecord = unwrap(
        deriveProviderRecordIdentity(identityScope, {
          providerCode: provider as ConnectedRawProvider,
          sourceType,
          providerScope: repositoryScope(provider as ConnectedRawProvider),
          nativeRecordId: `native-record-${provider}-${sourceType}`,
        }),
      )
      expect(result.value.identifiers).toMatchObject({
        sourceRecord: sourceRecord.identifier,
        outputs: [
          unwrap(
            sourceRecord.output({
              role: 'native-recording',
              discriminator: 'single',
            }),
          ),
        ],
        sourceArtifact: unwrap(
          sourceRecord.artifact({
            formatCode: 'provider-recording',
            partIndex: unwrap(parsePartIndex('0')),
          }),
        ),
      })
    },
  )

  it('keeps optional Attachment.title presentation text optional end to end', () => {
    const attachment = structuredClone(embedded)
    Reflect.deleteProperty(attachment, 'title')
    const result = build(rawSource('oura', 'heartrate'), attachment)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(
      documentOf(result.value).content[0]?.attachment.title,
    ).toBeUndefined()
    expect(parseExchangeGraph(result.value.graph).ok).toBe(true)
  })

  it('keeps an unversioned writer identity and never emits a version without it', () => {
    const input = rawSource('withings', 'activityIntraday')
    const writerRecord = {
      applicationIdentifier: {
        system: identifierSystem('https://example.org/applications'),
        value: 'writer-app',
      },
      nativeRecordId: 'writer-record-1',
    } as const
    const unversioned = build({ ...input, writerRecord })
    const versioned = build({
      ...input,
      writerRecord: { ...writerRecord, version: '7' },
    })
    expect(unversioned.ok && versioned.ok).toBe(true)
    if (!unversioned.ok || !versioned.ok) return
    const writerVersionUrl =
      'https://grovealliance.org/fhir/mobile/StructureDefinition/grove-writer-record-version'
    const hasWriterIdentity = (conversion: ProviderRecordingConversion) =>
      documentOf(conversion).identifier?.some((candidate) =>
        candidate.type?.coding?.some(({ code }) => code === 'writer-record'),
      )
    expect(hasWriterIdentity(unversioned.value)).toBe(true)
    expect(unversioned.value.identifiers.writerRecord?.role).toBe(
      'writer-record',
    )
    expect(
      documentOf(unversioned.value).extension?.some(
        ({ url }) => url === writerVersionUrl,
      ),
    ).not.toBe(true)
    expect(hasWriterIdentity(versioned.value)).toBe(true)
    expect(documentOf(versioned.value).extension).toEqual(
      expect.arrayContaining([{ url: writerVersionUrl, valueString: '7' }]),
    )
    expect(
      parseProviderRecordingSource({ ...input, writerRecordVersion: '1' }),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'mobile-input.value-shape-invalid' }],
    })
  })

  it('accepts the catalog-owned direct-only HealthKit clinical document claim', () => {
    const { bundle, document } = mutableRecordingGraph()
    const representation = healthKitClinicalRecordAdmission.fhirRepresentation
    const healthKitMarker = adapterSourceMarkerClaims.find(
      ({ adapter }) => adapter === 'healthkit',
    )?.markers[0]
    if (healthKitMarker === undefined) {
      throw new Error('Expected the generated HealthKit source marker.')
    }
    document.meta = { profile: [healthKitClinicalRecordAdmission.profile] }
    document.extension = [
      {
        url: healthKitMarker.url,
        valueCode: 'HKClinicalTypeIdentifierAllergyRecord',
      },
    ]
    document.type = {
      coding: [
        {
          system:
            'https://grovealliance.org/fhir/healthkit/CodeSystem/healthkit-clinical-record-type',
          code: 'allergy-record',
        },
      ],
    }
    document.content = [
      {
        format: {
          system:
            'https://grovealliance.org/fhir/sensor/CodeSystem/grove-recording-format',
          code: healthKitClinicalRecordAdmission.payloadFormat,
        },
        attachment: {
          contentType: representation.contentTypeByRelease.r4,
          title: 'Provider-issued AllergyIntolerance',
          data: 'eyJyZXNvdXJjZVR5cGUiOiJBbGxlcmd5SW50b2xlcmFuY2UiLCJwYXRpZW50Ijp7ImlkZW50aWZpZXIiOnsic3lzdGVtIjoiaHR0cHM6Ly9leGFtcGxlLm9yZy9wYXRpZW50IiwidmFsdWUiOiJwc2V1ZG9ueW0ifX19',
          size: 123,
          hash: 'YfNHVrD+ah32NnVUmsFrxFQajhE=',
        },
      },
    ]
    const entries = mutableObject(bundle, 'Bundle').entry
    if (!Array.isArray(entries)) throw new Error('Expected Bundle.entry.')
    const provenanceEntry: unknown = entries.find(
      (entry: unknown) =>
        mutableObject(mutableObject(entry, 'entry').resource, 'resource')
          .resourceType === 'Provenance',
    )
    mutableObject(
      mutableObject(provenanceEntry, 'Provenance entry').resource,
      'Provenance',
    ).meta = {
      profile: [
        'https://grovealliance.org/fhir/healthkit/StructureDefinition/healthkit-conversion-provenance',
      ],
    }
    expect(parseExchangeGraph(bundle).ok).toBe(true)

    const wrongDirectProfiles = structuredClone(bundle)
    const wrongEntries = mutableObject(wrongDirectProfiles, 'Bundle').entry
    if (!Array.isArray(wrongEntries)) throw new Error('Expected Bundle.entry.')
    const wrongDocumentEntry: unknown = wrongEntries.find(
      (entry: unknown) =>
        mutableObject(mutableObject(entry, 'entry').resource, 'resource')
          .resourceType === 'DocumentReference',
    )
    mutableObject(
      mutableObject(wrongDocumentEntry, 'DocumentReference entry').resource,
      'DocumentReference',
    ).meta = {
      profile: [
        'https://grovealliance.org/fhir/sensor/StructureDefinition/grove-sensor-recording-document',
        healthKitClinicalRecordAdmission.profile,
      ],
    }
    expect(parseExchangeGraph(wrongDirectProfiles).ok).toBe(false)

    const clinicalDocumentIn = (
      candidate: unknown,
    ): Record<string, unknown> => {
      const candidateEntries = mutableObject(candidate, 'clinical Bundle').entry
      if (!Array.isArray(candidateEntries))
        throw new Error('Expected Bundle.entry.')
      const candidateDocumentEntry: unknown = candidateEntries.find(
        (entry: unknown) =>
          mutableObject(mutableObject(entry, 'entry').resource, 'resource')
            .resourceType === representation.resourceType,
      )
      return mutableObject(
        mutableObject(candidateDocumentEntry, 'clinical entry').resource,
        'clinical DocumentReference',
      )
    }
    const contentOf = (candidate: Record<string, unknown>) =>
      mutableObject(
        Array.isArray(candidate.content) ? candidate.content[0] : undefined,
        'clinical content',
      )
    for (const mutate of [
      (candidate: Record<string, unknown>) => {
        mutableObject(
          contentOf(candidate).attachment,
          'attachment',
        ).contentType = 'application/fhir+json'
      },
      (candidate: Record<string, unknown>) => {
        mutableObject(contentOf(candidate).format, 'format').code =
          'fhir-collection-bundle'
      },
    ]) {
      const candidate = structuredClone(bundle)
      mutate(clinicalDocumentIn(candidate))
      const result = parseExchangeGraph(candidate)
      expect(result.ok).toBe(false)
      if (result.ok) continue
      expect(result.issues.map(({ code }) => code)).toContain(
        'healthkit-clinical.fhir-representation',
      )
    }
    for (const release of healthKitClinicalRecordAdmission.admittedFHIRReleases) {
      const candidate = structuredClone(bundle)
      mutableObject(
        contentOf(clinicalDocumentIn(candidate)).attachment,
        'attachment',
      ).contentType = representation.contentTypeByRelease[release]
      expect(parseExchangeGraph(candidate).ok).toBe(true)
    }
  })

  it('emits exact embedded bytes, computed SHA-1 integrity, and a complete audit graph', () => {
    const source = rawSource('google-health-api', 'heart-rate')
    const result = build(source)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const document = documentOf(result.value)
    const provenance = result.value.graph.entry.find(
      ({ resource }) => resource.resourceType === 'Provenance',
    )?.resource
    expect(document.content).toEqual([
      {
        attachment: {
          contentType: embedded.contentType,
          data: 'AQID',
          size: 3,
          hash: 'cDeAcZjCKn0rCAc3HXY3eahP388=',
          title: embedded.title,
        },
        format: {
          system:
            'https://grovealliance.org/fhir/sensor/CodeSystem/grove-recording-format',
          code: 'provider-recording',
          display: 'Provider Recording',
        },
      },
    ])
    expect(document.status).toBe('current')
    expect(document.author).toHaveLength(1)
    if (provenance?.resourceType !== 'Provenance')
      throw new Error('No Provenance.')
    expect(provenance.meta?.profile).toEqual([
      'https://grovealliance.org/fhir/providers/StructureDefinition/providers-conversion-provenance',
    ])
    expect(provenance.target).toEqual([
      { reference: result.value.graph.entry[0].fullUrl },
    ])
    expect(provenance.occurredPeriod).toEqual({
      start: '2026-08-20T00:00:00.000Z',
      end: '2026-08-20T12:00:00.000Z',
    })
    expect(provenance.recorded).toBe(conversionInstant)
    expect(provenance.entity?.[0]?.what.identifier?.system).toBe(
      identityScope.systems.opaque['provider-record'],
    )
    const serialized = JSON.stringify(result.value.graph)
    expect(serialized).not.toContain(source.sourceNativeId)
    expect(serialized).not.toContain(
      context('google-health-api').repositoryScope.value,
    )
    expect(serialized).not.toContain('payloadAssertion')
  })

  it.each([
    {
      name: 'missing source-artifact identity',
      mutate: (document: MutableJsonObject) => {
        const identifiers = document.identifier
        if (!Array.isArray(identifiers))
          throw new Error('Expected identifiers.')
        document.identifier = identifiers.filter((candidate) => {
          const codings = mutableObject(
            mutableObject(candidate, 'Identifier').type,
            'Identifier.type',
          ).coding
          return !(
            Array.isArray(codings) &&
            codings.some(
              (coding) =>
                mutableObject(coding, 'Identifier.type.coding').code ===
                'source-artifact',
            )
          )
        })
      },
    },
    {
      name: 'unadmitted source-context identity role',
      mutate: (document: MutableJsonObject) => {
        const identifiers = document.identifier
        if (!Array.isArray(identifiers))
          throw new Error('Expected identifiers.')
        const codings = mutableObject(
          mutableObject(identifiers[2], 'source-artifact Identifier').type,
          'Identifier.type',
        ).coding
        if (!Array.isArray(codings)) throw new Error('Expected type coding.')
        mutableObject(codings[0], 'Identifier.type.coding').code =
          'source-context'
      },
    },
    {
      name: 'unexpected recording registry version',
      mutate: (document: MutableJsonObject) => {
        const content = document.content
        if (!Array.isArray(content)) throw new Error('Expected content.')
        mutableObject(
          mutableObject(content[0], 'content').format,
          'format',
        ).version = '1.2.3'
      },
    },
    {
      name: 'wrong recording media type',
      mutate: (document: MutableJsonObject) => {
        const content = document.content
        if (!Array.isArray(content)) throw new Error('Expected content.')
        mutableObject(
          mutableObject(content[0], 'content').attachment,
          'attachment',
        ).contentType = 'application/octet-stream'
      },
    },
    {
      name: 'second content entry',
      mutate: (document: MutableJsonObject) => {
        const content = document.content
        if (!Array.isArray(content)) throw new Error('Expected content.')
        content.push(structuredClone(content[0]))
      },
    },
    {
      name: 'wrong embedded byte count',
      mutate: (document: MutableJsonObject) => {
        const content = document.content
        if (!Array.isArray(content)) throw new Error('Expected content.')
        mutableObject(
          mutableObject(content[0], 'content').attachment,
          'attachment',
        ).size = 4
      },
    },
    {
      name: 'wrong embedded SHA-1 digest',
      mutate: (document: MutableJsonObject) => {
        const content = document.content
        if (!Array.isArray(content)) throw new Error('Expected content.')
        mutableObject(
          mutableObject(content[0], 'content').attachment,
          'attachment',
        ).hash = 'AAAAAAAAAAAAAAAAAAAAAAAAAAA='
      },
    },
    ...(['type', 'subject', 'date'] as const).map((property) => ({
      name: `missing required ${property}`,
      mutate: (document: MutableJsonObject) => {
        Reflect.deleteProperty(document, property)
      },
    })),
  ])('rejects a recording document with $name', ({ mutate }) => {
    const { bundle, document } = mutableRecordingGraph()
    mutate(document)
    expect(parseExchangeGraph(bundle).ok).toBe(false)
  })

  it('matches the frozen raw source/output identity vectors', () => {
    const result = build({
      ...rawSource('google-health-api', 'heart-rate'),
      sourceNativeId: 'heart-rate-2026-08-20',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const document = documentOf(result.value)
    expect(document.identifier).toHaveLength(3)
    for (const entry of document.identifier ?? []) {
      expect(entry.value).toMatch(/^v0:test-key:1:[A-Za-z0-9_-]{43}$/u)
    }
  })

  it('places an explicitly governed native Identifier only on the sole recording DocumentReference', () => {
    const source = rawSource('google-health-api', 'heart-rate')
    const nativeSystem = identifierSystem(
      'https://example.org/repositories/google-account-4/recordings',
    )
    const result = buildProviderRecordingGraph(
      source,
      embedded,
      context('google-health-api'),
      {
        nativeIdentifierDisclosure: {
          kind: 'authorized',
          system: nativeSystem,
          type: {
            coding: [
              {
                system: uri('https://example.org/identifier-types'),
                code: 'provider-record-id',
                display: 'Provider record id',
              },
            ],
          },
        },
      },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const carrying = result.value.graph.entry.filter(({ resource }) =>
      (
        resource as {
          readonly identifier?: ReadonlyArray<{
            readonly system?: string
            readonly value?: string
          }>
        }
      ).identifier?.some(
        ({ system, value }) =>
          system === nativeSystem && value === source.sourceNativeId,
      ),
    )
    expect(carrying).toHaveLength(1)
    expect(carrying[0]?.resource.resourceType).toBe('DocumentReference')
    expect(
      documentOf(result.value).identifier?.find(
        ({ system }) => system === nativeSystem,
      ),
    ).toEqual({
      system: nativeSystem,
      value: source.sourceNativeId,
      type: {
        coding: [
          {
            system: 'https://example.org/identifier-types',
            code: 'provider-record-id',
            display: 'Provider record id',
          },
        ],
      },
    })
  })

  it.each([
    [
      'a relative key-space system',
      { kind: 'authorized', system: 'recordings' },
    ],
    [
      'the Grove entry identity system',
      { kind: 'authorized', system: identityScope.systems.entryNode },
    ],
    [
      'a Grove graph-role type coding',
      {
        kind: 'authorized',
        system: 'https://example.org/repositories/recordings',
        type: {
          coding: [
            {
              system:
                'https://grovealliance.org/fhir/mobile/CodeSystem/grove-identifier-role',
              code: 'source-output',
            },
          ],
        },
      },
    ],
  ])('rejects recording source disclosure using %s', (_name, disclosure) => {
    const result = buildProviderRecordingGraph(
      rawSource('oura', 'heartrate'),
      embedded,
      context('oura'),
      { nativeIdentifierDisclosure: disclosure as never },
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    for (const issue of result.issues) expect(issue.code).not.toMatch(/\./u)
  })

  it('supports an immutable external attachment without copying or fetching it', () => {
    const result = build(rawSource('oura', 'heartrate'), {
      kind: 'external',
      contentType: embedded.contentType,
      title: 'Authorized minimized Oura recording',
      format: 'provider-recording',
      payloadAssertion: 'verified-sanitized-input',
      url: unwrap(
        parseImmutableRecordingUrl(
          'https://objects.example.org/recordings/version-42',
        ),
      ),
      size: unwrap(parsePositiveInteger(3)),
      hash: unwrap(parseSha1Base64('cDeAcZjCKn0rCAc3HXY3eahP388=')),
      immutabilityAssurance: 'immutable-version-specific',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(documentOf(result.value).content[0]?.attachment).toMatchObject({
      url: 'https://objects.example.org/recordings/version-42',
      size: 3,
      hash: 'cDeAcZjCKn0rCAc3HXY3eahP388=',
    })
    expect(documentOf(result.value).content[0]?.attachment.data).toBeUndefined()
    const serialized = JSON.stringify(result.value.graph)
    expect(serialized).not.toContain('verified-sanitized-input')
  })

  it('retains repository-assigned ids while keeping digest identities out of Resource.id', () => {
    const result = build(rawSource('withings', 'activityIntraday'), embedded, {
      repositoryIds: {
        bundle: unwrap(parseFhirId('bundle-42')),
        'primary-output': unwrap(parseFhirId('document-42')),
        provenance: unwrap(parseFhirId('provenance-42')),
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.graph.id).toBe('bundle-42')
    expect(documentOf(result.value).id).toBe('document-42')
  })

  it.each([
    ['google-health-api', 'steps'],
    ['google-health-api', 'blood-glucose'],
    ['oura', 'sleep'],
    ['withings', 'getmeas:11'],
  ] as const)('fails closed for non-raw %s/%s sources', (provider, source) => {
    expect(build(rawSource(provider, source))).toMatchObject({
      ok: false,
      issues: [
        { code: 'mobile-input.unsupported-source-type', path: ['sourceType'] },
      ],
    })
  })

  it('refuses unknown provider fields rather than silently stripping them', () => {
    const source = rawSource('google-health-api', 'heart-rate')
    expect(
      parseProviderRecordingSource({ ...source, vendorPayload: { bpm: 64 } }),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'mobile-input.value-shape-invalid' }],
    })
    expect(
      parseProviderRecordingAttachment({ ...embedded, bearerToken: 'secret' }),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'mobile-input.value-shape-invalid' }],
    })
  })

  it('fails closed for absent, ambiguous, or unsupported raw payload assertions', () => {
    const attachmentWithoutAssertion = {
      kind: 'embedded',
      contentType: embedded.contentType,
      title: embedded.title,
      dataBase64: 'AQID',
      format: 'provider-recording',
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
      expect(parseProviderRecordingAttachment(attachment).ok).toBe(false)
    }
  })

  it.each([
    ['empty data', { dataBase64: '' }, 'mobile-input.empty-recording-series'],
    [
      'noncanonical base64',
      { dataBase64: 'AQI' },
      'mobile-input.empty-recording-series',
    ],
    [
      'invalid media type',
      { contentType: 'application/json; charset=utf-8' },
      'mobile-input.value-shape-invalid',
    ],
    [
      'an unregistered media type',
      { contentType: 'text/plain' },
      'mobile-input.unsupported-source-value',
    ],
  ])('refuses %s', (_name, change, code) => {
    expect(
      parseProviderRecordingAttachment({ ...embedded, ...change }),
    ).toMatchObject({
      ok: false,
      issues: [{ code }],
    })
  })

  it('refuses invalid external integrity and URL metadata', () => {
    const external = {
      kind: 'external',
      contentType: embedded.contentType,
      title: 'Authorized recording',
      format: 'provider-recording',
      payloadAssertion: 'caller-authorized-opaque-payload',
      url: 'ftp://objects.example.org/recording',
      size: 0,
      hash: 'AQID',
      immutabilityAssurance: 'immutable-version-specific',
    } as const
    expect(parseProviderRecordingAttachment(external).ok).toBe(false)
    expect(
      parseProviderRecordingAttachment({
        ...external,
        url: 'https://objects.example.org/recording/version-42',
        size: 2_147_483_648,
        hash: 'cDeAcZjCKn0rCAc3HXY3eahP388=',
      }),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'mobile-input.recording-payload-too-large' }],
    })
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

  it('reports malformed recording inputs without throwing', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    for (const invalid of [null, undefined, 42, 'invalid', cyclic]) {
      expect(() => parseProviderRecordingSource(invalid)).not.toThrow()
      expect(parseProviderRecordingSource(invalid).ok).toBe(false)
      expect(() => parseProviderRecordingAttachment(invalid)).not.toThrow()
      expect(parseProviderRecordingAttachment(invalid).ok).toBe(false)
      expect(() =>
        buildProviderRecordingGraph(
          invalid as never,
          invalid as never,
          invalid as never,
        ),
      ).not.toThrow()
      expect(
        buildProviderRecordingGraph(
          invalid as never,
          invalid as never,
          invalid as never,
        ).ok,
      ).toBe(false)
    }
  })

  it('deduplicates one application snapshot across participation roles', () => {
    const result = build({
      ...rawSource('withings', 'sleepIntraday'),
      writer: application,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(
      result.value.graph.entry.filter(
        ({ resource }) => resource.resourceType === 'Device',
      ),
    ).toHaveLength(2)
    expect(result.value.graph.entry).toHaveLength(4)
  })

  it('refuses invalid Unicode in the source and faults it in the context', () => {
    const invalid = '\ud800'
    const source = rawSource('google-health-api', 'heart-rate')
    expect(
      parseProviderRecordingSource({ ...source, sourceNativeId: invalid }),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'mobile-input.text-not-unicode-scalar' }],
    })
    expect(
      parseProviderRecordingSource({
        ...source,
        writer: { ...source.writer, sourceDeviceToken: invalid },
      }),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'mobile-input.text-not-unicode-scalar' }],
    })
    const faulted = build(source, embedded, {
      application: { ...application, sourceDeviceToken: invalid },
    })
    expect(faulted.ok).toBe(false)
    if (!faulted.ok) expect(faulted.issues[0]?.code).toBe('invalid-identifier')
  })

  it.each([
    [
      'source native id',
      { sourceNativeId: '\t' },
      'mobile-input.native-identifier-invalid',
    ],
    ['source type', { sourceType: '\n ' }, 'mobile-input.value-shape-invalid'],
    [
      'writer token',
      { writer: { sourceDeviceToken: ' \t ', name: 'x' } },
      'mobile-input.value-shape-invalid',
    ],
  ] as const)('refuses a whitespace-only %s', (_name, change, code) => {
    expect(
      parseProviderRecordingSource({
        ...rawSource('google-health-api', 'heart-rate'),
        ...change,
      }),
    ).toMatchObject({ ok: false, issues: [{ code }] })
  })

  it('round-trips arbitrary non-empty byte arrays to canonical base64', () => {
    assert(
      property(uint8Array({ minLength: 1, maxLength: 512 }), (bytes) => {
        const encoded = encodeRecordingBytes(bytes)
        expect(encoded.ok).toBe(true)
        if (!encoded.ok) return
        expect(
          parseProviderRecordingAttachment({
            ...embedded,
            dataBase64: encoded.value,
          }).ok,
        ).toBe(true)
      }),
    )
  })

  it('exposes a result-typed, closed recording facade', () => {
    const result = build(rawSource('google-health-api', 'heart-rate'))
    expectTypeOf(result).toExtend<Result<ProviderRecordingConversion>>()
  })
})
