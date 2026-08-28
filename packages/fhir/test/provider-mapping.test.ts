//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  baseInput,
  bloodPressureMeasurement,
  dailyEnd,
  dateTime,
  end,
  instant,
  mutableRecord,
  resources,
  scalarCases,
  start,
  unwrap,
} from './provider-test-support.js'
import { parseFhirId, parseGroveMobileExchangeBundle } from '../src/index.js'
import {
  sharedMobileMeasurementCatalog,
  type MobileMeasurement,
} from '../src/mobile/index.js'
import {
  adapterMeasurementCatalog,
  buildProviderMeasurementBundle,
  providerAdapterCatalog,
  providerRecordEffectiveRules,
  providerScalarOutputDiscriminators,
  providerScalarOutputRoles,
  type ConnectedProvider,
  type ProviderMeasurementBundleInput,
} from '../src/providers/index.js'

interface ProviderContractRow {
  readonly id: ConnectedProvider
  readonly measurementOwner: keyof typeof adapterMeasurementCatalog
  readonly observationProfile: string
}

const providerContractRow = (provider: ConnectedProvider) => {
  const row = (
    providerAdapterCatalog.providers as unknown as readonly ProviderContractRow[]
  ).find(({ id }) => id === provider)
  if (row === undefined)
    throw new Error(`Missing Provider row for ${provider}.`)
  return row
}

