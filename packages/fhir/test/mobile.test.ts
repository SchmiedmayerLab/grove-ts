//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { readFileSync } from 'node:fs'
import { assert, double, oneof, property } from 'fast-check'
import type { FhirInstant, PatientReference } from '../src/core/index.js'
import {
  buildMobileBundle,
  createEntryIdentity,
  deriveEntryFullUrl,
  groveFhirExchangeIdentity,
  implementedMeasurementCatalog,
  parseAbsoluteUri,
  parseFhirInstant,
  parseNormalizedProviderMeasurement,
  parsePatientReference,
  type ApplicationDeviceInput,
  type CompleteIdentifierInput,
  type MobileBundleInput,
  type MobileMeasurement,
  type Result,
} from '../src/index.js'

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
const identified = (system: string, value: string) =>
  unwrap(
    createEntryIdentity({
      system: uri(system),
      value,
    }),
  )
const specimen = (value: string) => ({
  identity: identified('https://example.org/specimens', value),
})

const outputIdentifier: CompleteIdentifierInput = {
  system: uri('https://example.org/mobile-output'),
  value: 'output-1',
}

const application: ApplicationDeviceInput = {
  identity: identified('https://example.org/applications', 'converter-app'),
  name: 'Example converter',
  version: '2.0.0',
}

const dataOrigin: ApplicationDeviceInput = {
  identity: identified('https://example.org/data-origins', 'google-health'),
  name: 'Google Health',
}

const baseInput = (measurement: MobileMeasurement): MobileBundleInput => ({
  subject: patient('Patient/example'),
  measurement,
  source: {
    adapter: { kind: 'connected-health', provider: 'google-health' },
    identifier: {
      system: uri('https://example.org/google-health/records'),
      value: `source-${measurement.kind}`,
    },
    display: 'Synthetic Google Health record',
    recordingMethod: 'automatically-recorded',
    dataOrigin,
  },
  application,
  bundle: {
    identifier: {
      system: uri('https://example.org/bundles'),
      value: `bundle-${measurement.kind}`,
    },
  },
  observation: {
    ...unwrap(createEntryIdentity(outputIdentifier)),
  },
  provenance: identified(
    'https://example.org/provenance',
    `provenance-${measurement.kind}`,
  ),
  issued: instant('2026-08-20T12:01:00Z'),
  recorded: instant('2026-08-20T12:02:00Z'),
})

const dateTime = instant('2026-08-20T12:00:00Z')
const start = instant('2026-08-20T00:00:00Z')
const end = instant('2026-08-20T12:00:00Z')

const heartRateMeasurement: MobileMeasurement = {
  kind: 'heart-rate',
  value: 64,
  effective: { kind: 'date-time', value: dateTime },
}

const bloodPressureMeasurement: MobileMeasurement = {
  kind: 'blood-pressure',
  systolic: 118,
  diastolic: 76,
  effective: { kind: 'date-time', value: dateTime },
}

