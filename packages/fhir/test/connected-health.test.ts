//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { readFileSync } from 'node:fs'
import { assert, double, oneof, property } from 'fast-check'
import { deriveConnectedHealthIdentities } from '../src/connected-health/identity.js'
import {
  buildConnectedHealthMeasurementBundle,
  connectedHealthRecordEffectiveRules,
  connectedHealthScalarMappings,
  parseConnectedHealthMeasurementBundleInput,
  parseNormalizedProviderRecord,
  type ConnectedProvider,
  type ConnectedProviderRecord,
  type ConnectedHealthMeasurementBundleInput,
} from '../src/connected-health/index.js'
import type {
  FhirInstant,
  PatientReference,
  PositiveInteger,
} from '../src/core/index.js'
import {
  parseAbsoluteUri,
  parseFhirId,
  parseFhirInstant,
  parsePatientReference,
  parsePositiveInteger,
  parseResearchStudyReference,
  type Result,
} from '../src/index.js'
import {
  canonicalizeMobileEffectiveInstant,
  canonicalizeEntryIdentifier,
  createEntryIdentity,
  deriveEntryFullUrl,
  groveFhirExchangeIdentity,
  mobileEffectiveCanonicalizationVectors,
  sharedMobileMeasurementCatalog,
  type ApplicationDeviceInput,
  type MobileMeasurement,
} from '../src/mobile/index.js'

const unwrap = <T>(result: Result<T>): T => {
  if (!result.ok) {
    throw new Error(result.issues.map((issue) => issue.message).join('\n'))
  }
  return result.value
}

const uri = (value: string) => unwrap(parseAbsoluteUri(value))
const instant = (value: string): FhirInstant => unwrap(parseFhirInstant(value))
const patient = (value: string): PatientReference =>
  unwrap(parsePatientReference(value))
const positive = (value: number): PositiveInteger =>
  unwrap(parsePositiveInteger(value))
const resourceIdentity = (system: string, value: string) => ({
  identifier: { system: uri(system), value },
})

const application: ApplicationDeviceInput = {
  identity: resourceIdentity(
    'https://example.org/applications',
    'converter-app',
  ),
  name: 'Example converter',
  version: '0.0.0',
}

const dateTime = instant('2026-08-20T12:00:00Z')
const start = instant('2026-08-20T00:00:00Z')
const end = instant('2026-08-20T12:00:00Z')
const dailyEnd = instant('2026-08-21T00:00:00Z')

const heartRateMeasurement = {
  kind: 'heart-rate',
  value: 64,
  effective: { kind: 'date-time', value: dateTime },
} as const satisfies MobileMeasurement

const bloodPressureMeasurement = {
  kind: 'blood-pressure',
  systolic: 118,
  diastolic: 76,
  effective: { kind: 'date-time', value: dateTime },
} as const satisfies MobileMeasurement

const baseInput = (
  provider: ConnectedProvider,
  sourceType: string,
  measurement: MobileMeasurement,
): ConnectedHealthMeasurementBundleInput =>
  ({
    subject: patient('Patient/example'),
    measurements: [measurement],
    source: {
      adapter: { kind: 'connected-health', provider },
      providerAccountIdentifier: {
        system: uri('https://example.org/deployments/provider-accounts'),
        value: `pseudonym-${provider}-001`,
        assurance: 'deployment-scoped-pseudonym',
      },
      sourceType,
      sourceNativeId: `native-${provider}-${sourceType}`,
      recordingMethod: 'automatically-recorded',
      dataOrigin: {
        identity: resourceIdentity(
          'https://example.org/data-origins',
          provider,
        ),
        name: provider,
      },
    },
    application,
    eventSequence: positive(1),
    issued: instant('2026-08-20T12:01:00Z'),
    recorded: instant('2026-08-20T12:02:00Z'),
  }) as ConnectedHealthMeasurementBundleInput

const scalarCases = [
  {
    provider: 'google-health-api',
    sourceType: 'weight',
    measurement: {
      kind: 'body-weight',
      value: 72.5,
      effective: { kind: 'date-time', value: dateTime },
    },
  },
  {
    provider: 'google-health-api',
    sourceType: 'core-body-temperature',
    measurement: {
      kind: 'body-temperature',
      value: 36.8,
      effective: { kind: 'date-time', value: dateTime },
    },
  },
  {
    provider: 'google-health-api',
    sourceType: 'height',
    measurement: {
      kind: 'body-height',
      value: 178,
      effective: { kind: 'date-time', value: dateTime },
    },
  },
  {
    provider: 'google-health-api',
    sourceType: 'steps',
    measurement: {
      kind: 'step-count',
      value: 8234,
      effective: { kind: 'period', start, end },
    },
  },
  {
    provider: 'oura',
    sourceType: 'daily_activity',
    measurement: {
      kind: 'distance',
      value: 6123,
      effective: { kind: 'period', start, end: dailyEnd },
    },
  },
  {
    provider: 'google-health-api',
    sourceType: 'active-energy-burned',
    measurement: {
      kind: 'active-energy',
      value: 430,
      effective: { kind: 'period', start, end },
    },
  },
  {
    provider: 'oura',
    sourceType: 'sleep',
    measurement: {
      kind: 'sleep-duration',
      value: 7.4,
      effective: { kind: 'period', start, end },
    },
  },
  {
    provider: 'withings',
    sourceType: 'getmeas:9+10',
    measurement: bloodPressureMeasurement,
  },
  {
    provider: 'withings',
    sourceType: 'getmeas:11',
    measurement: heartRateMeasurement,
  },
  {
    provider: 'withings',
    sourceType: 'getmeas:54',
    measurement: {
      kind: 'oxygen-saturation',
      value: 98,
      effective: { kind: 'date-time', value: dateTime },
    },
  },
] as const satisfies ReadonlyArray<{
  readonly provider: ConnectedProvider
  readonly sourceType: string
  readonly measurement: MobileMeasurement
}>

const resources = (
  result: ReturnType<typeof buildConnectedHealthMeasurementBundle>,
) => {
  if (!result.ok) throw new Error(JSON.stringify(result.issues))
  return result.value.entry.map((entry) => entry.resource)
}

