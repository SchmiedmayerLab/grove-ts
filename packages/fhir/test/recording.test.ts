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
  parseGroveMobileExchangeBundle,
  parsePositiveInteger,
  type FhirInstant,
  type Result,
} from '../src/index.js'
import { adapterSourceMarkerClaims } from '../src/mobile/measurement-catalog.generated.js'
import {
  buildProviderRecordingBundle,
  healthKitClinicalRecordAdmission,
  providerRawOutputRoles,
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
const converter: ApplicationDeviceInput = {
  sourceDeviceToken: 'converter-instance-7f3a',
  name: 'Grove converter',
  version: '0.0.0',
}
const patient = {
  type: 'Patient',
  identifier: {
    system: uri('https://example.org/deployments/patient-pseudonyms'),
    value: 'patient-example',
    assurance: 'deployment-scoped-pseudonym',
  },
} as const

const deploymentIdentity = {
  opaqueIdentifierSystems: {
    'source-record': uri('https://example.org/identity/source-record/test/1'),
    'source-output': uri('https://example.org/identity/source-output/test/1'),
    'writer-record': uri('https://example.org/identity/writer-record/test/1'),
    'provider-record': uri(
      'https://example.org/identity/provider-record/test/1',
    ),
    'provider-output': uri(
      'https://example.org/identity/provider-output/test/1',
    ),
    'source-artifact': uri(
      'https://example.org/identity/source-artifact/test/1',
    ),
    'provider-artifact': uri(
      'https://example.org/identity/provider-artifact/test/1',
    ),
    'source-context': uri('https://example.org/identity/source-context/test/1'),
    'recording-device': uri(
      'https://example.org/identity/recording-device/test/1',
    ),
    'device-snapshot': uri(
      'https://example.org/identity/device-snapshot/test/1',
    ),
  },
  eventIdentifierSystem: uri('https://example.org/identity/event'),
  entryNodeIdentifierSystem: uri('https://example.org/identity/entry-node'),
  keyId: 'test-key',
  keyEpoch: '1',
  secretBase64Url: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY',
  producerInstance: '1f5c58aa-6ec6-4e79-a682-829a9debd3f5',
} as const

const rawInput = (
  provider: ConnectedRawProvider,
  sourceType: string,
): ProviderRecordingBundleInput =>
  ({
    source: {
      adapter: { kind: 'providers', provider },
      providerScopeIdentifier:
        provider === 'oura' ?
          {
            system: uri('https://example.org/provider-key-spaces'),
            value: 'oura-document-uuid-global',
            assurance: 'documented-global-key-space',
          }
        : {
            system: uri('https://provider.example.org/accounts'),
            value: 'account-pseudonym-001',
            assurance: 'deployment-scoped-account-pseudonym',
          },
      sourceType,
      sourceNativeId: `native-record-${provider}-${sourceType}`,
      dataOrigin: {
        sourceDeviceToken: `origin-${provider}`,
        name: `${provider} source`,
      },
    },
    attachment: {
      kind: 'embedded',
      contentType: unwrap(parseMediaType('application/json')),
      title: 'Authorized minimized provider recording',
      format: 'provider-recording',
      payloadAssertion: 'caller-authorized-opaque-payload',
      dataBase64: unwrap(encodeRecordingBytes(Uint8Array.of(1, 2, 3))),
    },
    subject: patient,
    application: converter,
    eventSequence: '1',
    deploymentIdentity,
    documentDate: instant('2026-08-20T17:00:01Z'),
    occurred: instant('2026-08-20T17:00:00Z'),
    recorded: instant('2026-08-20T17:00:02Z'),
    assembled: instant('2026-08-20T17:00:03Z'),
  }) as ProviderRecordingBundleInput

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
  const built = buildProviderRecordingBundle(
    rawInput('google-health-api', 'heart-rate'),
  )
  if (!built.ok) throw new Error('Expected a valid recording graph fixture.')
  const bundle = structuredClone(built.value)
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

describe('Provider native recording graph', () => {
  it('enforces the catalog provider scope for native recordings', () => {
    const oura = rawInput('oura', 'heartrate')
    expect(
      parseProviderRecordingBundleInput({
        ...oura,
        source: {
          ...oura.source,
          providerScopeIdentifier: {
            system: uri('https://example.org/provider-accounts'),
            value: 'account-pseudonym',
            assurance: 'deployment-scoped-account-pseudonym',
          },
        },
      }).ok,
    ).toBe(false)

    const withings = rawInput('withings', 'activityIntraday')
    expect(
      parseProviderRecordingBundleInput({
        ...withings,
        source: {
          ...withings.source,
          providerScopeIdentifier: {
            system: uri('https://example.org/provider-key-spaces'),
            value: 'withings-global',
            assurance: 'documented-global-key-space',
          },
        },
      }).ok,
    ).toBe(false)
  })

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
        deploymentIdentity.opaqueIdentifierSystems['provider-record'],
        (
          deploymentIdentity.opaqueIdentifierSystems as Readonly<
            Record<string, string>
          >
        )['provider-output'],
        (
          deploymentIdentity.opaqueIdentifierSystems as Readonly<
            Record<string, string>
          >
        )['provider-artifact'],
      ])
      expect(document.id).toBeUndefined()
    },
  )

  it('keeps optional Attachment.title presentation text optional end to end', () => {
    const input = rawInput('oura', 'heartrate')
    const attachment = structuredClone(input.attachment)
    Reflect.deleteProperty(attachment, 'title')
    const result = buildProviderRecordingBundle({ ...input, attachment })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const document = result.value.entry.find(
      ({ resource }) => resource.resourceType === 'DocumentReference',
    )?.resource
    expect(document?.resourceType).toBe('DocumentReference')
    if (document?.resourceType !== 'DocumentReference') return
    expect(document.content[0]?.attachment.title).toBeUndefined()
    expect(parseGroveMobileExchangeBundle(result.value).ok).toBe(true)
  })

  it('keeps an unversioned writer identity and never emits a version without it', () => {
    const input = rawInput('withings', 'activityIntraday')
    const writerRecord = {
      applicationIdentifier: {
        system: uri('https://example.org/applications'),
        value: 'writer-app',
      },
      nativeRecordId: 'writer-record-1',
    } as const
    const unversioned = buildProviderRecordingBundle({
      ...input,
      source: { ...input.source, writerRecord },
    })
    const versioned = buildProviderRecordingBundle({
      ...input,
      source: {
        ...input.source,
        writerRecord: { ...writerRecord, version: '7' },
      },
      eventSequence: '2',
    })
    expect(unversioned.ok && versioned.ok).toBe(true)
    if (!unversioned.ok || !versioned.ok) return
    const document = (result: typeof unversioned) =>
      result.value.entry.find(
        ({ resource }) => resource.resourceType === 'DocumentReference',
      )?.resource
    const writerVersionUrl =
      'https://grovealliance.org/fhir/mobile/StructureDefinition/grove-writer-record-version'
    const hasWriterIdentity = (resource: ReturnType<typeof document>) =>
      resource?.resourceType === 'DocumentReference' &&
      resource.identifier?.some((candidate) =>
        candidate.type?.coding?.some(({ code }) => code === 'writer-record'),
      )

    expect(hasWriterIdentity(document(unversioned))).toBe(true)
    expect(
      document(unversioned)?.extension?.some(
        ({ url }) => url === writerVersionUrl,
      ),
    ).not.toBe(true)
    expect(hasWriterIdentity(document(versioned))).toBe(true)
    expect(document(versioned)?.extension).toEqual(
      expect.arrayContaining([{ url: writerVersionUrl, valueString: '7' }]),
    )
    expect(
      parseProviderRecordingBundleInput({
        ...input,
        source: { ...input.source, writerRecordVersion: '1' },
      }).ok,
    ).toBe(false)
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
    document.meta = {
      profile: [healthKitClinicalRecordAdmission.profile],
    }
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
    if (provenanceEntry === undefined) {
      throw new Error('Expected conversion Provenance.')
    }
    const provenance = mutableObject(
      mutableObject(provenanceEntry, 'Provenance entry').resource,
      'Provenance',
    )
    provenance.meta = {
      profile: [
        'https://grovealliance.org/fhir/healthkit/StructureDefinition/healthkit-conversion-provenance',
      ],
    }

    const wrongDirectProfiles = structuredClone(bundle)
    const wrongEntries = mutableObject(
      wrongDirectProfiles,
      'wrong-profile Bundle',
    ).entry
    if (!Array.isArray(wrongEntries)) throw new Error('Expected Bundle.entry.')
    const wrongDocumentEntry: unknown = wrongEntries.find(
      (entry: unknown) =>
        mutableObject(mutableObject(entry, 'entry').resource, 'resource')
          .resourceType === 'DocumentReference',
    )
    if (wrongDocumentEntry === undefined) {
      throw new Error('Expected DocumentReference.')
    }
    mutableObject(
      mutableObject(wrongDocumentEntry, 'DocumentReference entry').resource,
      'DocumentReference',
    ).meta = {
      profile: [
        'https://grovealliance.org/fhir/sensor/StructureDefinition/grove-sensor-recording-document',
        healthKitClinicalRecordAdmission.profile,
      ],
    }
    expect(parseGroveMobileExchangeBundle(bundle).ok).toBe(true)
    expect(parseGroveMobileExchangeBundle(wrongDirectProfiles).ok).toBe(false)

    const clinicalDocumentIn = (
      candidate: unknown,
    ): Record<string, unknown> => {
      const candidateEntries = mutableObject(candidate, 'clinical Bundle').entry
      if (!Array.isArray(candidateEntries)) {
        throw new Error('Expected Bundle.entry.')
      }
      const candidateDocumentEntry: unknown = candidateEntries.find(
        (entry: unknown) =>
          mutableObject(mutableObject(entry, 'entry').resource, 'resource')
            .resourceType === representation.resourceType,
      )
      if (candidateDocumentEntry === undefined) {
        throw new Error(`Expected ${representation.resourceType}.`)
      }
      return mutableObject(
        mutableObject(candidateDocumentEntry, 'clinical entry').resource,
        'clinical DocumentReference',
      )
    }
    const clinicalContentIn = (candidate: unknown): Record<string, unknown> => {
      const content = clinicalDocumentIn(candidate).content
      if (!Array.isArray(content) || content.length !== 1) {
        throw new Error('Expected one clinical DocumentReference.content item.')
      }
      return mutableObject(content[0], 'clinical content')
    }
    const dstu2 = structuredClone(bundle)
    mutableObject(
      clinicalContentIn(dstu2).attachment,
      'clinical attachment',
    ).contentType = representation.contentTypeByRelease.dstu2
    expect(parseGroveMobileExchangeBundle(dstu2).ok).toBe(true)

    const invalidRepresentations = [
      (candidate: Record<string, unknown>) => {
        mutableObject(candidate.attachment, 'clinical attachment').contentType =
          'application/fhir+json'
      },
      (candidate: Record<string, unknown>) => {
        mutableObject(candidate.attachment, 'clinical attachment').contentType =
          'application/fhir+json; fhirVersion=5.0'
      },
      (candidate: Record<string, unknown>) => {
        mutableObject(candidate.format, 'clinical format').code =
          'native-recording'
      },
      (candidate: Record<string, unknown>) => {
        Reflect.deleteProperty(
          mutableObject(candidate.attachment, 'clinical attachment'),
          'contentType',
        )
      },
    ]
    for (const mutate of invalidRepresentations) {
      const candidate = structuredClone(bundle)
      mutate(clinicalContentIn(candidate))
      const result = parseGroveMobileExchangeBundle(candidate)
      expect(result.ok).toBe(false)
      if (result.ok) continue
      expect(
        result.issues.some((issue) =>
          issue.message.includes('healthkit-clinical-record.fhir-release'),
        ),
      ).toBe(true)
    }
  })

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
          code: 'provider-recording',
          display: 'Provider Recording',
        },
      },
    ])
    expect(documentEntry.resource.status).toBe('current')
    expect(documentEntry.resource.date).toBe(input.documentDate)
    expect(documentEntry.resource.author).toHaveLength(1)
    expect(provenance?.resourceType).toBe('Provenance')
    if (provenance?.resourceType !== 'Provenance') return
    expect(provenance.meta?.profile).toEqual([
      'https://grovealliance.org/fhir/providers/StructureDefinition/providers-conversion-provenance',
    ])
    expect(provenance.target).toEqual([{ reference: documentEntry.fullUrl }])
    expect(provenance.entity).toHaveLength(1)
    expect(provenance.entity?.[0]?.what.identifier?.system).toBe(
      deploymentIdentity.opaqueIdentifierSystems['provider-record'],
    )
    const serialized = JSON.stringify(result.value)
    expect(serialized).not.toContain(input.source.sourceNativeId)
    expect(serialized).not.toContain(input.source.providerScopeIdentifier.value)
    expect(serialized).not.toContain(input.attachment.payloadAssertion)
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
          const identifier = mutableObject(candidate, 'Identifier')
          const type = mutableObject(identifier.type, 'Identifier.type')
          const codings = type.coding
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
        const sourceArtifact = mutableObject(
          identifiers[2],
          'source-artifact Identifier',
        )
        const type = mutableObject(sourceArtifact.type, 'Identifier.type')
        const codings = type.coding
        if (!Array.isArray(codings)) throw new Error('Expected type coding.')
        mutableObject(codings[0], 'Identifier.type.coding').code =
          'source-context'
      },
    },
    {
      name: 'release-coupled recording registry version',
      mutate: (document: MutableJsonObject) => {
        const content = document.content
        if (!Array.isArray(content)) throw new Error('Expected content.')
        const format = mutableObject(
          mutableObject(content[0], 'content').format,
          'content.format',
        )
        format.version = '0.5.0'
      },
    },
    {
      name: 'wrong recording media type',
      mutate: (document: MutableJsonObject) => {
        const content = document.content
        if (!Array.isArray(content)) throw new Error('Expected content.')
        const attachment = mutableObject(
          mutableObject(content[0], 'content').attachment,
          'content.attachment',
        )
        attachment.contentType = 'text/plain'
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
        const attachment = mutableObject(
          mutableObject(content[0], 'content').attachment,
          'content.attachment',
        )
        attachment.size = 4
      },
    },
    {
      name: 'wrong embedded SHA-1 digest',
      mutate: (document: MutableJsonObject) => {
        const content = document.content
        if (!Array.isArray(content)) throw new Error('Expected content.')
        const attachment = mutableObject(
          mutableObject(content[0], 'content').attachment,
          'content.attachment',
        )
        attachment.hash = 'AAAAAAAAAAAAAAAAAAAAAAAAAAA='
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
    expect(parseGroveMobileExchangeBundle(bundle).ok).toBe(false)
  })

  it('matches the frozen raw source/output identity vectors', () => {
    const input = rawInput('google-health-api', 'heart-rate')
    const result = buildProviderRecordingBundle({
      ...input,
      source: {
        ...input.source,
        providerScopeIdentifier: {
          system: uri('https://provider.example.org/accounts'),
          value: 'account-001',
          assurance: 'deployment-scoped-account-pseudonym',
        },
        sourceNativeId: 'heart-rate-2026-08-20',
      },
    } as ProviderRecordingBundleInput)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const document = result.value.entry.find(
      ({ resource }) => resource.resourceType === 'DocumentReference',
    )?.resource
    if (document?.resourceType !== 'DocumentReference') {
      throw new Error('Missing recording document')
    }
    expect(document.identifier).toHaveLength(3)
    for (const entry of document.identifier ?? []) {
      expect(entry.value).toMatch(/^v0:test-key:1:[A-Za-z0-9_-]{43}$/u)
    }
  })

  it('places an explicitly governed native Identifier only on the sole recording DocumentReference', () => {
    const input = rawInput('google-health-api', 'heart-rate')
    const nativeSystem = uri(
      'https://example.org/repositories/google-account-4/recordings',
    )
    const result = buildProviderRecordingBundle({
      ...input,
      nativeIdentifierDisclosure: {
        system: nativeSystem,
        nativeId: input.source.sourceNativeId,
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
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const carryingResources = result.value.entry.filter(({ resource }) =>
      (
        resource as {
          readonly identifier?: ReadonlyArray<{
            readonly system?: string
            readonly value?: string
          }>
        }
      ).identifier?.some(
        ({ system, value }) =>
          system === nativeSystem && value === input.source.sourceNativeId,
      ),
    )
    expect(carryingResources).toHaveLength(1)
    const document = carryingResources[0]?.resource
    expect(document?.resourceType).toBe('DocumentReference')
    if (document?.resourceType !== 'DocumentReference') return
    expect(
      document.identifier?.find(({ system }) => system === nativeSystem),
    ).toEqual({
      system: nativeSystem,
      value: input.source.sourceNativeId,
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
    {
      name: 'a mismatched native value',
      disclosure: (input: ProviderRecordingBundleInput) => ({
        system: uri('https://example.org/repositories/recordings'),
        nativeId: `${input.source.sourceNativeId}-wrong`,
      }),
    },
    {
      name: 'a relative key-space system',
      disclosure: (input: ProviderRecordingBundleInput) => ({
        system: 'recordings',
        nativeId: input.source.sourceNativeId,
      }),
    },
    {
      name: 'the Grove entry identity system',
      disclosure: (input: ProviderRecordingBundleInput) => ({
        system: input.deploymentIdentity.entryNodeIdentifierSystem,
        nativeId: input.source.sourceNativeId,
      }),
    },
    {
      name: 'a Grove graph-role type coding',
      disclosure: (input: ProviderRecordingBundleInput) => ({
        system: uri('https://example.org/repositories/recordings'),
        nativeId: input.source.sourceNativeId,
        type: {
          coding: [
            {
              system:
                'https://grovealliance.org/fhir/mobile/CodeSystem/grove-identifier-role',
              code: 'source-output',
            },
          ],
        },
      }),
    },
  ])('rejects recording source disclosure using $name', ({ disclosure }) => {
    const input = rawInput('oura', 'heartrate')
    const candidate = {
      ...input,
      nativeIdentifierDisclosure: disclosure(input),
    } as unknown as ProviderRecordingBundleInput
    expect(parseProviderRecordingBundleInput(candidate).ok).toBe(false)
    expect(buildProviderRecordingBundle(candidate).ok).toBe(false)
  })

  it('supports an immutable external attachment without copying or fetching it', () => {
    const input = rawInput('oura', 'heartrate')
    const result = buildProviderRecordingBundle({
      ...input,
      attachment: {
        kind: 'external',
        contentType: unwrap(parseMediaType('application/json')),
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
      format: 'provider-recording',
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

  it('reports malformed recording inputs without throwing', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    for (const invalid of [null, undefined, 42, 'invalid', cyclic]) {
      expect(() => parseProviderRecordingBundleInput(invalid)).not.toThrow()
      expect(parseProviderRecordingBundleInput(invalid).ok).toBe(false)
      expect(() => buildProviderRecordingBundle(invalid as never)).not.toThrow()
      expect(buildProviderRecordingBundle(invalid as never).ok).toBe(false)
    }
  })

  it('deduplicates one application snapshot across participation roles', () => {
    const input = rawInput('withings', 'sleepIntraday')
    const result = buildProviderRecordingBundle({
      ...input,
      source: { ...input.source, dataOrigin: input.application },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(
      result.value.entry.filter(
        ({ resource }) => resource.resourceType === 'Device',
      ),
    ).toHaveLength(1)
    expect(result.value.entry).toHaveLength(3)
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
            sourceDeviceToken: invalid,
          },
        }
      } else {
        candidate = {
          ...input,
          source: {
            ...input.source,
            dataOrigin: {
              ...input.source.dataOrigin,
              sourceDeviceToken: invalid,
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
          providerScopeIdentifier: {
            ...input.source.providerScopeIdentifier,
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
      'converter source-device token',
      (input: ProviderRecordingBundleInput) => ({
        ...input,
        application: {
          ...input.application,
          sourceDeviceToken: '   ',
        },
      }),
    ],
    [
      'data-origin source-device token',
      (input: ProviderRecordingBundleInput) => ({
        ...input,
        source: {
          ...input.source,
          dataOrigin: {
            ...input.source.dataOrigin,
            sourceDeviceToken: ' \t ',
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
      Result<import('../src/r4/index.js').GroveMobileExchangeBundle>
    >()
  })
})