const measurements: readonly MobileMeasurement[] = [
  heartRateMeasurement,
  {
    kind: 'body-weight',
    value: 72.5,
    effective: { kind: 'date-time', value: dateTime },
  },
  bloodPressureMeasurement,
  {
    kind: 'body-temperature',
    value: 36.8,
    effective: { kind: 'date-time', value: dateTime },
  },
  {
    kind: 'respiratory-rate',
    value: 14,
    effective: { kind: 'date-time', value: dateTime },
  },
  {
    kind: 'oxygen-saturation',
    value: 98,
    effective: { kind: 'date-time', value: dateTime },
  },
  {
    kind: 'body-height',
    value: 178,
    effective: { kind: 'date-time', value: dateTime },
  },
  {
    kind: 'body-mass-index',
    value: 22.9,
    effective: { kind: 'date-time', value: dateTime },
  },
  {
    kind: 'blood-glucose',
    value: 94,
    effective: { kind: 'date-time', value: dateTime },
    specimen: specimen('whole-blood-1'),
  },
  {
    kind: 'capillary-blood-glucose',
    value: 92,
    effective: { kind: 'date-time', value: dateTime },
    specimen: specimen('capillary-blood-1'),
  },
  {
    kind: 'serum-plasma-glucose',
    value: 91,
    effective: { kind: 'date-time', value: dateTime },
    specimen: { ...specimen('plasma-1'), specimenKind: 'plasma' },
  },
  {
    kind: 'interstitial-glucose',
    value: 89,
    effective: { kind: 'date-time', value: dateTime },
    specimen: specimen('interstitial-1'),
  },
  {
    kind: 'basal-body-temperature',
    value: 36.4,
    effective: { kind: 'date-time', value: dateTime },
  },
  {
    kind: 'step-count',
    value: 8234,
    effective: { kind: 'period', start, end },
  },
  { kind: 'distance', value: 6123, effective: { kind: 'period', start, end } },
  {
    kind: 'active-energy',
    value: 430,
    effective: { kind: 'period', start, end },
  },
  {
    kind: 'sleep-duration',
    value: 7.4,
    effective: { kind: 'period', start, end },
  },
  {
    kind: 'sleep-stage',
    stage: 'rem',
    effective: { kind: 'period', start, end },
  },
]

const resources = (result: ReturnType<typeof buildMobileBundle>) => {
  if (!result.ok) throw new Error(JSON.stringify(result.issues))
  return result.value.entry.map((entry) => entry.resource)
}