describe('Provider R4 graph builder', () => {
  it.each(scalarCases)(
    'builds the admitted $provider/$sourceType $measurement.kind graph',
    ({ provider, sourceType, measurement }) => {
      const result = buildProviderMeasurementBundle(
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
        providerContractRow(provider).observationProfile,
      ])
      expect(observation?.extension).toEqual(
        expect.arrayContaining([
          {
            url: 'https://grovealliance.org/fhir/providers/StructureDefinition/provider',
            valueCode: provider,
          },
          {
            url: 'https://grovealliance.org/fhir/providers/StructureDefinition/provider-source-type',
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

  it.each([
    {
      provider: 'oura',
      sourceType: 'daily_cardiovascular_age',
      measurement: {
        kind: 'oura-cardiovascular-age',
        value: 38,
        effective: { kind: 'period', start, end: dailyEnd },
      },
      semanticProfile:
        'https://grovealliance.org/fhir/oura/StructureDefinition/oura-cardiovascular-age',
      code: 'oura-cardiovascular-age',
    },
    {
      provider: 'withings',
      sourceType: 'getmeas:155',
      measurement: {
        kind: 'withings-vascular-age',
        value: 45,
        effective: { kind: 'date-time', value: dateTime },
      },
      semanticProfile:
        'https://grovealliance.org/fhir/withings/StructureDefinition/withings-vascular-age',
      code: 'withings-vascular-age',
    },
  ] as const)(
    'emits $provider platform-exclusive age under its exact semantic and vendor profiles',
    ({ provider, sourceType, measurement, semanticProfile, code }) => {
      const result = buildProviderMeasurementBundle(
        baseInput(
          provider,
          sourceType,
          measurement as unknown as MobileMeasurement,
        ),
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const observation = resources(result).find(
        (resource) => resource.resourceType === 'Observation',
      )
      expect(observation?.meta?.profile).toEqual([
        semanticProfile,
        providerContractRow(provider).observationProfile,
      ])
      expect(observation?.code.coding).toEqual([
        expect.objectContaining({ code }),
      ])
      expect(observation?.valueQuantity).toEqual(
        expect.objectContaining({
          system: 'http://unitsofmeasure.org',
          code: 'a',
        }),
      )
    },
  )

  it('rejects generic-parent, cross-vendor, cross-marker, and cross-owner Provider claims', () => {
    const built = buildProviderMeasurementBundle(
      baseInput('withings', 'getmeas:11', {
        kind: 'heart-rate',
        value: 64,
        effective: { kind: 'date-time', value: dateTime },
      }),
    )
    expect(built.ok).toBe(true)
    if (!built.ok) return

    const mutateObservation = (
      mutate: (observation: Record<string, unknown>) => void,
    ) => {
      const bundle = structuredClone(built.value)
      const observation = bundle.entry.find(
        ({ resource }) => resource.resourceType === 'Observation',
      )?.resource
      if (observation?.resourceType !== 'Observation') {
        throw new Error('Expected a Provider Observation.')
      }
      mutate(observation)
      return parseGroveMobileExchangeBundle(bundle)
    }

    expect(
      mutateObservation((observation) => {
        mutableRecord(observation.meta, 'Observation.meta').profile = [
          'https://grovealliance.org/fhir/mobile/StructureDefinition/grove-mobile-heart-rate',
          providerAdapterCatalog.adapterProfile,
        ]
      }).ok,
    ).toBe(false)
    expect(
      mutateObservation((observation) => {
        mutableRecord(observation.meta, 'Observation.meta').profile = [
          'https://grovealliance.org/fhir/mobile/StructureDefinition/grove-mobile-heart-rate',
          providerContractRow('oura').observationProfile,
        ]
      }).ok,
    ).toBe(false)
    expect(
      mutateObservation((observation) => {
        const extensions = observation.extension
        if (!Array.isArray(extensions)) throw new Error('Missing extensions.')
        const marker: unknown = extensions.find(
          (extension) =>
            mutableRecord(extension, 'Observation.extension').url ===
            providerAdapterCatalog.providerExtension.url,
        )
        mutableRecord(marker, 'Provider marker').valueCode = 'oura'
      }).ok,
    ).toBe(false)

    const crossOwner = baseInput('oura', 'daily_cardiovascular_age', {
      kind: 'oura-cardiovascular-age',
      value: 38,
      effective: { kind: 'period', start, end: dailyEnd },
    } as unknown as MobileMeasurement)
    expect(
      buildProviderMeasurementBundle({
        ...crossOwner,
        measurements: [
          {
            kind: 'withings-vascular-age',
            value: 45,
            effective: { kind: 'date-time', value: dateTime },
          },
        ],
      } as unknown as ProviderMeasurementBundleInput).ok,
    ).toBe(false)
  })

  it('builds every exact provider/source/measurement mapping in the generated catalog', () => {
    interface ExampleDefinition {
      readonly effective: 'Period' | 'dateTime' | 'dateTime-or-Period'
      readonly allowedValues?: readonly string[]
      readonly quantity?: { readonly example?: number } | null
    }
    const sharedDefinitions =
      sharedMobileMeasurementCatalog as unknown as Readonly<
        Record<string, ExampleDefinition>
      >
    const ownerDefinitions = adapterMeasurementCatalog as unknown as Readonly<
      Record<string, Readonly<Record<string, ExampleDefinition>>>
    >
    const exampleMeasurement = (
      provider: ConnectedProvider,
      kind: string,
    ): MobileMeasurement | undefined => {
      if (kind === 'blood-pressure') return bloodPressureMeasurement
      if (kind === 'sleep-stage') {
        return {
          kind: 'sleep-stage',
          stage: 'light',
          effective: { kind: 'period', start, end },
        }
      }
      const row = providerContractRow(provider)
      const definition =
        sharedDefinitions[kind] ??
        ownerDefinitions[row.measurementOwner]?.[kind]
      if (definition === undefined) return undefined
      const effective =
        definition.effective === 'Period' ?
          ({ kind: 'period', start, end } as const)
        : ({ kind: 'date-time', value: dateTime } as const)
      const value =
        definition.allowedValues?.[0] ?? definition.quantity?.example ?? 72
      return { kind, value, effective } as MobileMeasurement
    }
    const exhaustiveMappings = providerScalarOutputRoles as Readonly<
      Record<
        ConnectedProvider,
        Readonly<Record<string, Readonly<Record<string, string>>>>
      >
    >
    const exhaustiveDiscriminators =
      providerScalarOutputDiscriminators as Readonly<
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
        const discriminatorMappings =
          exhaustiveDiscriminators[provider as ConnectedProvider][sourceType]
        expect(discriminatorMappings).toBeDefined()
        if (discriminatorMappings === undefined) {
          throw new Error(
            `Missing output discriminators for ${provider}/${sourceType}.`,
          )
        }
        for (const measurementKind of Object.keys(mappings)) {
          expect(discriminatorMappings[measurementKind]).toBeDefined()
          const measurement = exampleMeasurement(
            provider as ConnectedProvider,
            measurementKind,
          )
          expect(measurement).toBeDefined()
          if (measurement === undefined) continue
          const effectiveRule = (
            providerRecordEffectiveRules as Readonly<
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
            buildProviderMeasurementBundle(
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

  it('does not invent uncatalogued physiologic or duration lower bounds', () => {
    expect(
      buildProviderMeasurementBundle(
        baseInput('google-health-api', 'active-energy-burned', {
          kind: 'active-energy',
          value: 0,
          effective: { kind: 'period', start, end: start },
        }),
      ).ok,
    ).toBe(true)
    expect(
      buildProviderMeasurementBundle(
        baseInput('withings', 'getmeas:9+10', {
          kind: 'blood-pressure',
          systolic: 0,
          diastolic: 0,
          effective: { kind: 'date-time', value: dateTime },
        }),
      ).ok,
    ).toBe(true)
  })

  it('rejects negative and zero-duration step-count resources at the profiled graph boundary', () => {
    const built = buildProviderMeasurementBundle(
      baseInput('google-health-api', 'steps', {
        kind: 'step-count',
        value: 42,
        effective: { kind: 'period', start, end },
      }),
    )
    expect(built.ok).toBe(true)
    if (!built.ok) return

    const mutateObservation = (
      mutate: (observation: Record<string, unknown>) => void,
    ) => {
      const bundle = structuredClone(built.value)
      const observation = bundle.entry.find(
        ({ resource }) => resource.resourceType === 'Observation',
      )?.resource
      if (observation?.resourceType !== 'Observation') {
        throw new Error('Expected a step-count Observation.')
      }
      mutate(observation)
      return parseGroveMobileExchangeBundle(bundle)
    }

    expect(
      mutateObservation((observation) => {
        mutableRecord(
          observation.valueQuantity,
          'Observation.valueQuantity',
        ).value = -1
      }).ok,
    ).toBe(false)
    expect(
      mutateObservation((observation) => {
        const period = mutableRecord(
          observation.effectivePeriod,
          'Observation.effectivePeriod',
        )
        period.end = period.start
      }).ok,
    ).toBe(false)
  })

  it('atomically builds every present Oura daily-activity output with one complete Provenance target set', () => {
    const dailyActivity = baseInput('oura', 'daily_activity', {
      kind: 'distance',
      value: 6_123,
      effective: { kind: 'period', start, end: dailyEnd },
    })
    const result = buildProviderMeasurementBundle({
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
    } as ProviderMeasurementBundleInput)
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
      const result = buildProviderMeasurementBundle({
        ...input,
        measurements: kinds.map((kind) => candidates[kind]),
      } as unknown as ProviderMeasurementBundleInput)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(
        result.value.entry.filter(
          ({ resource }) => resource.resourceType === 'Observation',
        ),
      ).toHaveLength(kinds.length)
    },
  )

  it('requires every catalogued daily source to use one shared complete civil-day Period', () => {
    const input = baseInput('oura', 'daily_activity', {
      kind: 'step-count',
      value: 8_234,
      effective: { kind: 'period', start, end: dailyEnd },
    })
    expect(
      buildProviderMeasurementBundle({
        ...input,
        measurements: [
          {
            kind: 'step-count',
            value: 8_234,
            effective: { kind: 'period', start, end },
          },
        ],
      } as unknown as ProviderMeasurementBundleInput).ok,
    ).toBe(false)
    expect(
      buildProviderMeasurementBundle({
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
      } as unknown as ProviderMeasurementBundleInput).ok,
    ).toBe(false)
    expect(
      buildProviderMeasurementBundle(
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
      buildProviderMeasurementBundle(
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
      buildProviderMeasurementBundle({
        ...input,
        measurements: [],
      } as unknown as ProviderMeasurementBundleInput).ok,
    ).toBe(false)
    expect(
      buildProviderMeasurementBundle({
        ...input,
        measurements: [input.measurements[0], input.measurements[0]],
      } as ProviderMeasurementBundleInput).ok,
    ).toBe(false)
    expect(
      buildProviderMeasurementBundle({
        ...input,
        measurements: [
          input.measurements[0],
          {
            kind: 'body-weight',
            value: 72,
            effective: { kind: 'date-time', value: dateTime },
          },
        ],
      } as unknown as ProviderMeasurementBundleInput).ok,
    ).toBe(false)
    expect(
      buildProviderMeasurementBundle({
        ...input,
        measurements: [
          {
            kind: 'step-count',
            value: -1,
            effective: { kind: 'period', start, end: dailyEnd },
          },
        ],
      } as unknown as ProviderMeasurementBundleInput).ok,
    ).toBe(false)
    expect(
      buildProviderMeasurementBundle({
        ...input,
        repositoryIds: {
          observations: {
            distance: unwrap(parseFhirId('not-emitted')),
          },
        },
      }).ok,
    ).toBe(false)
  })
})
