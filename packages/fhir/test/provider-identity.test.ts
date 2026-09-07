//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  application,
  baseInput,
  bloodPressureMeasurement,
  dailyEnd,
  dateTime,
  deploymentIdentity,
  end,
  heartRateMeasurement,
  resources,
  start,
  study,
  uri,
} from './provider-test-support.js'
import { parseUrnUuid } from '../src/core/index.js'
import {
  groveMobileContract,
  sharedMobileMeasurementCatalog,
} from '../src/mobile/index.js'
import {
  buildProviderMeasurementBundle,
  parseProviderMeasurementBundleInput,
  type ProviderMeasurementBundleInput,
} from '../src/providers/index.js'

describe('Provider R4 graph builder', () => {
  it('does not infer identity disclosure from unrelated substring collisions', () => {
    const input = baseInput('withings', 'getmeas:11', heartRateMeasurement)
    expect(
      buildProviderMeasurementBundle({
        ...input,
        source: {
          ...input.source,
          sourceNativeId: '1',
        },
      } as unknown as ProviderMeasurementBundleInput).ok,
    ).toBe(true)
  })

  it('derives exact source, conversion and exchange identifiers in their proper namespaces', () => {
    const input = baseInput('withings', 'getmeas:11', heartRateMeasurement)
    const result = buildProviderMeasurementBundle(input)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const observation = resources(result).find(
      (resource) => resource.resourceType === 'Observation',
    )
    if (observation?.resourceType !== 'Observation') {
      throw new Error('The graph did not contain its Observation.')
    }
    expect(observation.identifier?.map(({ system }) => system)).toEqual([
      deploymentIdentity.opaqueIdentifierSystems['provider-record'],
      (
        deploymentIdentity.opaqueIdentifierSystems as Readonly<
          Record<string, string>
        >
      )['provider-output'],
    ])
    for (const identity of observation.identifier ?? []) {
      expect(identity.value).toMatch(/^v0:test-key:1:[A-Za-z0-9_-]{43}$/u)
    }
    expect(result.value.identifier.system).toBe(
      deploymentIdentity.eventIdentifierSystem,
    )
    const provenanceEntry = result.value.entry.find(
      (entry) => entry.resource.resourceType === 'Provenance',
    )
    expect(provenanceEntry?.extension?.[0]?.valueIdentifier?.system).toBe(
      deploymentIdentity.entryNodeIdentifierSystem,
    )
    const serialized = JSON.stringify(result.value)
    expect(serialized).not.toContain(input.source.sourceNativeId)
    expect(serialized).not.toContain(input.source.providerScopeIdentifier.value)
  })

  it('places an explicitly governed native Identifier on exactly the designated primary Observation', () => {
    const input = baseInput('withings', 'getmeas:11', heartRateMeasurement)
    const nativeSystem = uri(
      'https://example.org/repositories/withings-account-7/heart-rate-records',
    )
    const result = buildProviderMeasurementBundle({
      ...input,
      nativeIdentifierDisclosure: {
        system: nativeSystem,
        nativeId: input.source.sourceNativeId,
        type: { text: 'Withings account-scoped heart-rate id' },
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
    const primary = carryingResources[0]?.resource
    expect(primary?.resourceType).toBe('Observation')
    if (primary?.resourceType !== 'Observation') return
    expect(primary.code.coding?.[0]?.code).toBe(
      sharedMobileMeasurementCatalog['heart-rate'].code.code,
    )
    expect(
      primary.identifier?.find(({ system }) => system === nativeSystem),
    ).toEqual({
      system: nativeSystem,
      value: input.source.sourceNativeId,
      type: { text: 'Withings account-scoped heart-rate id' },
    })
  })

  it('emits a writer version only with its writer identity while allowing an unversioned identity', () => {
    const input = baseInput('withings', 'getmeas:11', heartRateMeasurement)
    const writerRecord = {
      applicationIdentifier: {
        system: uri('https://example.org/applications'),
        value: 'writer-app',
      },
      nativeRecordId: 'writer-record-1',
    } as const
    const unversioned = buildProviderMeasurementBundle({
      ...input,
      source: { ...input.source, writerRecord },
    } as ProviderMeasurementBundleInput)
    const versioned = buildProviderMeasurementBundle({
      ...input,
      source: {
        ...input.source,
        writerRecord: { ...writerRecord, version: '0' },
      },
      eventSequence: '2',
    } as ProviderMeasurementBundleInput)
    expect(unversioned.ok && versioned.ok).toBe(true)
    if (!unversioned.ok || !versioned.ok) return

    const observation = (result: typeof unversioned) =>
      resources(result).find(
        (resource) => resource.resourceType === 'Observation',
      )
    const writerVersionUrl =
      'https://grovealliance.org/fhir/mobile/StructureDefinition/grove-writer-record-version'
    const hasWriterIdentity = (resource: ReturnType<typeof observation>) =>
      resource?.identifier?.some((candidate) =>
        candidate.type?.coding?.some(({ code }) => code === 'writer-record'),
      )

    expect(hasWriterIdentity(observation(unversioned))).toBe(true)
    expect(
      observation(unversioned)?.extension?.some(
        ({ url }) => url === writerVersionUrl,
      ),
    ).not.toBe(true)
    expect(hasWriterIdentity(observation(versioned))).toBe(true)
    expect(observation(versioned)?.extension).toEqual(
      expect.arrayContaining([{ url: writerVersionUrl, valueString: '0' }]),
    )
    expect(
      parseProviderMeasurementBundleInput({
        ...input,
        source: { ...input.source, writerRecordVersion: '1' },
      }).ok,
    ).toBe(false)
  })

  it('treats one supported grouped catalog mapping as one designated Provider output', () => {
    const input = baseInput(
      'withings',
      'getmeas:9+10',
      bloodPressureMeasurement,
    )
    const nativeSystem = uri(
      'https://example.org/repositories/withings-account-7/blood-pressure-records',
    )
    const result = buildProviderMeasurementBundle({
      ...input,
      nativeIdentifierDisclosure: {
        system: nativeSystem,
        nativeId: input.source.sourceNativeId,
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const carrying = result.value.entry.filter(({ resource }) => {
      const identifiers = (
        resource as {
          readonly identifier?: ReadonlyArray<{
            readonly system?: string
            readonly value?: string
          }>
        }
      ).identifier
      return identifiers?.some(
        ({ system, value }) =>
          system === nativeSystem && value === input.source.sourceNativeId,
      )
    })
    expect(carrying).toHaveLength(1)
    expect(carrying[0]?.resource.resourceType).toBe('Observation')
  })

  it.each([
    {
      name: 'a value different from the reconciliation source id',
      disclosure: (input: ProviderMeasurementBundleInput) => ({
        system: uri('https://example.org/repositories/provider-records'),
        nativeId: `${input.source.sourceNativeId}-wrong`,
      }),
    },
    {
      name: 'a relative key-space system',
      disclosure: (input: ProviderMeasurementBundleInput) => ({
        system: 'provider-records',
        nativeId: input.source.sourceNativeId,
      }),
    },
    {
      name: 'the Grove event identity system',
      disclosure: (input: ProviderMeasurementBundleInput) => ({
        system: input.deploymentIdentity.eventIdentifierSystem,
        nativeId: input.source.sourceNativeId,
      }),
    },
    {
      name: 'a Grove opaque identity system',
      disclosure: (input: ProviderMeasurementBundleInput) => ({
        system:
          input.deploymentIdentity.opaqueIdentifierSystems['source-record'],
        nativeId: input.source.sourceNativeId,
      }),
    },
    {
      name: 'a Grove graph-role Identifier.type coding',
      disclosure: (input: ProviderMeasurementBundleInput) => ({
        system: uri('https://example.org/repositories/provider-records'),
        nativeId: input.source.sourceNativeId,
        type: {
          coding: [
            {
              system:
                'https://grovealliance.org/fhir/mobile/CodeSystem/grove-identifier-role',
              code: 'source-record',
            },
          ],
        },
      }),
    },
  ])('rejects governed source disclosure using $name', ({ disclosure }) => {
    const input = baseInput('withings', 'getmeas:11', heartRateMeasurement)
    const candidate = {
      ...input,
      nativeIdentifierDisclosure: disclosure(input),
    } as unknown as ProviderMeasurementBundleInput
    expect(parseProviderMeasurementBundleInput(candidate).ok).toBe(false)
    expect(buildProviderMeasurementBundle(candidate).ok).toBe(false)
  })

  it('rejects native disclosure for a catalog-ambiguous multi-output Provider row', () => {
    const input = baseInput('oura', 'daily_activity', {
      kind: 'distance',
      value: 6_123,
      effective: { kind: 'period', start, end: dailyEnd },
    })
    const candidate = {
      ...input,
      nativeIdentifierDisclosure: {
        system: uri(
          'https://example.org/repositories/oura-account-7/daily-activity-records',
        ),
        nativeId: input.source.sourceNativeId,
      },
    } as ProviderMeasurementBundleInput
    const parsed = parseProviderMeasurementBundleInput(candidate)
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      expect(parsed.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'value-mismatch',
            path: ['nativeIdentifierDisclosure'],
          }),
        ]),
      )
    }
    expect(buildProviderMeasurementBundle(candidate).ok).toBe(false)
  })

  it.each([
    ' leading',
    'trailing ',
    'two  spaces',
    'tab\tcode',
    'control\u0001code',
  ])('rejects non-lexical FHIR code %p in native Identifier.type', (code) => {
    const input = baseInput('withings', 'getmeas:11', heartRateMeasurement)
    expect(
      parseProviderMeasurementBundleInput({
        ...input,
        nativeIdentifierDisclosure: {
          system: 'https://example.org/repositories/provider-records',
          nativeId: input.source.sourceNativeId,
          type: {
            coding: [
              {
                system: 'https://example.org/fhir/CodeSystem/identifier-type',
                code,
              },
            ],
          },
        },
      }).ok,
    ).toBe(false)
  })

  it('matches the frozen Provider composed source and output vectors', () => {
    const input = baseInput('google-health-api', 'steps', {
      kind: 'step-count',
      value: 123,
      effective: { kind: 'period', start, end },
    })
    const result = buildProviderMeasurementBundle({
      ...input,
      source: {
        ...input.source,
        providerScopeIdentifier: {
          system: uri('https://provider.example.org/accounts'),
          value: 'account-001',
          assurance: 'deployment-scoped-account-pseudonym',
        },
        sourceNativeId: 'steps-2026-08-20T16:00:00Z',
      },
    } as ProviderMeasurementBundleInput)
    const observation = resources(result).find(
      (resource) => resource.resourceType === 'Observation',
    )
    expect(observation?.identifier).toHaveLength(2)
    expect(observation?.identifier?.map((entry) => entry.value)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^v0:test-key:1:[A-Za-z0-9_-]{43}$/u),
      ]),
    )

    const unicodeInput = baseInput('oura', 'sleep', {
      kind: 'sleep-duration',
      value: 7,
      effective: { kind: 'period', start, end },
    })
    const unicodeResult = buildProviderMeasurementBundle({
      ...unicodeInput,
      source: {
        ...unicodeInput.source,
        providerScopeIdentifier: {
          system: uri('https://example.org/provider-key-spaces'),
          value: 'oura-document-uuid-global',
          assurance: 'documented-global-key-space',
        },
        sourceNativeId: 'résumé-\u0001',
      },
    } as ProviderMeasurementBundleInput)
    const unicodeObservation = resources(unicodeResult).find(
      (resource) => resource.resourceType === 'Observation',
    )
    expect(unicodeObservation?.identifier?.[0]?.value).toMatch(
      /^v0:test-key:1:[A-Za-z0-9_-]{43}$/u,
    )
    expect(JSON.stringify(unicodeResult)).not.toContain('résumé-\u0001')
  })

  it('changes only event identities when the durable event sequence changes', () => {
    const first = buildProviderMeasurementBundle(
      baseInput('withings', 'getmeas:11', heartRateMeasurement),
    )
    const second = buildProviderMeasurementBundle({
      ...baseInput('withings', 'getmeas:11', heartRateMeasurement),
      eventSequence: '2',
    })
    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return

    const firstObservation = resources(first).find(
      (resource) => resource.resourceType === 'Observation',
    )
    const secondObservation = resources(second).find(
      (resource) => resource.resourceType === 'Observation',
    )
    expect(firstObservation?.identifier).toEqual(secondObservation?.identifier)
    expect(first.value.identifier).not.toEqual(second.value.identifier)
  })

  it('adds a gateway reference only with explicit mediation evidence', () => {
    const input = baseInput('withings', 'getmeas:11', heartRateMeasurement)
    const converterGateway = buildProviderMeasurementBundle({
      ...input,
      gatewayApplication: {
        kind: 'converter-application',
        roleAssurance: 'mediated-or-routed-measurement',
      },
    })
    expect(converterGateway.ok).toBe(true)
    if (!converterGateway.ok) return
    expect(converterGateway.value.entry).toHaveLength(4)
    const converterObservation = resources(converterGateway).find(
      (resource) => resource.resourceType === 'Observation',
    )
    const converterApplicationEntry = converterGateway.value.entry.find(
      (entry) =>
        entry.resource.resourceType === 'Device' &&
        entry.resource.deviceName?.[0]?.name === application.name,
    )
    expect(
      converterObservation?.extension?.find(
        ({ url }) =>
          url ===
          'http://hl7.org/fhir/StructureDefinition/observation-gatewayDevice',
      )?.valueReference?.reference,
    ).toBe(converterApplicationEntry?.fullUrl)

    expect(
      buildProviderMeasurementBundle({
        ...input,
        gatewayApplication: {
          kind: 'converter-application',
          roleAssurance: 'conversion-only',
        },
      } as unknown as ProviderMeasurementBundleInput).ok,
    ).toBe(false)
  })

  it('builds a fully attributed graph with distinct gateway and authorized hardware identity', () => {
    const input = baseInput('withings', 'getmeas:11', heartRateMeasurement)
    const result = buildProviderMeasurementBundle({
      ...input,
      application: {
        ...input.application,
        manufacturer: 'Grove Alliance',
        host: {
          sourceDeviceToken: 'converter-host',
          name: 'Converter phone',
          manufacturer: 'Example hardware',
          modelNumber: 'Phone 1',
          operatingSystemVersion: '20.0',
        },
      },
      gatewayApplication: {
        kind: 'distinct-application',
        roleAssurance: 'mediated-or-routed-measurement',
        application: {
          sourceDeviceToken: 'gateway-app',
          name: 'Gateway app',
          version: '2.1.0',
          manufacturer: 'Gateway vendor',
          host: {
            sourceDeviceToken: 'gateway-host',
            name: 'Gateway server',
            operatingSystemVersion: 'Linux 7',
          },
        },
      },
      source: {
        ...input.source,
        dataOrigin: {
          ...input.source.dataOrigin,
          version: '3.0.0',
          manufacturer: 'Source vendor',
          host: {
            sourceDeviceToken: 'source-host',
            name: 'Source host',
            operatingSystemVersion: 'Provider runtime 3',
          },
        },
        recordingDevice: {
          stableUnitToken: 'hardware-1',
          subjectIdentifier: {
            system: uri('https://example.org/participants'),
            value: 'participant-pseudonym-001',
          },
          identityScope: 'authorized-hardware',
          disclosureAuthorization: 'authorized-for-exchange',
          name: 'Chest strap',
          manufacturer: 'Recorder vendor',
          modelNumber: 'Model 1',
        },
      },
      researchStudyReferences: [study('study-1')],
    } as ProviderMeasurementBundleInput)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.entry).toHaveLength(9)
    const observation = resources(result).find(
      (resource) => resource.resourceType === 'Observation',
    )
    expect(parseUrnUuid(observation?.device?.reference).ok).toBe(true)
    expect(
      observation?.extension?.some(
        ({ url }) =>
          url ===
          'http://hl7.org/fhir/StructureDefinition/workflow-researchStudy',
      ),
    ).toBe(true)
    const hostEntries = result.value.entry.filter(
      ({ resource }) =>
        resource.resourceType === 'Device' &&
        resource.meta?.profile?.some(
          (profile) => profile === groveMobileContract.profiles.hostDevice,
        ),
    )
    expect(hostEntries).toHaveLength(3)
    for (const applicationDevice of resources(result)) {
      if (
        applicationDevice.resourceType !== 'Device' ||
        !applicationDevice.meta?.profile?.some(
          (profile) =>
            profile === groveMobileContract.profiles.applicationDevice,
        )
      ) {
        continue
      }
      expect(parseUrnUuid(applicationDevice.parent?.reference).ok).toBe(true)
      expect(
        hostEntries.some(
          ({ fullUrl }) => fullUrl === applicationDevice.parent?.reference,
        ),
      ).toBe(true)
    }
  })

  it('requires an explicit privacy scope for recording-device identity and never accepts a serial number', () => {
    const input = baseInput('withings', 'getmeas:11', heartRateMeasurement)
    const result = buildProviderMeasurementBundle({
      ...input,
      source: {
        ...input.source,
        recordingDevice: {
          stableUnitToken: 'device-pseudonym-1',
          subjectIdentifier: {
            system: uri('https://example.org/participants'),
            value: 'participant-pseudonym-001',
          },
          identityScope: 'deployment-scoped',
          name: 'Connected scale',
        },
      },
    } as ProviderMeasurementBundleInput)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const recordingDevice = resources(result).find(
      (resource) =>
        resource.resourceType === 'Device' &&
        resource.deviceName?.[0]?.name === 'Connected scale',
    )
    expect(recordingDevice).toBeDefined()
    if (recordingDevice?.resourceType !== 'Device') {
      throw new Error('The graph did not contain its recording Device.')
    }
    expect(recordingDevice).not.toHaveProperty('serialNumber')
    expect(
      recordingDevice.identifier?.map(({ type }) => type?.coding?.[0]?.code),
    ).toEqual(['recording-device', 'device-snapshot'])
    const recordingEntry = result.value.entry.find(
      ({ resource }) => resource === recordingDevice,
    )
    expect(
      recordingEntry?.extension?.[0]?.valueIdentifier?.type?.coding?.[0]?.code,
    ).toBe('device-snapshot')

    expect(
      buildProviderMeasurementBundle({
        ...input,
        source: {
          ...input.source,
          recordingDevice: {
            stableUnitToken: 'global-hardware-id',
            subjectIdentifier: {
              system: uri('https://example.org/participants'),
              value: 'example',
            },
            identityScope: 'authorized-hardware',
            serialNumber: 'SERIAL-123',
          },
        },
      } as unknown as ProviderMeasurementBundleInput).ok,
    ).toBe(false)
  })

  it('rejects arbitrary source codings instead of treating lineage as a clinical code', () => {
    const input = baseInput('withings', 'getmeas:11', heartRateMeasurement)
    expect(
      buildProviderMeasurementBundle({
        ...input,
        source: {
          ...input.source,
          sourceTypeCoding: {
            system: 'https://provider.example/source-types',
            code: 'broad-summary-record',
          },
        },
      } as unknown as ProviderMeasurementBundleInput).ok,
    ).toBe(false)
  })

  it('accepts only unique, unambiguous typed ResearchStudy references', () => {
    const input = baseInput('withings', 'getmeas:11', heartRateMeasurement)
    const local = study('local-1')
    const absolute = study('remote-1')
    expect(
      buildProviderMeasurementBundle({
        ...input,
        researchStudyReferences: [local, absolute],
      }).ok,
    ).toBe(true)

    const duplicate = parseProviderMeasurementBundleInput({
      ...input,
      researchStudyReferences: [local, local],
    })
    expect(duplicate.ok).toBe(false)
    if (!duplicate.ok) {
      expect(duplicate.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'duplicate-identifier' }),
        ]),
      )
    }
    expect(
      parseProviderMeasurementBundleInput({
        ...input,
        researchStudyReferences: [
          {
            type: 'ResearchStudy',
            identifier: {
              system: 'https://research.example/invalid system',
              value: 'remote-1',
            },
          },
        ],
      }).ok,
    ).toBe(false)
    expect(
      parseProviderMeasurementBundleInput({
        ...baseInput('withings', 'getmeas:54', {
          kind: 'oxygen-saturation',
          value: 98,
          effective: { kind: 'date-time', value: dateTime },
        }),
        measurements: [
          {
            kind: 'oxygen-saturation',
            value: 0,
            effective: { kind: 'date-time', value: dateTime },
          },
        ],
      }).ok,
    ).toBe(true)
  })
})