describe('Mobile R4 graph builder', () => {
  it.each(measurements)(
    'builds a conformant graph for $kind',
    (measurement) => {
      const result = buildMobileBundle(baseInput(measurement))
      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.value.type).toBe('collection')
      const expectedEntries = 'specimen' in measurement ? 5 : 4
      expect(result.value.entry).toHaveLength(expectedEntries)
      expect(result.value.total).toBe(expectedEntries)
      expect(Object.isFrozen(result.value)).toBe(true)

      const observation = resources(result).find(
        (resource) => resource.resourceType === 'Observation',
      )
      expect(observation?.meta?.profile).toEqual([
        `https://grovealliance.org/fhir/mobile/StructureDefinition/${implementedMeasurementCatalog[measurement.kind].profile}`,
        'https://grovealliance.org/fhir/connected-health/StructureDefinition/connected-health-observation',
      ])
      expect(observation?.id).toBeUndefined()
    },
  )

  it('is deterministic and never invents identifiers, ids, times, or fullUrls', () => {
    const input = baseInput(heartRateMeasurement)
    const first = buildMobileBundle(input)
    const second = buildMobileBundle(input)
    expect(first).toEqual(second)
  })

  it('constructs a composite blood pressure Observation', () => {
    const result = buildMobileBundle(baseInput(bloodPressureMeasurement))
    const observation = resources(result).find(
      (resource) => resource.resourceType === 'Observation',
    )
    expect(observation?.component).toHaveLength(2)
    expect(observation?.valueQuantity).toBeUndefined()
  })

  it.each([
    ['blood-glucose', 'whole-blood-example', '258580003'],
    ['capillary-blood-glucose', 'capillary-example', '122554006'],
    ['interstitial-glucose', 'interstitial-example', '258479004'],
  ] as const)(
    'constructs an explicit %s Specimen graph node',
    (kind, specimenValue, expectedCode) => {
      const specimenInput = specimen(specimenValue)
      const measurement: MobileMeasurement = {
        kind,
        value: 95,
        effective: { kind: 'date-time', value: dateTime },
        specimen: specimenInput,
      }
      const result = buildMobileBundle(baseInput(measurement))
      const graph = resources(result)
      const specimenResource = graph.find(
        (resource) => resource.resourceType === 'Specimen',
      )
      const observation = graph.find(
        (resource) => resource.resourceType === 'Observation',
      )
      expect(specimenResource?.type?.coding?.[0]?.code).toBe(expectedCode)
      expect(observation?.specimen?.reference).toBe(
        specimenInput.identity.fullUrl,
      )
    },
  )

  it.each(['plasma', 'serum'] as const)(
    'retains the exact %s specimen distinction',
    (specimenKind) => {
      const measurement: MobileMeasurement = {
        kind: 'serum-plasma-glucose',
        value: 95,
        effective: { kind: 'date-time', value: dateTime },
        specimen: {
          ...specimen(`serum-plasma-${specimenKind}`),
          specimenKind,
        },
      }
      const result = buildMobileBundle(baseInput(measurement))
      const specimenResource = resources(result).find(
        (resource) => resource.resourceType === 'Specimen',
      )
      expect(specimenResource?.type?.coding?.[0]?.display).toContain(
        specimenKind === 'plasma' ? 'Plasma' : 'Serum',
      )
    },
  )

  it('keeps source and output identity separate', () => {
    const result = buildMobileBundle(baseInput(heartRateMeasurement))
    const observation = resources(result).find(
      (resource) => resource.resourceType === 'Observation',
    )
    expect(observation?.identifier).toEqual([
      { system: 'https://example.org/mobile-output', value: 'output-1' },
      {
        system: 'https://example.org/google-health/records',
        value: 'source-heart-rate',
      },
    ])
  })

  it('uses urn:uuid references for every graph-internal edge', () => {
    const result = buildMobileBundle(baseInput(heartRateMeasurement))
    const graph = resources(result)
    const observation = graph.find(
      (resource) => resource.resourceType === 'Observation',
    )
    const provenance = graph.find(
      (resource) => resource.resourceType === 'Provenance',
    )
    expect(observation?.extension?.[0]).toEqual({
      url: 'http://hl7.org/fhir/StructureDefinition/observation-gatewayDevice',
      valueReference: { reference: application.identity.fullUrl },
    })
    expect(provenance?.target[0]?.reference).toBe(
      baseInput(heartRateMeasurement).observation.fullUrl,
    )
  })

  it('attaches the complete business identifier to every Bundle entry', () => {
    const result = buildMobileBundle(baseInput(heartRateMeasurement))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    for (const entry of result.value.entry) {
      expect(entry.extension).toHaveLength(1)
      const extension = entry.extension?.[0]
      expect(extension?.url).toBe(
        groveFhirExchangeIdentity.entryIdentifierExtension,
      )
      expect(typeof extension?.valueIdentifier?.system).toBe('string')
      expect(typeof extension?.valueIdentifier?.value).toBe('string')
    }
  })

  it('uses the normative sleep-stage vocabulary as a CodeableConcept', () => {
    const result = buildMobileBundle(
      baseInput({
        kind: 'sleep-stage',
        stage: 'deep',
        sourceStageCoding: {
          system: uri('https://example.org/health-connect/sleep-stage'),
          code: 'AWAKE_IN_BED',
        },
        effective: { kind: 'period', start, end },
      }),
    )
    const observation = resources(result).find(
      (resource) => resource.resourceType === 'Observation',
    )
    expect(observation?.valueCodeableConcept?.coding).toEqual([
      {
        system:
          'https://grovealliance.org/fhir/mobile/CodeSystem/grove-sleep-stage',
        code: 'deep',
      },
      {
        system: 'https://example.org/health-connect/sleep-stage',
        code: 'AWAKE_IN_BED',
      },
    ])
  })

  it('rejects a connected record without a DataOrigin application', () => {
    const input = baseInput(heartRateMeasurement)
    const result = buildMobileBundle({
      ...input,
      source: {
        adapter: { kind: 'connected-health', provider: 'google-health' },
        identifier: input.source.identifier,
        display: 'Synthetic record without DataOrigin',
      },
    } as unknown as MobileBundleInput)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ['source', 'dataOrigin'] }),
      ]),
    )
  })

  it('rejects duplicate graph fullUrls', () => {
    const input = baseInput(heartRateMeasurement)
    const result = buildMobileBundle({
      ...input,
      provenance: {
        ...input.provenance,
        fullUrl: input.observation.fullUrl,
      },
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'duplicate-identifier' }),
      ]),
    )
  })

  it('rejects a caller-supplied fullUrl that does not match its identifier', () => {
    const input = baseInput(heartRateMeasurement)
    const result = buildMobileBundle({
      ...input,
      observation: {
        ...input.observation,
        fullUrl: input.provenance.fullUrl,
      },
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'value-mismatch' }),
      ]),
    )
  })

  it('rejects invalid values before constructing FHIR', () => {
    const result = buildMobileBundle(
      baseInput({
        kind: 'oxygen-saturation',
        value: 101,
        effective: { kind: 'date-time', value: dateTime },
      }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'out-of-range' }),
      ]),
    )
  })

  it('rejects a zero-length aggregation Period', () => {
    const result = buildMobileBundle(
      baseInput({
        kind: 'step-count',
        value: 0,
        effective: { kind: 'period', start, end: start },
      }),
    )
    expect(result.ok).toBe(false)
  })
})

