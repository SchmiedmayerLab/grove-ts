//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  bloodPressureMeasurement,
  context,
  dailyEnd,
  dateTime,
  end,
  instant,
  mutableRecord,
  observationOf,
  record,
  resources,
  scalarCases,
  start,
  unwrap,
} from './provider-test-support.js'
import {
  parseFhirId,
  parseExchangeGraph,
  type ExchangeGraph,
} from '../src/index.js'
import {
  sharedMobileMeasurementCatalog,
  type MobileMeasurement,
} from '../src/mobile/index.js'
import {
  adapterMeasurementCatalog,
  buildProviderExchangeGraph,
  providerAdapterCatalog,
  providerRecordEffectiveRules,
  providerScalarOutputDiscriminators,
  providerScalarOutputRoles,
  type ConnectedProvider,
  type NormalizedProviderRecord,
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

const observationMutator =
  (built: ExchangeGraph) =>
  (mutate: (observation: Record<string, unknown>) => void) => {
    const bundle = structuredClone(built)
    mutate(observationOf(bundle))
    return parseExchangeGraph(bundle)
  }

const withMeasurements = (
  base: NormalizedProviderRecord,
  measurements: readonly unknown[],
): NormalizedProviderRecord =>
  ({ ...base, measurements }) as NormalizedProviderRecord

describe('Provider R4 graph builder', () => {
  it.each(scalarCases)(
    'builds the admitted $provider/$sourceType $measurement.kind graph',
    ({ provider, sourceType, measurement }) => {
      const result = buildProviderExchangeGraph(
        record(provider, sourceType, measurement),
        context(provider),
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.value.graph.type).toBe('collection')
      expect(result.value.graph.entry).toHaveLength(5)
      expect('total' in result.value.graph).toBe(false)
      expect(Object.isFrozen(result.value.graph)).toBe(true)
      expect(result.value.warnings).toEqual([])

      const observation = observationOf(result.value.graph)
      expect(observation.meta?.profile).toEqual([
        `https://grovealliance.org/fhir/mobile/StructureDefinition/${sharedMobileMeasurementCatalog[measurement.kind].profile}`,
        providerContractRow(provider).observationProfile,
      ])
      expect(observation.extension).toEqual(
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
        observation.extension?.some(({ url }) =>
          url?.endsWith('observation-gatewayDevice'),
        ),
      ).toBe(false)
      expect(observation.code.coding).toHaveLength(1)
      expect(observation.id).toBeUndefined()
      expect(observation.subject).toEqual({
        type: 'Patient',
        identifier: context().subject.identifier,
      })
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
      const result = buildProviderExchangeGraph(
        record(
          provider,
          sourceType,
          measurement as unknown as MobileMeasurement,
        ),
        context(provider),
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const observation = observationOf(result.value.graph)
      expect(observation.meta?.profile).toEqual([
        semanticProfile,
        providerContractRow(provider).observationProfile,
      ])
      expect(observation.code.coding).toEqual([
        expect.objectContaining({ code }),
      ])
      expect(observation.valueQuantity).toEqual(
        expect.objectContaining({
          system: 'http://unitsofmeasure.org',
          code: 'a',
        }),
      )
    },
  )

  it('rejects generic-parent, cross-vendor, cross-marker, and cross-owner Provider claims', () => {
    const built = unwrap(
      buildProviderExchangeGraph(
        record('withings', 'getmeas:11', {
          kind: 'heart-rate',
          value: 64,
          effective: { kind: 'date-time', value: dateTime },
        }),
        context(),
      ),
    ).graph
    const mutateObservation = observationMutator(built)
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
    expect(
      buildProviderExchangeGraph(
        record('oura', 'daily_cardiovascular_age', {
          kind: 'withings-vascular-age',
          value: 45,
          effective: { kind: 'date-time', value: dateTime },
        } as unknown as MobileMeasurement),
        context('oura'),
      ),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'mobile-input.unsupported-source-value' }],
    })
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
            buildProviderExchangeGraph(
              record(
                provider as ConnectedProvider,
                sourceType,
                sourceMeasurement as MobileMeasurement,
              ),
              context(provider as ConnectedProvider),
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
      buildProviderExchangeGraph(
        record('google-health-api', 'active-energy-burned', {
          kind: 'active-energy',
          value: 0,
          effective: { kind: 'period', start, end: start },
        }),
        context('google-health-api'),
      ).ok,
    ).toBe(true)
    expect(
      buildProviderExchangeGraph(
        record('withings', 'getmeas:9+10', {
          kind: 'blood-pressure',
          systolic: 0,
          diastolic: 0,
          effective: { kind: 'date-time', value: dateTime },
        }),
        context(),
      ).ok,
    ).toBe(true)
  })

  it('rejects negative and zero-duration step-count resources at the profiled graph boundary', () => {
    const built = unwrap(
      buildProviderExchangeGraph(
        record('google-health-api', 'steps', {
          kind: 'step-count',
          value: 42,
          effective: { kind: 'period', start, end },
        }),
        context('google-health-api'),
      ),
    ).graph
    const mutateObservation = observationMutator(built)
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
    const base = record('oura', 'daily_activity', {
      kind: 'distance',
      value: 6_123,
      effective: { kind: 'period', start, end: dailyEnd },
    })
    const result = buildProviderExchangeGraph(
      withMeasurements(base, [
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
      ]),
      context('oura'),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const observations = result.value.graph.entry.filter(
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
    expect(result.value.identifiers.outputs).toHaveLength(3)
    const provenance = resources(result.value.graph).find(
      (resource) => resource.resourceType === 'Provenance',
    )
    if (provenance?.resourceType !== 'Provenance')
      throw new Error('No Provenance.')
    expect(provenance.target).toHaveLength(observations.length)
    expect(
      new Set(provenance.target.map(({ reference }) => reference)),
    ).toEqual(new Set(observations.map(({ fullUrl }) => fullUrl)))
    expect(provenance.occurredPeriod).toEqual(
      observations[0]?.resource.resourceType === 'Observation' ?
        observations[0].resource.effectivePeriod
      : undefined,
    )
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
      const result = buildProviderExchangeGraph(
        withMeasurements(
          record('oura', 'daily_activity', candidates[kinds[0]]),
          kinds.map((kind) => candidates[kind]),
        ),
        context('oura'),
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(
        result.value.graph.entry.filter(
          ({ resource }) => resource.resourceType === 'Observation',
        ),
      ).toHaveLength(kinds.length)
    },
  )

  it('requires every catalogued daily source to use one shared complete civil-day Period', () => {
    const base = record('oura', 'daily_activity', {
      kind: 'step-count',
      value: 8_234,
      effective: { kind: 'period', start, end: dailyEnd },
    })
    expect(
      buildProviderExchangeGraph(
        withMeasurements(base, [
          {
            kind: 'step-count',
            value: 8_234,
            effective: { kind: 'period', start, end },
          },
        ]),
        context('oura'),
      ),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'mobile-input.effective-period-invalid' }],
    })
    expect(
      buildProviderExchangeGraph(
        withMeasurements(base, [
          base.measurements[0],
          {
            kind: 'distance',
            value: 6_123,
            effective: {
              kind: 'period',
              start,
              end: instant('2026-08-22T00:00:00Z'),
            },
          },
        ]),
        context('oura'),
      ),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'mobile-input.effective-period-invalid' }],
    })
    expect(
      buildProviderExchangeGraph(
        record('withings', 'getactivity:steps', {
          kind: 'step-count',
          value: 8_234,
          effective: { kind: 'period', start, end },
        }),
        context(),
      ).ok,
    ).toBe(false)
    expect(
      buildProviderExchangeGraph(
        record('withings', 'getactivity:steps', {
          kind: 'step-count',
          value: 8_234,
          effective: {
            kind: 'period',
            start: instant('2026-11-01T00:00:00-07:00'),
            end: instant('2026-11-02T00:00:00-08:00'),
          },
        }),
        context(),
      ).ok,
    ).toBe(true)
  })

  it('refuses duplicate, unsupported, invalid, and misplaced repository ids before constructing a partial graph', () => {
    const base = record('oura', 'daily_activity', {
      kind: 'step-count',
      value: 8_234,
      effective: { kind: 'period', start, end: dailyEnd },
    })
    expect(
      buildProviderExchangeGraph(withMeasurements(base, []), context('oura')),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'mobile-input.value-shape-invalid' }],
    })
    expect(
      buildProviderExchangeGraph(
        withMeasurements(base, [base.measurements[0], base.measurements[0]]),
        context('oura'),
      ),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'mobile-input.value-shape-invalid' }],
    })
    expect(
      buildProviderExchangeGraph(
        withMeasurements(base, [
          base.measurements[0],
          {
            kind: 'body-weight',
            value: 72,
            effective: { kind: 'date-time', value: dateTime },
          },
        ]),
        context('oura'),
      ),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'mobile-input.unsupported-source-value' }],
    })
    expect(
      buildProviderExchangeGraph(
        withMeasurements(base, [
          {
            kind: 'step-count',
            value: -1,
            effective: { kind: 'period', start, end: dailyEnd },
          },
        ]),
        context('oura'),
      ),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'mobile-input.value-outside-domain' }],
    })
    expect(
      buildProviderExchangeGraph(
        withMeasurements(base, [
          base.measurements[0],
          {
            kind: 'distance',
            value: 6_123,
            effective: { kind: 'period', start, end: dailyEnd },
          },
        ]),
        context('oura', '1', {
          repositoryIds: { 'primary-output': unwrap(parseFhirId('not-sole')) },
        }),
      ),
    ).toMatchObject({
      ok: false,
      issues: [
        { code: 'value-mismatch', path: ['repositoryIds', 'primary-output'] },
      ],
    })
  })
})
