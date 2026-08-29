//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  parseAbsoluteUri,
  parseFhirInstant,
  type FhirInstant,
  type Result,
} from '../src/core/index.js'
import type { DeploymentIdentityInput } from '../src/mobile/index.js'
import {
  buildProviderMeasurementBundle,
  buildProviderRecordingBundle,
  buildProviderRetractionBundle,
  encodeRecordingBytes,
  parseMediaType,
  parseProviderRetractionInput,
  providerOutputCoordinates,
  type ProviderMeasurementBundleInput,
  type ProviderRecordingBundleInput,
  type ProviderRetractionInput,
} from '../src/providers/index.js'
import { parseGroveMobileRetractionBundle } from '../src/r4/index.js'

const unwrap = <Value>(result: Result<Value>): Value => {
  if (!result.ok) {
    throw new Error(result.issues.map(({ message }) => message).join('\n'))
  }
  return result.value
}

const uri = (value: string) => unwrap(parseAbsoluteUri(value))
const instant = (value: string): FhirInstant => unwrap(parseFhirInstant(value))
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
    'source-record': uri('https://example.org/identity/source-record/key/1'),
    'source-output': uri('https://example.org/identity/source-output/key/1'),
    'writer-record': uri('https://example.org/identity/writer-record/key/1'),
    'provider-record': uri(
      'https://example.org/identity/provider-record/key/1',
    ),
    'provider-output': uri(
      'https://example.org/identity/provider-output/key/1',
    ),
    'source-artifact': uri(
      'https://example.org/identity/source-artifact/key/1',
    ),
    'provider-artifact': uri(
      'https://example.org/identity/provider-artifact/key/1',
    ),
    'source-context': uri('https://example.org/identity/source-context/key/1'),
    'recording-device': uri(
      'https://example.org/identity/recording-device/key/1',
    ),
    'device-snapshot': uri(
      'https://example.org/identity/device-snapshot/key/1',
    ),
  },
  eventIdentifierSystem: uri('https://example.org/identity/event'),
  entryNodeIdentifierSystem: uri('https://example.org/identity/entry-node'),
  keyId: 'unit-key',
  keyEpoch: '1',
  secretBase64Url: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY',
  producerInstance: '9ae7b610-bac2-4f13-97b4-53b84b8a90cf',
} as const satisfies DeploymentIdentityInput

const source = {
  adapter: { kind: 'providers', provider: 'withings' },
  providerScopeIdentifier: {
    system: uri('https://example.org/provider-accounts'),
    value: 'participant-pseudonym',
    assurance: 'deployment-scoped-account-pseudonym',
  },
  sourceType: 'getmeas:11',
  sourceNativeId: 'provider-record-17348211',
  recordingMethod: 'automatically-recorded',
  dataOrigin: {
    sourceDeviceToken: 'withings-cloud',
    name: 'Withings',
  },
} as const

const activeInput = {
  subject: patient,
  measurements: [
    {
      kind: 'heart-rate',
      value: 64,
      effective: {
        kind: 'date-time',
        value: instant('2026-08-20T12:00:00Z'),
      },
    },
  ],
  source,
  application: {
    sourceDeviceToken: 'converter-build-42',
    name: 'Grove converter',
    version: '0.6.0',
    build: '42',
  },
  eventSequence: '100',
  deploymentIdentity,
  occurred: instant('2026-08-20T12:00:00Z'),
  recorded: instant('2026-08-20T12:02:00Z'),
  assembled: instant('2026-08-20T12:03:00Z'),
} as const satisfies ProviderMeasurementBundleInput

const outputCoordinates = providerOutputCoordinates(
  'withings',
  'getmeas:11',
  'heart-rate',
)
if (outputCoordinates === undefined) {
  throw new Error(
    'The test requires the catalog-owned heart-rate output coordinates.',
  )
}