describe('Exchange entry identity', () => {
  it.each(groveFhirExchangeIdentity.vectors)(
    'matches the IG $case vector',
    (vector) => {
      const result = deriveEntryFullUrl({
        system: uri(vector.system),
        value: vector.value,
      })
      expect(result).toEqual({ ok: true, value: vector.fullUrl })
    },
  )

  it('rejects isolated UTF-16 surrogates before UUID derivation', () => {
    const result = deriveEntryFullUrl({
      system: uri('https://example.org/identifiers'),
      value: 'invalid-\ud800',
    })
    expect(result.ok).toBe(false)
  })
})

describe('Provider-neutral normalization contract', () => {
  it.each([
    'google-health-active-energy.json',
    'google-health-capillary-glucose.json',
    'oura-sleep-duration.json',
    'withings-body-weight.json',
  ])('accepts the synthetic %s fixture', (name) => {
    const fixture: unknown = JSON.parse(
      readFileSync(new URL(`../fixtures/normalized/${name}`, import.meta.url), {
        encoding: 'utf8',
      }),
    ) as unknown
    expect(parseNormalizedProviderMeasurement(fixture).ok).toBe(true)
  })

  it('rejects raw vendor response fields instead of silently stripping them', () => {
    const fixture = {
      source: {
        adapter: { kind: 'connected-health', provider: 'oura' },
        identifier: {
          system: 'https://example.org/oura/records',
          value: 'record-1',
        },
        dataOrigin,
      },
      measurement: heartRateMeasurement,
      rawVendorResponse: { readiness: 97 },
    }
    expect(parseNormalizedProviderMeasurement(fixture).ok).toBe(false)
  })
})

describe('Mobile builder properties', () => {
  it('preserves every finite positive heart-rate value without hidden defaults', () => {
    assert(
      property(
        double({
          min: 0.01,
          max: 400,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        (value) => {
          const result = buildMobileBundle(
            baseInput({
              kind: 'heart-rate',
              value,
              effective: { kind: 'date-time', value: dateTime },
            }),
          )
          expect(result.ok).toBe(true)
          if (!result.ok) return
          const observation = resources(result).find(
            (resource) => resource.resourceType === 'Observation',
          )
          expect(observation?.valueQuantity?.value).toBe(value)
          expect(observation?.issued).toBe('2026-08-20T12:01:00Z')
        },
      ),
    )
  })

  it('rejects every oxygen saturation outside the closed percentage range', () => {
    assert(
      property(
        oneof(
          double({ min: -10_000, max: -Number.MIN_VALUE, noNaN: true }),
          double({ min: 100.000_001, max: 10_000, noNaN: true }),
        ),
        (value) => {
          const result = buildMobileBundle(
            baseInput({
              kind: 'oxygen-saturation',
              value,
              effective: { kind: 'date-time', value: dateTime },
            }),
          )
          expect(result.ok).toBe(false)
        },
      ),
    )
  })
})