describe('Connected Health R4 graph builder', () => {
  it.each(scalarCases)(
    'builds the admitted $provider/$sourceType $measurement.kind graph',
    ({ provider, sourceType, measurement }) => {
      const result = buildConnectedHealthMeasurementBundle(
        baseInput(provider, sourceType, measurement),
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.value.type).toBe('collection')
      expect(result.value.entry).toHaveLength(4)
      expect('total' in result.value).toBe(false)
      expect(Object.isFrozen(result.value)).toBe(true)

      const observation = resources(result).find(
        (resource) => resource.resourceType === 'Observation',
      )
      expect(observation?.meta?.profile).toEqual([
        `https://grovealliance.org/fhir/mobile/StructureDefinition/${sharedMobileMeasurementCatalog[measurement.kind].profile}`,
        'https://grovealliance.org/fhir/connected-health/StructureDefinition/connected-health-observation',
      ])
      expect(observation?.extension).toEqual(
        expect.arrayContaining([
          {
            url: 'https://grovealliance.org/fhir/connected-health/StructureDefinition/connected-health-provider',
            valueCode: provider,
          },
          {
            url: 'https://grovealliance.org/fhir/connected-health/StructureDefinition/connected-health-source-type',
            valueCode: `${provider}/${sourceType}`,
          },
        ]),
      )
      expect(
        observation?.extension?.some(
          ({ url }) =>
            url ===
            'http://hl7.org/fhir/StructureDefinition/observation-gatewayDevice',
        ),
      ).toBe(false)
      expect(observation?.code.coding).toHaveLength(1)
      expect(observation?.id).toBeUndefined()
    },
  )

  it('builds every exact provider/source/measurement mapping in the generated catalog', () => {
    const examples = new Map<MobileMeasurement['kind'], MobileMeasurement>(
      scalarCases.map(({ measurement }) => [measurement.kind, measurement]),
    )
    const exhaustiveMappings = connectedHealthScalarMappings as Readonly<
      Record<
        ConnectedProvider,
        Readonly<Record<string, Readonly<Record<string, string>>>>
      >
    >
    let checked = 0
    for (const [provider, sourceMappings] of Object.entries(
      exhaustiveMappings,
    )) {
      for (const [sourceType, mappings] of Object.entries(sourceMappings)) {
        for (const measurementKind of Object.keys(mappings)) {
          const measurement = examples.get(
            measurementKind as MobileMeasurement['kind'],
          )
          expect(measurement).toBeDefined()
          if (measurement === undefined) continue
          const effectiveRule = (
            connectedHealthRecordEffectiveRules as Readonly<
              Record<string, Readonly<Record<string, unknown>> | undefined>
            >
          )[provider]?.[sourceType]
          const sourceMeasurement =
            effectiveRule === undefined ? measurement : (
              {
                ...measurement,
                effective: { kind: 'period', start, end: dailyEnd },
              }
            )
          expect(
            buildConnectedHealthMeasurementBundle(
              baseInput(
                provider as ConnectedProvider,
                sourceType,
                sourceMeasurement as MobileMeasurement,
              ),
            ).ok,
          ).toBe(true)
          checked += 1
        }
      }
    }
    expect(checked).toBeGreaterThan(scalarCases.length)
  })

  it('atomically builds every present Oura daily-activity output with one complete Provenance target set', () => {
    const dailyActivity = baseInput('oura', 'daily_activity', {
      kind: 'distance',
      value: 6_123,
      effective: { kind: 'period', start, end: dailyEnd },
    })
    const result = buildConnectedHealthMeasurementBundle({
      ...dailyActivity,
      measurements: [
        {
          kind: 'distance',
          value: 6_123,
          effective: { kind: 'period', start, end: dailyEnd },
        },
        {
          kind: 'active-energy',
          value: 430,
          effective: { kind: 'period', start, end: dailyEnd },
        },
        {
          kind: 'step-count',
          value: 8_234,
          effective: { kind: 'period', start, end: dailyEnd },
        },
      ],
    } as ConnectedHealthMeasurementBundleInput)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const observations = result.value.entry.filter(
      ({ resource }) => resource.resourceType === 'Observation',
    )
    expect(observations).toHaveLength(3)
    expect(
      observations.map(({ resource }) => resource.meta?.profile?.[0]),
    ).toEqual([
      'https://grovealliance.org/fhir/mobile/StructureDefinition/grove-mobile-step-count',
      'https://grovealliance.org/fhir/mobile/StructureDefinition/grove-mobile-active-energy',
      'https://grovealliance.org/fhir/mobile/StructureDefinition/grove-mobile-distance',
    ])
    const provenance = result.value.entry.find(
      ({ resource }) => resource.resourceType === 'Provenance',
    )?.resource
    expect(provenance?.resourceType).toBe('Provenance')
    if (provenance?.resourceType !== 'Provenance') return
    expect(provenance.target).toHaveLength(observations.length)
    expect(
      new Set(provenance.target.map(({ reference }) => reference)),
    ).toEqual(new Set(observations.map(({ fullUrl }) => fullUrl)))
  })

  it.each([
    ['one', ['step-count']],
    ['two', ['step-count', 'distance']],
  ] as const)(
    'admits a %s-output subset when those are the fields present in an Oura daily-activity record',
    (_label, kinds) => {
      const candidates = {
        'step-count': {
          kind: 'step-count',
          value: 8_234,
          effective: { kind: 'period', start, end: dailyEnd },
        },
        distance: {
          kind: 'distance',
          value: 6_123,
          effective: { kind: 'period', start, end: dailyEnd },
        },
      } as const
      const input = baseInput('oura', 'daily_activity', candidates[kinds[0]])
      const result = buildConnectedHealthMeasurementBundle({
        ...input,
        measurements: kinds.map((kind) => candidates[kind]),
      } as unknown as ConnectedHealthMeasurementBundleInput)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(
        result.value.entry.filter(
          ({ resource }) => resource.resourceType === 'Observation',
        ),
      ).toHaveLength(kinds.length)
    },
  )

  it('rejects recursively encoded identity leakage through scalar metadata', () => {
    const input = baseInput('withings', 'getmeas:11', heartRateMeasurement)
    expect(
      buildConnectedHealthMeasurementBundle({
        ...input,
        source: { ...input.source, sourceNativeId: 'native id/42' },
        application: {
          ...input.application,
          manufacturer: 'encoded-native%2520id%252F42',
        },
      } as unknown as ConnectedHealthMeasurementBundleInput).ok,
    ).toBe(false)
    expect(
      parseNormalizedProviderRecord({
        source: {
          ...input.source,
          providerAccountIdentifier: {
            ...input.source.providerAccountIdentifier,
            value: 'account value',
          },
          dataOrigin: {
            ...input.source.dataOrigin,
            name: 'encoded-account+value',
          },
        },
        measurements: input.measurements,
      }).ok,
    ).toBe(false)
  })

  it('requires every catalogued daily source to use one shared complete civil-day Period', () => {
    const input = baseInput('oura', 'daily_activity', {
      kind: 'step-count',
      value: 8_234,
      effective: { kind: 'period', start, end: dailyEnd },
    })
    expect(
      buildConnectedHealthMeasurementBundle({
        ...input,
        measurements: [
          {
            kind: 'step-count',
            value: 8_234,
            effective: { kind: 'period', start, end },
          },
        ],
      } as unknown as ConnectedHealthMeasurementBundleInput).ok,
    ).toBe(false)
    expect(
      buildConnectedHealthMeasurementBundle({
        ...input,
        measurements: [
          input.measurements[0],
          {
            kind: 'distance',
            value: 6_123,
            effective: {
              kind: 'period',
              start,
              end: instant('2026-08-22T00:00:00Z'),
            },
          },
        ],
      } as unknown as ConnectedHealthMeasurementBundleInput).ok,
    ).toBe(false)
    expect(
      buildConnectedHealthMeasurementBundle(
        baseInput('withings', 'getactivity:steps', {
          kind: 'step-count',
          value: 8_234,
          effective: { kind: 'period', start, end },
        }),
      ).ok,
    ).toBe(false)
    const daylightSavingStart = instant('2026-11-01T00:00:00-07:00')
    const daylightSavingEnd = instant('2026-11-02T00:00:00-08:00')
    expect(
      buildConnectedHealthMeasurementBundle(
        baseInput('withings', 'getactivity:steps', {
          kind: 'step-count',
          value: 8_234,
          effective: {
            kind: 'period',
            start: daylightSavingStart,
            end: daylightSavingEnd,
          },
        }),
      ).ok,
    ).toBe(true)
  })

  it('rejects duplicate, unsupported, invalid, and non-emitted output inputs before constructing a partial graph', () => {
    const input = baseInput('oura', 'daily_activity', {
      kind: 'step-count',
      value: 8_234,
      effective: { kind: 'period', start, end: dailyEnd },
    })
    expect(
      buildConnectedHealthMeasurementBundle({
        ...input,
        measurements: [],
      } as unknown as ConnectedHealthMeasurementBundleInput).ok,
    ).toBe(false)
    expect(
      buildConnectedHealthMeasurementBundle({
        ...input,
        measurements: [input.measurements[0], input.measurements[0]],
      } as ConnectedHealthMeasurementBundleInput).ok,
    ).toBe(false)
    expect(
      buildConnectedHealthMeasurementBundle({
        ...input,
        measurements: [
          input.measurements[0],
          {
            kind: 'body-weight',
            value: 72,
            effective: { kind: 'date-time', value: dateTime },
          },
        ],
      } as unknown as ConnectedHealthMeasurementBundleInput).ok,
    ).toBe(false)
    expect(
      buildConnectedHealthMeasurementBundle({
        ...input,
        measurements: [
          input.measurements[0],
          {
            kind: 'active-energy',
            value: -1,
            effective: { kind: 'period', start, end: dailyEnd },
          },
        ],
      } as unknown as ConnectedHealthMeasurementBundleInput).ok,
    ).toBe(false)
    expect(
      buildConnectedHealthMeasurementBundle({
        ...input,
        repositoryIds: {
          observations: {
            distance: unwrap(parseFhirId('not-emitted')),
          },
        },
      }).ok,
    ).toBe(false)
  })

  it('treats effective values as emitted metadata and rejects native-id leakage', () => {
    const input = baseInput('withings', 'getmeas:11', heartRateMeasurement)
    expect(
      buildConnectedHealthMeasurementBundle({
        ...input,
        source: {
          ...input.source,
          sourceNativeId: '2026-08-20T12:00:00.000Z',
        },
      } as unknown as ConnectedHealthMeasurementBundleInput).ok,
    ).toBe(false)
  })

  it('derives exact source/output/conversion/exchange identifiers and never emits the native id', () => {
    const input = baseInput('withings', 'getmeas:11', heartRateMeasurement)
    const result = buildConnectedHealthMeasurementBundle(input)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const observation = resources(result).find(
      (resource) => resource.resourceType === 'Observation',
    )
    expect(observation?.identifier?.map(({ system }) => system)).toEqual([
      'https://grovealliance.org/fhir/connected-health/NamingSystem/connected-health-source-record-id',
      'https://grovealliance.org/fhir/connected-health/NamingSystem/connected-health-output-id',
    ])
    for (const identity of observation?.identifier ?? []) {
      expect(identity.value).toMatch(/^v1:[0-9a-f]{64}$/u)
    }
    expect(result.value.identifier?.system).toBe(
      'https://grovealliance.org/fhir/connected-health/NamingSystem/connected-health-exchange-id',
    )
    const provenanceEntry = result.value.entry.find(
      (entry) => entry.resource.resourceType === 'Provenance',
    )
    expect(provenanceEntry?.extension?.[0]?.valueIdentifier?.system).toBe(
      'https://grovealliance.org/fhir/connected-health/NamingSystem/connected-health-conversion-id',
    )
    expect(JSON.stringify(result.value)).not.toContain(
      input.source.sourceNativeId,
    )
    expect(JSON.stringify(result.value)).not.toContain(
      input.source.providerAccountIdentifier.value,
    )
  })

  it('matches the frozen Connected Health JCS/SHA-256 source and output vectors', () => {
    const input = baseInput('google-health-api', 'steps', {
      kind: 'step-count',
      value: 123,
      effective: { kind: 'period', start, end },
    })
    const result = buildConnectedHealthMeasurementBundle({
      ...input,
      source: {
        ...input.source,
        providerAccountIdentifier: {
          system: uri('https://provider.example.org/accounts'),
          value: 'account-001',
          assurance: 'deployment-scoped-pseudonym',
        },
        sourceNativeId: 'steps-2026-08-20T16:00:00Z',
      },
    } as ConnectedHealthMeasurementBundleInput)
    const observation = resources(result).find(
      (resource) => resource.resourceType === 'Observation',
    )
    expect(observation?.identifier?.map((entry) => entry.value)).toEqual([
      'v1:c698f75a1901b494c9c5a2107a88708dccbd1d5556fc5c85f364c536164fa383',
      'v1:58ec980e4eaa0bd8ca600043db5446c21a13482b064fffbb44469046f1876406',
    ])

    const unicodeInput = baseInput('oura', 'sleep', {
      kind: 'sleep-duration',
      value: 7,
      effective: { kind: 'period', start, end },
    })
    const unicodeResult = buildConnectedHealthMeasurementBundle({
      ...unicodeInput,
      source: {
        ...unicodeInput.source,
        providerAccountIdentifier: {
          system: uri('https://provider.example.org/accounts'),
          value: 'café\n"\\',
          assurance: 'deployment-scoped-pseudonym',
        },
        sourceNativeId: 'résumé-\u0001',
      },
    } as ConnectedHealthMeasurementBundleInput)
    const unicodeObservation = resources(unicodeResult).find(
      (resource) => resource.resourceType === 'Observation',
    )
    expect(unicodeObservation?.identifier?.[0]?.value).toBe(
      'v1:05890004d78c74e768503a2aa14e91a66c5f815b41937a2de626fd167d6c59de',
    )
  })

  it('changes only event identities when the durable event sequence changes', () => {
    const first = buildConnectedHealthMeasurementBundle(
      baseInput('withings', 'getmeas:11', heartRateMeasurement),
    )
    const second = buildConnectedHealthMeasurementBundle({
      ...baseInput('withings', 'getmeas:11', heartRateMeasurement),
      eventSequence: positive(2),
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
    const converterGateway = buildConnectedHealthMeasurementBundle({
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
        entry.resource.identifier?.[0]?.value === 'converter-app',
    )
    expect(
      converterObservation?.extension?.find(
        ({ url }) =>
          url ===
          'http://hl7.org/fhir/StructureDefinition/observation-gatewayDevice',
      )?.valueReference?.reference,
    ).toBe(converterApplicationEntry?.fullUrl)

    expect(
      buildConnectedHealthMeasurementBundle({
        ...input,
        gatewayApplication: {
          kind: 'converter-application',
          roleAssurance: 'conversion-only',
        },
      } as unknown as ConnectedHealthMeasurementBundleInput).ok,
    ).toBe(false)
  })

  it('builds a fully attributed graph with distinct gateway and authorized hardware identity', () => {
    const input = baseInput('withings', 'getmeas:11', heartRateMeasurement)
    const result = buildConnectedHealthMeasurementBundle({
      ...input,
      application: {
        ...input.application,
        manufacturer: 'Grove Alliance',
      },
      gatewayApplication: {
        kind: 'distinct-application',
        roleAssurance: 'mediated-or-routed-measurement',
        application: {
          identity: resourceIdentity(
            'https://example.org/applications',
            'gateway-app',
          ),
          name: 'Gateway app',
          version: '2.1.0',
          manufacturer: 'Gateway vendor',
        },
      },
      source: {
        ...input.source,
        dataOrigin: {
          ...input.source.dataOrigin,
          version: '3.0.0',
          manufacturer: 'Source vendor',
        },
        recordingDevice: {
          identity: resourceIdentity(
            'https://example.org/authorized-hardware',
            'hardware-1',
          ),
          identityScope: 'authorized-hardware',
          disclosureAuthorization: 'authorized-for-exchange',
          name: 'Chest strap',
          manufacturer: 'Recorder vendor',
          modelNumber: 'Model 1',
        },
      },
      researchStudyReferences: [
        unwrap(parseResearchStudyReference('ResearchStudy/study-1')),
      ],
    } as ConnectedHealthMeasurementBundleInput)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.entry).toHaveLength(6)
    const observation = resources(result).find(
      (resource) => resource.resourceType === 'Observation',
    )
    expect(observation?.device?.reference).toMatch(/^urn:uuid:/u)
    expect(
      observation?.extension?.some(
        ({ url }) =>
          url ===
          'http://hl7.org/fhir/StructureDefinition/workflow-researchStudy',
      ),
    ).toBe(true)
  })

  it('requires an explicit privacy scope for recording-device identity and never accepts a serial number', () => {
    const input = baseInput('withings', 'getmeas:11', heartRateMeasurement)
    const result = buildConnectedHealthMeasurementBundle({
      ...input,
      source: {
        ...input.source,
        recordingDevice: {
          identity: resourceIdentity(
            'https://example.org/deployments/recording-devices',
            'device-pseudonym-1',
          ),
          identityScope: 'deployment-scoped',
          name: 'Connected scale',
        },
      },
    } as ConnectedHealthMeasurementBundleInput)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const recordingDevice = resources(result).find(
      (resource) =>
        resource.resourceType === 'Device' &&
        resource.identifier?.[0]?.value === 'device-pseudonym-1',
    )
    expect(recordingDevice).toBeDefined()
    expect(recordingDevice).not.toHaveProperty('serialNumber')

    expect(
      buildConnectedHealthMeasurementBundle({
        ...input,
        source: {
          ...input.source,
          recordingDevice: {
            identity: resourceIdentity(
              'https://example.org/hardware-identifiers',
              'global-hardware-id',
            ),
            identityScope: 'authorized-hardware',
            serialNumber: 'SERIAL-123',
          },
        },
      } as unknown as ConnectedHealthMeasurementBundleInput).ok,
    ).toBe(false)
  })

  it('rejects arbitrary source codings instead of treating lineage as a clinical code', () => {
    const input = baseInput('withings', 'getmeas:11', heartRateMeasurement)
    expect(
      buildConnectedHealthMeasurementBundle({
        ...input,
        source: {
          ...input.source,
          sourceTypeCoding: {
            system: 'https://provider.example/source-types',
            code: 'broad-summary-record',
          },
        },
      } as unknown as ConnectedHealthMeasurementBundleInput).ok,
    ).toBe(false)
  })

  it('accepts only unique, unambiguous typed ResearchStudy references', () => {
    const input = baseInput('withings', 'getmeas:11', heartRateMeasurement)
    const local = unwrap(parseResearchStudyReference('ResearchStudy/local-1'))
    const absolute = unwrap(
      parseResearchStudyReference(
        'https://research.example/fhir/ResearchStudy/remote-1',
      ),
    )
    expect(
      buildConnectedHealthMeasurementBundle({
        ...input,
        researchStudyReferences: [local, absolute],
      }).ok,
    ).toBe(true)

    const duplicate = parseConnectedHealthMeasurementBundleInput({
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
      parseConnectedHealthMeasurementBundleInput({
        ...input,
        researchStudyReferences: [
          'https://research.example/fhir/ResearchStudy/remote-1?version=2',
        ],
      }).ok,
    ).toBe(false)
    expect(
      parseConnectedHealthMeasurementBundleInput({
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

  it('rounds Mobile effective instants before enforcing a non-zero Period', () => {
    const collapsed = baseInput('oura', 'sleep', {
      kind: 'sleep-duration',
      value: 0.1,
      effective: {
        kind: 'period',
        start: instant('2026-08-20T12:00:00.0001Z'),
        end: instant('2026-08-20T12:00:00.0002Z'),
      },
    })
    expect(buildConnectedHealthMeasurementBundle(collapsed).ok).toBe(false)

    const input = baseInput('oura', 'sleep', {
      kind: 'sleep-duration',
      value: 0.1,
      effective: {
        kind: 'period',
        start: instant('2026-08-20T12:00:00.0004Z'),
        end: instant('2026-08-20T12:00:00.0006Z'),
      },
    })
    const result = buildConnectedHealthMeasurementBundle(input)
    expect(result.ok).toBe(true)
    const observation = resources(result).find(
      (resource) => resource.resourceType === 'Observation',
    )
    expect(observation?.effectivePeriod).toEqual({
      start: '2026-08-20T12:00:00.000Z',
      end: '2026-08-20T12:00:00.001Z',
    })
    expect(
      buildConnectedHealthMeasurementBundle({
        ...input,
        measurements: [
          {
            ...input.measurements[0],
            effective: {
              kind: 'period',
              start: instant('2026-08-20T12:00:00.0006Z'),
              end: instant('2026-08-20T12:00:00.0004Z'),
            },
          },
        ],
      } as ConnectedHealthMeasurementBundleInput).ok,
    ).toBe(false)
  })

  it.each(mobileEffectiveCanonicalizationVectors)(
    'matches the IG Mobile effective-time vector $id',
    ({ input, output }) => {
      expect(canonicalizeMobileEffectiveInstant(input)).toEqual({
        ok: true,
        value: output,
      })
    },
  )

  it('fails closed for invalid input and a rounding carry outside FHIR four-digit years', () => {
    expect(canonicalizeMobileEffectiveInstant('not-an-instant').ok).toBe(false)
    expect(
      canonicalizeMobileEffectiveInstant('9999-12-31T23:59:59.9996Z').ok,
    ).toBe(false)
  })

  it('serializes a canonical effectiveDateTime while preserving its source offset', () => {
    const input = baseInput('withings', 'getmeas:11', {
      ...heartRateMeasurement,
      effective: {
        kind: 'date-time',
        value: instant('2026-08-20T08:30:00.251500001-07:00'),
      },
    })
    const parsed = parseConnectedHealthMeasurementBundleInput(input)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.measurements[0].effective).toEqual({
      kind: 'date-time',
      value: '2026-08-20T08:30:00.252-07:00',
    })

    const result = buildConnectedHealthMeasurementBundle(input)
    const observation = resources(result).find(
      (resource) => resource.resourceType === 'Observation',
    )
    expect(observation?.effectiveDateTime).toBe('2026-08-20T08:30:00.252-07:00')
  })

  it('derives every urn:uuid edge from a complete business identifier', () => {
    const result = buildConnectedHealthMeasurementBundle(
      baseInput('withings', 'getmeas:11', heartRateMeasurement),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    for (const entry of result.value.entry) {
      expect(entry.fullUrl).toMatch(/^urn:uuid:/u)
      const businessIdentifier = entry.extension?.[0]?.valueIdentifier
      expect(businessIdentifier?.system).toBeDefined()
      expect(businessIdentifier?.value).toBeDefined()
      expect(
        deriveEntryFullUrl({
          system: uri(businessIdentifier?.system ?? ''),
          value: businessIdentifier?.value ?? '',
        }),
      ).toEqual({ ok: true, value: entry.fullUrl })
    }
  })

  it('constructs one composite Withings blood-pressure panel', () => {
    const result = buildConnectedHealthMeasurementBundle(
      baseInput('withings', 'getmeas:9+10', bloodPressureMeasurement),
    )
    const observation = resources(result).find(
      (resource) => resource.resourceType === 'Observation',
    )
    expect(observation?.component).toHaveLength(2)
    expect(observation?.valueQuantity).toBeUndefined()
  })

  it('uses optional Resource.id values only when supplied by a repository', () => {
    const result = buildConnectedHealthMeasurementBundle({
      ...baseInput('withings', 'getmeas:11', heartRateMeasurement),
      repositoryIds: {
        bundle: unwrap(parseFhirId('bundle-42')),
        observations: {
          'heart-rate': unwrap(parseFhirId('observation-42')),
        },
        provenance: unwrap(parseFhirId('provenance-42')),
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.id).toBe('bundle-42')
    expect(
      resources(result).find(
        (resource) => resource.resourceType === 'Observation',
      )?.id,
    ).toBe('observation-42')
  })

  it('omits optional attribution and device fields while preserving repository device ids', () => {
    const input = baseInput('withings', 'getmeas:11', heartRateMeasurement)
    const result = buildConnectedHealthMeasurementBundle({
      ...input,
      application: {
        identity: {
          ...application.identity,
          id: unwrap(parseFhirId('application-42')),
        },
        name: application.name,
      },
      source: {
        adapter: input.source.adapter,
        providerAccountIdentifier: input.source.providerAccountIdentifier,
        sourceType: input.source.sourceType,
        sourceNativeId: input.source.sourceNativeId,
        dataOrigin: input.source.dataOrigin,
        recordingDevice: {
          identity: {
            ...resourceIdentity(
              'https://example.org/deployments/recording-devices',
              'minimal-device',
            ),
            id: unwrap(parseFhirId('recording-device-42')),
          },
          identityScope: 'deployment-scoped',
        },
      },
    } as ConnectedHealthMeasurementBundleInput)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const observation = resources(result).find(
      (resource) => resource.resourceType === 'Observation',
    )
    expect(observation?.extension).toEqual(
      expect.arrayContaining([
        {
          url: 'https://grovealliance.org/fhir/connected-health/StructureDefinition/connected-health-source-type',
          valueCode: 'withings/getmeas:11',
        },
      ]),
    )
    const minimalDevice = resources(result).find(
      (resource) => resource.id === 'recording-device-42',
    )
    expect(minimalDevice).not.toHaveProperty('deviceName')
    expect(minimalDevice).not.toHaveProperty('manufacturer')
    expect(minimalDevice).not.toHaveProperty('modelNumber')
  })

  it('rejects invalid scalar ranges at the strict runtime boundary', () => {
    const input = baseInput('withings', 'getmeas:11', heartRateMeasurement)
    expect(
      parseConnectedHealthMeasurementBundleInput({
        ...input,
        measurements: [
          {
            ...heartRateMeasurement,
            effective: { kind: 'date-time', value: 'not-an-instant' },
          },
        ],
      }).ok,
    ).toBe(false)
    expect(
      parseConnectedHealthMeasurementBundleInput({
        ...input,
        measurements: [{ ...heartRateMeasurement, value: 0 }],
      }).ok,
    ).toBe(false)
    expect(
      parseConnectedHealthMeasurementBundleInput({
        ...baseInput('google-health-api', 'steps', {
          kind: 'step-count',
          value: 1,
          effective: { kind: 'period', start, end },
        }),
        measurements: [
          {
            kind: 'step-count',
            value: 1.5,
            effective: { kind: 'period', start, end },
          },
        ],
      }).ok,
    ).toBe(false)
    expect(
      parseConnectedHealthMeasurementBundleInput({
        ...baseInput('withings', 'getmeas:54', {
          kind: 'oxygen-saturation',
          value: 98,
          effective: { kind: 'date-time', value: dateTime },
        }),
        measurements: [
          {
            kind: 'oxygen-saturation',
            value: 101,
            effective: { kind: 'date-time', value: dateTime },
          },
        ],
      }).ok,
    ).toBe(false)
  })

  it('rejects a source-native identity containing an isolated surrogate', () => {
    const input = baseInput('withings', 'getmeas:11', heartRateMeasurement)
    const invalid = {
      ...input,
      source: { ...input.source, sourceNativeId: 'invalid-\ud800' },
    } as ConnectedHealthMeasurementBundleInput
    expect(parseConnectedHealthMeasurementBundleInput(invalid).ok).toBe(false)
    expect(buildConnectedHealthMeasurementBundle(invalid).ok).toBe(false)
  })

  it('fails closed at every direct Connected Health identity primitive boundary', () => {
    const valid = {
      provider: 'withings',
      providerAccountIdentifier: {
        system: uri('https://example.org/provider-accounts'),
        value: 'account-pseudonym',
      },
      sourceType: 'getmeas:11',
      sourceNativeId: 'source-record-1',
      outputDiscriminators: ['heart-rate'],
      eventSequence: positive(1),
    } as const
    expect(
      deriveConnectedHealthIdentities({
        ...valid,
        providerAccountIdentifier: {
          ...valid.providerAccountIdentifier,
          system: '/relative' as never,
        },
      }).ok,
    ).toBe(false)
    expect(
      deriveConnectedHealthIdentities({
        ...valid,
        outputDiscriminators: ['  '],
      }).ok,
    ).toBe(false)
    expect(
      deriveConnectedHealthIdentities({
        ...valid,
        outputDiscriminators: ['heart-rate', 'heart-rate'],
      }).ok,
    ).toBe(false)
    expect(
      deriveConnectedHealthIdentities({
        ...valid,
        eventSequence: 0 as never,
      }).ok,
    ).toBe(false)
  })

  it.each([
    [
      'source native id',
      (input: ConnectedHealthMeasurementBundleInput) => ({
        ...input,
        application: {
          ...input.application,
          manufacturer: `Leaked ${input.source.sourceNativeId}`,
        },
      }),
    ],
    [
      'provider account pseudonym',
      (input: ConnectedHealthMeasurementBundleInput) => ({
        ...input,
        source: {
          ...input.source,
          dataOrigin: {
            ...input.source.dataOrigin,
            name: `Origin ${input.source.providerAccountIdentifier.value}`,
          },
        },
      }),
    ],
  ] as const)(
    'rejects %s leakage through emitted metadata',
    (_name, mutate) => {
      const input = baseInput('withings', 'getmeas:11', heartRateMeasurement)
      const candidate = mutate(input) as ConnectedHealthMeasurementBundleInput
      expect(parseConnectedHealthMeasurementBundleInput(candidate).ok).toBe(
        false,
      )
      expect(buildConnectedHealthMeasurementBundle(candidate).ok).toBe(false)
      if (_name === 'provider account pseudonym') {
        expect(
          parseNormalizedProviderRecord({
            source: candidate.source,
            measurements: candidate.measurements,
          }).ok,
        ).toBe(false)
      }
    },
  )

  it.each([
    [
      'provider account value',
      (input: ConnectedHealthMeasurementBundleInput) => ({
        ...input,
        source: {
          ...input.source,
          providerAccountIdentifier: {
            ...input.source.providerAccountIdentifier,
            value: ' \t ',
          },
        },
      }),
    ],
    [
      'source native id',
      (input: ConnectedHealthMeasurementBundleInput) => ({
        ...input,
        source: { ...input.source, sourceNativeId: '\n  ' },
      }),
    ],
    [
      'source type',
      (input: ConnectedHealthMeasurementBundleInput) => ({
        ...input,
        source: { ...input.source, sourceType: '   ' },
      }),
    ],
    [
      'converter identifier',
      (input: ConnectedHealthMeasurementBundleInput) => ({
        ...input,
        application: {
          ...input.application,
          identity: {
            ...input.application.identity,
            identifier: {
              ...input.application.identity.identifier,
              value: '\t',
            },
          },
        },
      }),
    ],
    [
      'data-origin identifier',
      (input: ConnectedHealthMeasurementBundleInput) => ({
        ...input,
        source: {
          ...input.source,
          dataOrigin: {
            ...input.source.dataOrigin,
            identity: {
              ...input.source.dataOrigin.identity,
              identifier: {
                ...input.source.dataOrigin.identity.identifier,
                value: '  ',
              },
            },
          },
        },
      }),
    ],
  ] as const)('rejects a whitespace-only %s', (_name, mutate) => {
    const input = baseInput('withings', 'getmeas:11', heartRateMeasurement)
    expect(parseConnectedHealthMeasurementBundleInput(mutate(input)).ok).toBe(
      false,
    )
  })

  it.each(['converter', 'gateway', 'data-origin', 'recording-device'] as const)(
    'rejects an invalid Unicode %s business identity',
    (role) => {
      const input = baseInput('withings', 'getmeas:11', heartRateMeasurement)
      const invalidIdentity = resourceIdentity(
        'https://example.org/identifiers',
        'invalid-\ud800',
      )
      let candidate: ConnectedHealthMeasurementBundleInput
      if (role === 'converter') {
        candidate = {
          ...input,
          application: { ...input.application, identity: invalidIdentity },
        }
      } else if (role === 'gateway') {
        candidate = {
          ...input,
          gatewayApplication: {
            kind: 'distinct-application',
            roleAssurance: 'mediated-or-routed-measurement',
            application: {
              identity: invalidIdentity,
              name: 'Invalid gateway identity',
            },
          },
        }
      } else if (role === 'data-origin') {
        candidate = {
          ...input,
          source: {
            ...input.source,
            dataOrigin: {
              ...input.source.dataOrigin,
              identity: invalidIdentity,
            },
          },
        } as ConnectedHealthMeasurementBundleInput
      } else {
        candidate = {
          ...input,
          source: {
            ...input.source,
            recordingDevice: {
              identity: invalidIdentity,
              identityScope: 'deployment-scoped',
            },
          },
        } as ConnectedHealthMeasurementBundleInput
      }
      expect(parseConnectedHealthMeasurementBundleInput(candidate).ok).toBe(
        false,
      )
      expect(buildConnectedHealthMeasurementBundle(candidate).ok).toBe(false)
    },
  )

  it.each([
    ['google-health-api', 'heart-rate', heartRateMeasurement],
    [
      'google-health-api',
      'blood-glucose',
      {
        kind: 'blood-glucose',
        value: 94,
        effective: { kind: 'date-time', value: dateTime },
        specimen: {
          identity: resourceIdentity(
            'https://example.org/specimens',
            'whole-blood',
          ),
        },
      },
    ],
    [
      'oura',
      'sleep',
      {
        kind: 'sleep-stage',
        stage: 'deep',
        effective: { kind: 'period', start, end },
      },
    ],
  ] as const)(
    'fails closed for non-scalar or unsupported %s/%s data',
    (provider, sourceType, measurement) => {
      const result = buildConnectedHealthMeasurementBundle(
        baseInput(
          provider,
          sourceType,
          measurement as unknown as MobileMeasurement,
        ),
      )
      expect(result.ok).toBe(false)
    },
  )

  it('rejects non-positive event sequences and duplicate graph identities', () => {
    const input = baseInput('withings', 'getmeas:11', heartRateMeasurement)
    expect(
      buildConnectedHealthMeasurementBundle({
        ...input,
        eventSequence: 0,
      } as ConnectedHealthMeasurementBundleInput).ok,
    ).toBe(false)
    expect(
      buildConnectedHealthMeasurementBundle({
        ...input,
        source: {
          ...input.source,
          dataOrigin: {
            ...input.source.dataOrigin,
            identity: application.identity,
          },
        },
      } as unknown as ConnectedHealthMeasurementBundleInput).ok,
    ).toBe(false)
  })
})

describe('Exchange entry identity', () => {
  it.each(groveFhirExchangeIdentity.vectors)(
    'matches the IG $case vector',
    (vector) => {
      expect(
        deriveEntryFullUrl({
          system: uri(vector.system),
          value: vector.value,
        }),
      ).toEqual({ ok: true, value: vector.fullUrl })
    },
  )

  it('rejects isolated UTF-16 surrogates before UUID derivation', () => {
    expect(
      deriveEntryFullUrl({
        system: uri('https://example.org/identifiers'),
        value: 'invalid-\ud800',
      }).ok,
    ).toBe(false)
    expect(
      deriveEntryFullUrl({
        system: uri('https://example.org/identifiers'),
        value: 'invalid-\udc00',
      }).ok,
    ).toBe(false)
    expect(
      deriveEntryFullUrl({
        system: uri('https://example.org/identifiers'),
        value: 'valid-😀',
      }).ok,
    ).toBe(true)
  })

  it('rejects incomplete entry identifiers and invalid repository ids', () => {
    expect(
      canonicalizeEntryIdentifier({
        system: '/relative' as never,
        value: 'record-1',
      }).ok,
    ).toBe(false)
    expect(
      canonicalizeEntryIdentifier({
        system: uri('https://example.org/identifiers'),
        value: '',
      }).ok,
    ).toBe(false)
    expect(
      canonicalizeEntryIdentifier({
        system: uri('https://example.org/identifiers'),
        value: ' \t\n ',
      }).ok,
    ).toBe(false)
    expect(
      createEntryIdentity(
        {
          system: uri('https://example.org/identifiers'),
          value: 'record-1',
        },
        'invalid/id' as never,
      ).ok,
    ).toBe(false)
  })
})

describe('Provider-neutral normalization contract', () => {
  it.each([
    'google-health-active-energy.json',
    'oura-daily-activity.json',
    'oura-sleep-duration.json',
    'withings-body-weight.json',
  ])('accepts the normalized %s fixture', (name) => {
    const fixture: unknown = JSON.parse(
      readFileSync(new URL(`../fixtures/normalized/${name}`, import.meta.url), {
        encoding: 'utf8',
      }),
    )
    expect(parseNormalizedProviderRecord(fixture).ok).toBe(true)
  })

  it('normalizes multi-output serialization order without mutating caller data', () => {
    const fixture = JSON.parse(
      readFileSync(
        new URL(
          '../fixtures/normalized/oura-daily-activity.json',
          import.meta.url,
        ),
        { encoding: 'utf8' },
      ),
    ) as { measurements: Array<{ kind: string }> }
    const callerOrder = fixture.measurements.map(({ kind }) => kind)
    const result = parseNormalizedProviderRecord(fixture)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.measurements.map(({ kind }) => kind)).toEqual([
      'step-count',
      'active-energy',
      'distance',
    ])
    expect(fixture.measurements.map(({ kind }) => kind)).toEqual(callerOrder)
    expect(Object.isFrozen(result.value.measurements)).toBe(true)
  })

  it('rejects raw response fields rather than silently stripping them', () => {
    const fixture = JSON.parse(
      readFileSync(
        new URL(
          '../fixtures/normalized/oura-sleep-duration.json',
          import.meta.url,
        ),
        { encoding: 'utf8' },
      ),
    ) as Record<string, unknown>
    expect(
      parseNormalizedProviderRecord({
        ...fixture,
        rawVendorResponse: { readiness: 97 },
      }).ok,
    ).toBe(false)
  })

  it('requires the caller to attest that the account identifier is deployment-scoped and pseudonymous', () => {
    const fixture = JSON.parse(
      readFileSync(
        new URL(
          '../fixtures/normalized/oura-sleep-duration.json',
          import.meta.url,
        ),
        { encoding: 'utf8' },
      ),
    ) as {
      source: {
        providerAccountIdentifier: Record<string, unknown>
      }
    }
    const { system, value } = fixture.source.providerAccountIdentifier
    expect(
      parseNormalizedProviderRecord({
        ...fixture,
        source: {
          ...fixture.source,
          providerAccountIdentifier: { system, value },
        },
      }).ok,
    ).toBe(false)
  })

  it('strictly parses the complete graph input and preserves identity strings verbatim', () => {
    const input = baseInput('withings', 'getmeas:11', heartRateMeasurement)
    const result = parseConnectedHealthMeasurementBundleInput({
      ...input,
      source: {
        ...input.source,
        providerAccountIdentifier: {
          ...input.source.providerAccountIdentifier,
          value: ' pseudonym-with-significant-spaces ',
        },
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.source.providerAccountIdentifier.value).toBe(
      ' pseudonym-with-significant-spaces ',
    )

    expect(
      buildConnectedHealthMeasurementBundle({
        ...input,
        rawVendorResponse: { heart_rate: 64 },
      } as ConnectedHealthMeasurementBundleInput & {
        rawVendorResponse: unknown
      }).ok,
    ).toBe(false)
    expect(
      buildConnectedHealthMeasurementBundle({
        ...input,
        source: {
          ...input.source,
          rawVendorResponse: { heart_rate: 64 },
        },
      } as unknown as ConnectedHealthMeasurementBundleInput).ok,
    ).toBe(false)
  })

  it('rejects an arbitrary adapter and a mismatched source token', () => {
    const dataOrigin = {
      identity: resourceIdentity('https://example.org/data-origins', 'oura'),
      name: 'Oura',
    }
    expect(
      parseNormalizedProviderRecord({
        source: {
          adapter: { kind: 'mobile', provider: 'oura' },
          providerAccountIdentifier: {
            system: 'https://example.org/deployments/provider-accounts',
            value: 'pseudonym-oura-001',
            assurance: 'deployment-scoped-pseudonym',
          },
          sourceType: 'sleep',
          sourceNativeId: 'sleep-1',
          dataOrigin,
        },
        measurements: [
          {
            kind: 'sleep-duration',
            value: 7.4,
            effective: { kind: 'period', start, end },
          },
        ],
      }).ok,
    ).toBe(false)

    expect(
      parseNormalizedProviderRecord({
        source: {
          adapter: { kind: 'connected-health', provider: 'oura' },
          providerAccountIdentifier: {
            system: 'https://example.org/deployments/provider-accounts',
            value: 'pseudonym-oura-001',
            assurance: 'deployment-scoped-pseudonym',
          },
          sourceType: 'daily_readiness',
          sourceNativeId: 'readiness-1',
          dataOrigin,
        },
        measurements: [heartRateMeasurement],
      }).ok,
    ).toBe(false)
  })

  it('correlates provider, source token, and measurement at compile time', () => {
    const withingsSource = {
      adapter: { kind: 'connected-health', provider: 'withings' },
      providerAccountIdentifier: {
        system: uri('https://example.org/deployments/provider-accounts'),
        value: 'pseudonym-withings-001',
        assurance: 'deployment-scoped-pseudonym',
      },
      sourceType: 'getmeas:11',
      sourceNativeId: 'heart-rate-1',
      dataOrigin: {
        identity: resourceIdentity(
          'https://example.org/data-origins',
          'withings',
        ),
        name: 'Withings',
      },
    } as const
    const valid: ConnectedProviderRecord<'withings', 'getmeas:11'> = {
      source: withingsSource,
      measurements: [heartRateMeasurement],
    }
    expect(valid.measurements[0].kind).toBe('heart-rate')

    type OuraSleep = ConnectedProviderRecord<'oura', 'sleep'>
    const source = {
      ...withingsSource,
      adapter: { kind: 'connected-health', provider: 'oura' },
      sourceType: 'sleep',
    } as const
    const invalidMeasurement = {
      kind: 'blood-glucose',
      value: 95,
      effective: { kind: 'date-time', value: dateTime },
      specimen: {
        identity: resourceIdentity('https://example.org/specimens', 'blood'),
      },
    }
    // @ts-expect-error Oura sleep admits sleep-duration, never glucose.
    const invalid: OuraSleep = { source, measurements: [invalidMeasurement] }
    expect(invalid).toBeDefined()
  })

  it('generates only catalog-owned scalar source tokens', () => {
    expect(
      Object.hasOwn(connectedHealthScalarMappings.withings, 'getmeas:9'),
    ).toBe(false)
    expect(connectedHealthScalarMappings.withings['getmeas:9+10']).toEqual({
      'blood-pressure': 'blood-pressure-panel',
    })
  })
})

describe('Connected Health builder properties', () => {
  it('preserves every finite positive heart-rate value', () => {
    assert(
      property(
        double({
          min: 0.01,
          max: 400,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        (value) => {
          const result = buildConnectedHealthMeasurementBundle(
            baseInput('withings', 'getmeas:11', {
              kind: 'heart-rate',
              value,
              effective: { kind: 'date-time', value: dateTime },
            }),
          )
          expect(result.ok).toBe(true)
          if (!result.ok) return
          expect(
            resources(result).find(
              (resource) => resource.resourceType === 'Observation',
            )?.valueQuantity?.value,
          ).toBe(value)
        },
      ),
    )
  })

  it('rejects every oxygen saturation outside the percentage range', () => {
    assert(
      property(
        oneof(
          double({ min: -10_000, max: -Number.MIN_VALUE, noNaN: true }),
          double({ min: 100.000_001, max: 10_000, noNaN: true }),
        ),
        (value) => {
          expect(
            buildConnectedHealthMeasurementBundle(
              baseInput('withings', 'getmeas:54', {
                kind: 'oxygen-saturation',
                value,
                effective: { kind: 'date-time', value: dateTime },
              }),
            ).ok,
          ).toBe(false)
        },
      ),
    )
  })
})
