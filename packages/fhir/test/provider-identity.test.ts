//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  application,
  bloodPressureMeasurement,
  context,
  dailyEnd,
  heartRateMeasurement,
  identityScope,
  observationOf,
  record,
  resources,
  start,
  study,
  unwrap,
  uri,
} from './provider-test-support.js'
import { parseUrnUuid } from '../src/core/index.js'
import {
  groveMobileProfileCanonicals,
  sharedMobileMeasurementCatalog,
} from '../src/mobile/index.js'
import {
  buildProviderExchangeGraph,
  parseNormalizedProviderRecord,
  type NormalizedProviderRecord,
  type ProviderConversionOptions,
} from '../src/providers/index.js'

const heartRate = record('withings', 'getmeas:11', heartRateMeasurement)
const withSource = (
  base: NormalizedProviderRecord,
  source: Record<string, unknown>,
): NormalizedProviderRecord =>
  ({
    ...base,
    source: { ...base.source, ...source },
  }) as NormalizedProviderRecord

describe('Provider R4 graph builder', () => {
  it('does not infer identity disclosure from unrelated substring collisions', () => {
    expect(
      buildProviderExchangeGraph(
        withSource(heartRate, { sourceNativeId: '1' }),
        context(),
      ).ok,
    ).toBe(true)
  })

  it('derives exact source, conversion and exchange identifiers in their proper namespaces', () => {
    const result = buildProviderExchangeGraph(heartRate, context())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const observation = observationOf(result.value.graph)
    expect(observation.identifier?.map(({ system }) => system)).toEqual([
      identityScope.systems.opaque['provider-record'],
      identityScope.systems.opaque['provider-output'],
    ])
    for (const identity of observation.identifier ?? []) {
      expect(identity.value).toMatch(/^v0:test-key:1:[A-Za-z0-9_-]{43}$/u)
    }
    expect(result.value.graph.identifier.system).toBe(
      identityScope.systems.event,
    )
    expect(result.value.identifiers.event).toEqual(context().event)
    expect(result.value.identifiers.provenance.system).toBe(
      identityScope.systems.entryNode,
    )
    expect(result.value.identifiers.outputs).toHaveLength(1)
    expect(result.value.identifiers.writerSnapshot.role).toBe('device-snapshot')
    expect(result.value.source).toEqual(heartRate.source)
    const serialized = JSON.stringify(result.value.graph)
    expect(serialized).not.toContain(heartRate.source.sourceNativeId)
    expect(serialized).not.toContain(context().repositoryScope.value)
  })

  it('places an explicitly governed native Identifier on exactly the designated primary Observation', () => {
    const nativeSystem = uri(
      'https://example.org/repositories/withings-account-7/heart-rate-records',
    )
    const result = buildProviderExchangeGraph(heartRate, context(), {
      nativeIdentifierDisclosure: {
        kind: 'authorized',
        system: nativeSystem,
        type: { text: 'Withings account-scoped heart-rate id' },
      },
    })
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
          system === nativeSystem && value === heartRate.source.sourceNativeId,
      ),
    )
    expect(carrying).toHaveLength(1)
    const primary = observationOf(result.value.graph)
    expect(primary.code.coding?.[0]?.code).toBe(
      sharedMobileMeasurementCatalog['heart-rate'].code.code,
    )
    expect(
      primary.identifier?.find(({ system }) => system === nativeSystem),
    ).toEqual({
      system: nativeSystem,
      value: heartRate.source.sourceNativeId,
      type: { text: 'Withings account-scoped heart-rate id' },
    })
  })

  it('emits a writer version only with its writer identity while allowing an unversioned identity', () => {
    const writerRecord = {
      applicationIdentifier: {
        system: uri('https://example.org/applications'),
        value: 'writer-app',
      },
      nativeRecordId: 'writer-record-1',
    } as const
    const unversioned = buildProviderExchangeGraph(
      withSource(heartRate, { writerRecord }),
      context(),
    )
    const versioned = buildProviderExchangeGraph(
      withSource(heartRate, {
        writerRecord: { ...writerRecord, version: '0' },
      }),
      context('withings', '2'),
    )
    expect(unversioned.ok && versioned.ok).toBe(true)
    if (!unversioned.ok || !versioned.ok) return
    const writerVersionUrl =
      'https://grovealliance.org/fhir/mobile/StructureDefinition/grove-writer-record-version'
    const hasWriterIdentity = (graph: typeof unversioned.value.graph) =>
      observationOf(graph).identifier?.some((candidate) =>
        candidate.type?.coding?.some(({ code }) => code === 'writer-record'),
      )
    expect(hasWriterIdentity(unversioned.value.graph)).toBe(true)
    expect(unversioned.value.identifiers.writerRecord?.role).toBe(
      'writer-record',
    )
    expect(
      observationOf(unversioned.value.graph).extension?.some(
        ({ url }) => url === writerVersionUrl,
      ),
    ).not.toBe(true)
    expect(hasWriterIdentity(versioned.value.graph)).toBe(true)
    expect(observationOf(versioned.value.graph).extension).toEqual(
      expect.arrayContaining([{ url: writerVersionUrl, valueString: '0' }]),
    )
    expect(
      parseNormalizedProviderRecord(
        withSource(heartRate, { writerRecordVersion: '1' }),
      ),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'mobile-input.value-shape-invalid' }],
    })
  })

  it('treats one supported grouped catalog mapping as one designated Provider output', () => {
    const nativeSystem = uri(
      'https://example.org/repositories/withings-account-7/blood-pressure-records',
    )
    const result = buildProviderExchangeGraph(
      record('withings', 'getmeas:9+10', bloodPressureMeasurement),
      context(),
      {
        nativeIdentifierDisclosure: {
          kind: 'authorized',
          system: nativeSystem,
        },
      },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(
      observationOf(result.value.graph).identifier?.some(
        ({ system }) => system === nativeSystem,
      ),
    ).toBe(true)
  })

  it.each([
    [
      'a relative key-space system',
      { kind: 'authorized', system: 'provider-records' },
    ],
    [
      'the Grove event identity system',
      { kind: 'authorized', system: identityScope.systems.event },
    ],
    [
      'a Grove opaque identity system',
      {
        kind: 'authorized',
        system: identityScope.systems.opaque['source-record'],
      },
    ],
    [
      'a Grove graph-role Identifier.type coding',
      {
        kind: 'authorized',
        system: 'https://example.org/repositories/provider-records',
        type: {
          coding: [
            {
              system:
                'https://grovealliance.org/fhir/mobile/CodeSystem/grove-identifier-role',
              code: 'source-record',
            },
          ],
        },
      },
    ],
    [
      'an unknown policy kind',
      { kind: 'disclose', system: 'https://example.org/x' },
    ],
  ])('faults governed source disclosure using %s', (_name, disclosure) => {
    const result = buildProviderExchangeGraph(heartRate, context(), {
      nativeIdentifierDisclosure: disclosure,
    } as unknown as ProviderConversionOptions)
    expect(result.ok).toBe(false)
    if (result.ok) return
    for (const issue of result.issues) expect(issue.code).not.toMatch(/\./u)
  })

  it('faults native disclosure for a catalog-ambiguous multi-output Provider row', () => {
    const result = buildProviderExchangeGraph(
      record('oura', 'daily_activity', {
        kind: 'distance',
        value: 6_123,
        effective: { kind: 'period', start, end: dailyEnd },
      }),
      context('oura'),
      {
        nativeIdentifierDisclosure: {
          kind: 'authorized',
          system: uri(
            'https://example.org/repositories/oura-account-7/daily-activity-records',
          ),
        },
      },
    )
    expect(result).toMatchObject({
      ok: false,
      issues: [
        { code: 'value-mismatch', path: ['nativeIdentifierDisclosure'] },
      ],
    })
  })

  it.each([' leading', 'trailing ', 'two  spaces', 'tab\tcode', 'controlcode'])(
    'rejects non-lexical FHIR code %p in native Identifier.type',
    (code) => {
      expect(
        buildProviderExchangeGraph(heartRate, context(), {
          nativeIdentifierDisclosure: {
            kind: 'authorized',
            system: uri('https://example.org/repositories/provider-records'),
            type: {
              coding: [
                {
                  system: uri(
                    'https://example.org/fhir/CodeSystem/identifier-type',
                  ),
                  code,
                },
              ],
            },
          },
        }).ok,
      ).toBe(false)
    },
  )

  it('changes only event identities when the durable event sequence changes', () => {
    const first = buildProviderExchangeGraph(heartRate, context())
    const second = buildProviderExchangeGraph(
      heartRate,
      context('withings', '2'),
    )
    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(observationOf(first.value.graph).identifier).toEqual(
      observationOf(second.value.graph).identifier,
    )
    expect(first.value.graph.identifier).not.toEqual(
      second.value.graph.identifier,
    )
    expect(first.value.identifiers.applicationSnapshot).not.toEqual(
      second.value.identifiers.applicationSnapshot,
    )
  })

  it('adds a gateway reference only for an explicit converter role', () => {
    const assembler = unwrap(buildProviderExchangeGraph(heartRate, context()))
    expect(
      observationOf(assembler.graph).extension?.some(({ url }) =>
        url?.endsWith('observation-gatewayDevice'),
      ),
    ).toBe(false)
    expect(assembler.graph.entry).toHaveLength(5)

    const gateway = unwrap(
      buildProviderExchangeGraph(
        heartRate,
        context('withings', '1', { converterRole: { kind: 'gateway' } }),
      ),
    )
    expect(gateway.graph.entry).toHaveLength(5)
    const converterEntry = gateway.graph.entry.find(
      ({ resource }) =>
        resource.resourceType === 'Device' &&
        resource.deviceName?.[0]?.name === application.name,
    )
    expect(
      observationOf(gateway.graph).extension?.find(({ url }) =>
        url?.endsWith('observation-gatewayDevice'),
      )?.valueReference?.reference,
    ).toBe(converterEntry?.fullUrl)

    expect(
      buildProviderExchangeGraph(
        heartRate,
        context('withings', '1', {
          converterRole: { kind: 'gateway', roleAssurance: 'x' } as never,
        }),
      ).ok,
    ).toBe(false)
  })

  it('builds a fully attributed graph with a distinct gateway, hardware and a study', () => {
    const result = buildProviderExchangeGraph(
      withSource(heartRate, {
        writer: { ...heartRate.source.writer, version: '3.0.0' },
        recordingDevice: {
          stableUnitToken: 'hardware-1',
          name: 'Chest strap',
          manufacturer: 'Recorder vendor',
          modelNumber: 'Model 1',
        },
      }),
      context('withings', '1', {
        host: {
          sourceDeviceToken: 'converter-host',
          name: 'Converter phone',
          manufacturer: 'Example hardware',
          modelNumber: 'Phone 1',
          operatingSystemVersion: '20.0',
        },
        converterRole: {
          kind: 'gateway-application',
          application: {
            sourceDeviceToken: 'gateway-app',
            name: 'Gateway app',
            version: '2.1.0',
          },
        },
        studies: [study('study-1')],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(
      resources(result.value.graph).map(({ resourceType }) => resourceType),
    ).toEqual([
      'Observation',
      'Device',
      'ResearchStudy',
      'PlanDefinition',
      'ResearchSubject',
      'Device',
      'Device',
      'Device',
      'Device',
      'Provenance',
    ])
    const observation = observationOf(result.value.graph)
    expect(parseUrnUuid(observation.device?.reference).ok).toBe(true)
    expect(observation.device?.reference).toBe(
      result.value.graph.entry.find(
        ({ resource }) =>
          resource.resourceType === 'Device' &&
          resource.meta?.profile?.[0] ===
            groveMobileProfileCanonicals['grove-recording-device'],
      )?.fullUrl,
    )
    const gatewayEntry = result.value.graph.entry.find(
      ({ resource }) =>
        resource.resourceType === 'Device' &&
        resource.deviceName?.[0]?.name === 'Gateway app',
    )
    expect(
      observation.extension?.find(({ url }) =>
        url?.endsWith('observation-gatewayDevice'),
      )?.valueReference?.reference,
    ).toBe(gatewayEntry?.fullUrl)
    expect(result.value.identifiers.gatewayApplicationSnapshot?.value).toBe(
      gatewayEntry?.extension?.[0]?.valueIdentifier?.value,
    )
    const hostEntries = result.value.graph.entry.filter(
      ({ resource }) =>
        resource.resourceType === 'Device' &&
        resource.meta?.profile?.some(
          (profile) =>
            profile === groveMobileProfileCanonicals['grove-host-device'],
        ),
    )
    expect(hostEntries).toHaveLength(1)
    const converter = result.value.graph.entry.find(
      ({ resource }) =>
        resource.resourceType === 'Device' &&
        resource.deviceName?.[0]?.name === application.name,
    )?.resource
    expect(
      converter?.resourceType === 'Device' && converter.parent?.reference,
    ).toBe(hostEntries[0]?.fullUrl)
    expect(result.value.identifiers.hostSnapshot.value).toBe(
      hostEntries[0]?.extension?.[0]?.valueIdentifier?.value,
    )
  })

  it('requires a stable per-unit token for recording-device identity and never accepts a serial number', () => {
    const result = buildProviderExchangeGraph(
      withSource(heartRate, {
        recordingDevice: {
          stableUnitToken: 'device-pseudonym-1',
          name: 'Connected scale',
        },
      }),
      context(),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const recordingDevice = resources(result.value.graph).find(
      (resource) =>
        resource.resourceType === 'Device' &&
        resource.deviceName?.[0]?.name === 'Connected scale',
    )
    if (recordingDevice?.resourceType !== 'Device') {
      throw new Error('The graph did not contain its recording Device.')
    }
    expect(recordingDevice).not.toHaveProperty('serialNumber')
    expect(
      recordingDevice.identifier?.map(({ type }) => type?.coding?.[0]?.code),
    ).toEqual(['recording-device', 'device-snapshot'])
    expect(result.value.identifiers.recordingDevice?.role).toBe(
      'recording-device',
    )
    expect(result.value.identifiers.recordingDeviceSnapshot?.value).toBe(
      recordingDevice.identifier?.[1]?.value,
    )
    expect(
      parseNormalizedProviderRecord(
        withSource(heartRate, {
          recordingDevice: {
            stableUnitToken: 'global-hardware-id',
            serialNumber: 'SERIAL-123',
          },
        }),
      ),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'mobile-input.value-shape-invalid' }],
    })
    expect(
      parseNormalizedProviderRecord(
        withSource(heartRate, { recordingDevice: { name: 'No token' } }),
      ),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'mobile-input.required-metadata-missing' }],
    })
  })

  it('refuses arbitrary source codings instead of treating lineage as a clinical code', () => {
    expect(
      parseNormalizedProviderRecord(
        withSource(heartRate, {
          sourceTypeCoding: {
            system: 'https://provider.example/source-types',
            code: 'broad-summary-record',
          },
        }),
      ),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'mobile-input.value-shape-invalid' }],
    })
  })

  it('accepts only unique studies with absolute protocol urls', () => {
    expect(
      buildProviderExchangeGraph(
        heartRate,
        context('withings', '1', {
          studies: [study('local-1'), study('remote-1')],
        }),
      ).ok,
    ).toBe(true)
    const duplicated = buildProviderExchangeGraph(
      heartRate,
      context('withings', '1', {
        studies: [study('local-1'), study('local-1')],
      }),
    )
    expect(duplicated.ok).toBe(false)
    if (!duplicated.ok) {
      expect(duplicated.issues.map(({ code }) => code)).toContain(
        'duplicate-identifier',
      )
    }
    expect(
      buildProviderExchangeGraph(
        heartRate,
        context('withings', '1', {
          studies: [
            {
              ...study('remote-1'),
              protocol: {
                url: 'https://research.example/invalid protocol',
                version: '1',
              },
            } as never,
          ],
        }),
      ).ok,
    ).toBe(false)
  })
})