const retractionInput = {
  source: {
    provider: source.adapter.provider,
    providerScopeIdentifier: source.providerScopeIdentifier,
    sourceType: source.sourceType,
    sourceNativeId: source.sourceNativeId,
  },
  targets: [
    {
      role: 'primary-output',
      resourceType: 'Observation',
      ...outputCoordinates,
    },
  ],
  application: activeInput.application,
  eventSequence: '101',
  deploymentIdentity,
  occurred: instant('2026-08-21T10:00:00Z'),
  recorded: instant('2026-08-21T10:01:00Z'),
  assembled: instant('2026-08-21T10:02:00Z'),
} as const satisfies ProviderRetractionInput

describe('Provider source-record retraction', () => {
  it('rejects a provider-scope assurance that contradicts the catalog', () => {
    expect(
      parseProviderRetractionInput({
        ...retractionInput,
        source: {
          ...retractionInput.source,
          providerScopeIdentifier: {
            system: uri('https://example.org/provider-key-spaces'),
            value: 'withings-global',
            assurance: 'documented-global-key-space',
          },
        },
      }).ok,
    ).toBe(false)
  })

  it('reports malformed retraction inputs without throwing', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    for (const invalid of [null, undefined, 42, 'invalid', cyclic]) {
      expect(() => parseProviderRetractionInput(invalid)).not.toThrow()
      expect(parseProviderRetractionInput(invalid).ok).toBe(false)
      expect(() =>
        buildProviderRetractionBundle(invalid as never),
      ).not.toThrow()
      expect(buildProviderRetractionBundle(invalid as never).ok).toBe(false)
    }
  })
  it('targets the exact prior output identity in a separate append-only event', () => {
    const active = unwrap(buildProviderMeasurementBundle(activeInput))
    const priorObservation = active.entry.find(
      ({ resource }) => resource.resourceType === 'Observation',
    )?.resource
    if (priorObservation?.resourceType !== 'Observation') {
      throw new Error('The active graph did not contain its Observation.')
    }
    const priorOutput = priorObservation.identifier?.find((candidate) =>
      candidate.type?.coding?.some(({ code }) => code === 'source-output'),
    )

    const retraction = unwrap(buildProviderRetractionBundle(retractionInput))
    expect(retraction.meta?.profile).toEqual([
      'https://grovealliance.org/fhir/mobile/StructureDefinition/grove-mobile-retraction-bundle',
    ])
    expect(retraction.entry).toHaveLength(2)
    const provenance = retraction.entry.find(
      ({ resource }) => resource.resourceType === 'Provenance',
    )?.resource
    expect(
      retraction.entry.some(
        ({ resource }) => resource.resourceType === 'Device',
      ),
    ).toBe(true)
    if (provenance === undefined) {
      throw new Error('The retraction graph did not contain Provenance.')
    }
    expect(provenance.resourceType).toBe('Provenance')
    if (provenance.resourceType !== 'Provenance') return
    expect(provenance.target).toEqual([
      {
        extension: [
          {
            url: 'https://grovealliance.org/fhir/mobile/StructureDefinition/grove-retraction-target-role',
            valueCode: 'primary-output',
          },
        ],
        type: 'Observation',
        identifier: priorOutput,
      },
    ])
    expect(provenance.target[0]).not.toHaveProperty('reference')
    expect(provenance.activity?.coding).toContainEqual(
      expect.objectContaining({
        system:
          'https://grovealliance.org/fhir/mobile/CodeSystem/grove-lifecycle-event',
        code: 'source-record-retracted',
      }),
    )
    expect(provenance.occurredDateTime).toBe(retractionInput.occurred)
    expect(provenance.recorded).toBe(retractionInput.recorded)
    expect(retraction.timestamp).toBe(retractionInput.assembled)
    expect(JSON.stringify(retraction)).not.toMatch(/entered-in-error/u)
  })

  it('rejects additional direct profiles on retraction Provenance', () => {
    const retraction = structuredClone(
      unwrap(buildProviderRetractionBundle(retractionInput)),
    )
    const provenance = retraction.entry.find(
      ({ resource }) => resource.resourceType === 'Provenance',
    )?.resource
    if (provenance?.resourceType !== 'Provenance') {
      throw new Error('The retraction graph did not contain Provenance.')
    }
    const profiles = provenance.meta?.profile as
      Array<string | null> | undefined
    profiles?.push(
      'https://example.org/fhir/StructureDefinition/unrelated-provenance',
    )

    const parsed = parseGroveMobileRetractionBundle(retraction)
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.issues).toContainEqual(
      expect.objectContaining({
        code: 'mobile-retraction.provenance-profile',
      }),
    )
  })

  it('uses the selected source-output identity when retracting a source artifact', () => {
    const recordingInput = {
      source: {
        adapter: { kind: 'providers', provider: 'withings' },
        providerScopeIdentifier: source.providerScopeIdentifier,
        sourceType: 'activityIntraday',
        sourceNativeId: 'provider-record-activity-1',
        dataOrigin: source.dataOrigin,
      },
      attachment: {
        kind: 'embedded',
        contentType: unwrap(
          parseMediaType('application/vnd.grovealliance.provider+json'),
        ),
        title: 'Authorized minimized provider recording',
        format: 'provider-recording',
        payloadAssertion: 'verified-sanitized-input',
        dataBase64: unwrap(encodeRecordingBytes(Uint8Array.of(1, 2, 3))),
      },
      subject: activeInput.subject,
      application: activeInput.application,
      eventSequence: '200',
      deploymentIdentity,
      documentDate: instant('2026-08-20T12:01:00Z'),
      occurred: instant('2026-08-20T12:00:00Z'),
      recorded: instant('2026-08-20T12:02:00Z'),
      assembled: instant('2026-08-20T12:03:00Z'),
    } as const satisfies ProviderRecordingBundleInput
    const active = unwrap(buildProviderRecordingBundle(recordingInput))
    const document = active.entry.find(
      ({ resource }) => resource.resourceType === 'DocumentReference',
    )?.resource
    if (document?.resourceType !== 'DocumentReference') {
      throw new Error(
        'The active recording graph did not contain its document.',
      )
    }
    const sourceOutput = document.identifier?.find((candidate) =>
      candidate.type?.coding?.some(({ code }) => code === 'source-output'),
    )
    const sourceArtifact = document.identifier?.find((candidate) =>
      candidate.type?.coding?.some(({ code }) => code === 'source-artifact'),
    )
    expect(sourceOutput).toBeDefined()
    expect(sourceArtifact).toBeDefined()
    expect(sourceOutput).not.toEqual(sourceArtifact)

    const retraction = unwrap(
      buildProviderRetractionBundle({
        source: {
          provider: 'withings',
          providerScopeIdentifier: source.providerScopeIdentifier,
          sourceType: 'activityIntraday',
          sourceNativeId: 'provider-record-activity-1',
        },
        targets: [
          {
            role: 'source-artifact',
            resourceType: 'DocumentReference',
            formatCode: 'provider-recording',
            partIndex: '0',
          },
        ],
        application: activeInput.application,
        eventSequence: '201',
        deploymentIdentity,
        occurred: instant('2026-08-21T10:00:00Z'),
        recorded: instant('2026-08-21T10:01:00Z'),
        assembled: instant('2026-08-21T10:02:00Z'),
      }),
    )
    const provenance = retraction.entry.find(
      ({ resource }) => resource.resourceType === 'Provenance',
    )?.resource
    if (provenance?.resourceType !== 'Provenance') {
      throw new Error('The retraction graph did not contain Provenance.')
    }
    expect(provenance.target[0]?.identifier).toEqual(sourceOutput)
  })

  it('targets the exact prior recording-device snapshot', () => {
    const stableUnitToken = 'recording-unit-1'
    const active = unwrap(
      buildProviderMeasurementBundle({
        ...activeInput,
        source: {
          ...activeInput.source,
          recordingDevice: {
            stableUnitToken,
            subjectIdentifier: {
              system: uri('https://example.org/participants'),
              value: 'participant-pseudonym-001',
            },
            identityScope: 'deployment-scoped',
            name: 'Recorder',
          },
        },
      }),
    )
    const device = active.entry.find(
      ({ resource }) =>
        resource.resourceType === 'Device' &&
        resource.meta?.profile?.some(
          (profile) =>
            profile ===
            'https://grovealliance.org/fhir/mobile/StructureDefinition/grove-recording-device',
        ),
    )?.resource
    if (device?.resourceType !== 'Device') {
      throw new Error('The active graph did not contain its recording Device.')
    }
    const snapshot = device.identifier?.find((candidate) =>
      candidate.type?.coding?.some(({ code }) => code === 'device-snapshot'),
    )

    const retraction = unwrap(
      buildProviderRetractionBundle({
        ...retractionInput,
        eventSequence: '102',
        targets: [
          {
            role: 'device-snapshot',
            resourceType: 'Device',
            priorEventSequence: activeInput.eventSequence,
            deviceRole: 'recording-device',
            sourceDeviceToken: stableUnitToken,
          },
        ],
      }),
    )
    const provenance = retraction.entry.find(
      ({ resource }) => resource.resourceType === 'Provenance',
    )?.resource
    if (provenance?.resourceType !== 'Provenance') {
      throw new Error('The retraction graph did not contain Provenance.')
    }
    expect(provenance.target[0]?.identifier).toEqual(snapshot)
  })

  it('requires a device snapshot event to precede the retraction event', () => {
    const target = {
      role: 'device-snapshot',
      resourceType: 'Device',
      priorEventSequence: '9999999999999999999999999999999999999999',
      deviceRole: 'application',
      sourceDeviceToken: activeInput.application.sourceDeviceToken,
    } as const
    const eventSequence = '10000000000000000000000000000000000000000'

    expect(
      parseProviderRetractionInput({
        ...retractionInput,
        eventSequence,
        targets: [target],
      }).ok,
    ).toBe(true)
    expect(
      parseProviderRetractionInput({
        ...retractionInput,
        eventSequence,
        targets: [{ ...target, priorEventSequence: eventSequence }],
      }).ok,
    ).toBe(false)
    expect(
      parseProviderRetractionInput({
        ...retractionInput,
        eventSequence,
        targets: [
          {
            ...target,
            priorEventSequence: '10000000000000000000000000000000000000001',
          },
        ],
      }).ok,
    ).toBe(false)
  })

  it('emits retraction targets in a deterministic canonical order', () => {
    const deviceTarget = {
      role: 'device-snapshot',
      resourceType: 'Device',
      priorEventSequence: activeInput.eventSequence,
      deviceRole: 'application',
      sourceDeviceToken: activeInput.application.sourceDeviceToken,
    } as const
    const primaryTarget = retractionInput.targets[0]
    const forward = unwrap(
      buildProviderRetractionBundle({
        ...retractionInput,
        targets: [primaryTarget, deviceTarget],
      }),
    )
    const reversed = unwrap(
      buildProviderRetractionBundle({
        ...retractionInput,
        targets: [deviceTarget, primaryTarget],
      }),
    )

    expect(reversed).toEqual(forward)
  })

  it('returns structured issues for malformed JavaScript input', () => {
    expect(() =>
      buildProviderRetractionBundle(
        undefined as unknown as ProviderRetractionInput,
      ),
    ).not.toThrow()
    expect(
      parseProviderRetractionInput({
        ...retractionInput,
        unexpected: true,
      }).ok,
    ).toBe(false)
    expect(
      parseProviderRetractionInput({
        ...retractionInput,
        deploymentIdentity: {
          ...deploymentIdentity,
          secretBase64Url: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8',
        },
      }).ok,
    ).toBe(false)
  })

  it('rejects a duplicated logical target and role/type mismatch', () => {
    const duplicated = buildProviderRetractionBundle({
      ...retractionInput,
      targets: [retractionInput.targets[0], retractionInput.targets[0]],
    })
    expect(duplicated.ok).toBe(false)

    const mismatched = buildProviderRetractionBundle({
      ...retractionInput,
      targets: [
        {
          role: 'source-artifact',
          resourceType: 'Observation',
          formatCode: 'provider-recording',
          partIndex: '0',
        },
      ],
    } as unknown as ProviderRetractionInput)
    expect(mismatched.ok).toBe(false)
  })

  it('rejects a source type outside the provider catalog', () => {
    const result = parseProviderRetractionInput({
      ...retractionInput,
      source: {
        ...retractionInput.source,
        sourceType: 'unregistered-source-type',
      },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ path: ['source', 'sourceType'] }),
      )
    }
  })
})
