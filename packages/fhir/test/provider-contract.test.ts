//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { readFileSync } from 'node:fs'
import { assert, double, oneof, property } from 'fast-check'
import {
  context,
  dateTime,
  heartRateMeasurement,
  observationOf,
  record,
  start,
  unwrap,
  uri,
} from './provider-test-support.js'
import { parseExchangeGraph } from '../src/index.js'
import {
  createEntryIdentity,
  deriveEntryFullUrl,
  entryIdentifierName,
  groveExchangeProtocol,
} from '../src/mobile/index.js'
import {
  buildProviderExchangeGraph,
  buildProviderExchangeGraphs,
  parseNormalizedProviderRecord,
  providerAdapterCatalog,
  providerRawOutputDiscriminators,
  providerRawOutputRoles,
  providerScalarOutputDiscriminators,
  providerScalarOutputRoles,
  type ConnectedProviderRecord,
  type NormalizedProviderRecord,
} from '../src/providers/index.js'

const normalized = (name: string): NormalizedProviderRecord =>
  JSON.parse(
    readFileSync(
      new URL(`../fixtures/normalized/${name}`, import.meta.url),
      'utf8',
    ),
  ) as NormalizedProviderRecord

describe('Exchange entry identity', () => {
  it.each(groveExchangeProtocol.testVectors.fullUrls)(
    'matches the protocol $id vector',
    (vector) => {
      expect(
        deriveEntryFullUrl({ system: uri(vector.system), value: vector.value }),
      ).toEqual({ ok: true, value: vector.fullUrl })
    },
  )

  it('length framing admits separators without collisions', () => {
    expect(
      deriveEntryFullUrl({
        system: uri('https://example.org/a;b'),
        value: 'x|y',
      }).ok,
    ).toBe(true)
  })

  it('rejects emitted quantities outside their catalog-owned domains', () => {
    const valid = unwrap(
      buildProviderExchangeGraph(
        record('withings', 'getmeas:6', {
          kind: 'body-fat-percentage',
          value: 0,
          effective: { kind: 'date-time', value: dateTime },
        }),
        context(),
      ),
    ).graph
    const tampered = structuredClone(valid)
    const observation = observationOf(tampered)
    if (observation.valueQuantity === undefined) {
      throw new Error('Expected a body-fat Quantity result.')
    }
    const invalidBundle = {
      ...tampered,
      entry: tampered.entry.map((entry) =>
        entry.resource === observation ?
          {
            ...entry,
            resource: {
              ...observation,
              valueQuantity: { ...observation.valueQuantity, value: 100.1 },
            },
          }
        : entry,
      ),
    }
    const parsed = parseExchangeGraph(invalidBundle)
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      expect(parsed.issues.map(({ code }) => code)).toContain(
        'mobile-output.quantity-value-domain',
      )
    }
  })

  it('rejects isolated UTF-16 surrogates before UUID derivation', () => {
    const system = uri('https://example.org/identifiers')
    expect(deriveEntryFullUrl({ system, value: 'invalid-\ud800' }).ok).toBe(
      false,
    )
    expect(deriveEntryFullUrl({ system, value: 'invalid-\udc00' }).ok).toBe(
      false,
    )
    expect(deriveEntryFullUrl({ system, value: 'valid-😀' }).ok).toBe(true)
  })

  it('rejects incomplete entry identifiers and invalid repository ids', () => {
    expect(
      entryIdentifierName({ system: '/relative' as never, value: 'record-1' })
        .ok,
    ).toBe(false)
    expect(
      entryIdentifierName({
        system: uri('https://example.org/identifiers'),
        value: '',
      }).ok,
    ).toBe(false)
    expect(
      entryIdentifierName({
        system: uri('https://example.org/identifiers'),
        value: ' \t\n ',
      }).ok,
    ).toBe(true)
    expect(
      createEntryIdentity(
        {
          system: uri('https://example.org/identifiers'),
          value: 'record-1',
          role: 'source-output',
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
    const fixture = normalized(name)
    expect(parseNormalizedProviderRecord(fixture).ok).toBe(true)
    expect(
      buildProviderExchangeGraph(
        fixture,
        context(fixture.source.adapter.provider),
      ).ok,
    ).toBe(true)
  })

  it('normalizes multi-output serialization order without mutating caller data', () => {
    const fixture = normalized('oura-daily-activity.json')
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

  it('refuses raw response fields rather than silently stripping them', () => {
    expect(
      parseNormalizedProviderRecord({
        ...normalized('oura-sleep-duration.json'),
        rawVendorResponse: { readiness: 97 },
      }),
    ).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'mobile-input.value-shape-invalid',
          path: ['rawVendorResponse'],
        },
      ],
    })
  })

  it('preserves identity strings verbatim and refuses a mismatched source token', () => {
    const spaced = record('withings', 'getmeas:11', heartRateMeasurement)
    const result = parseNormalizedProviderRecord({
      ...spaced,
      source: {
        ...spaced.source,
        sourceNativeId: ' record-with-significant-spaces ',
      },
    })
    expect(result.ok && result.value.source.sourceNativeId).toBe(
      ' record-with-significant-spaces ',
    )

    expect(
      parseNormalizedProviderRecord(
        record('oura', 'daily_readiness', heartRateMeasurement),
      ),
    ).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'mobile-input.unsupported-source-value',
          path: ['measurements', 0, 'kind'],
        },
      ],
    })
    expect(
      parseNormalizedProviderRecord({
        ...spaced,
        source: {
          ...spaced.source,
          adapter: { kind: 'mobile', provider: 'withings' },
        },
      }),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'mobile-input.value-shape-invalid' }],
    })
    expect(
      parseNormalizedProviderRecord({
        ...spaced,
        source: { ...spaced.source, sourceType: 'invented' },
      }),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'mobile-input.unsupported-source-type' }],
    })
  })

  it('correlates provider, source token, and measurement at compile time', () => {
    const withingsSource = {
      adapter: { kind: 'providers', provider: 'withings' },
      sourceType: 'getmeas:11',
      sourceNativeId: 'heart-rate-1',
      writer: { sourceDeviceToken: 'withings', name: 'Withings' },
    } as const
    const valid: ConnectedProviderRecord<'withings', 'getmeas:11'> = {
      source: withingsSource,
      measurements: [heartRateMeasurement],
    }
    expect(valid.measurements[0].kind).toBe('heart-rate')

    type OuraSleep = ConnectedProviderRecord<'oura', 'sleep'>
    const source = {
      ...withingsSource,
      adapter: { kind: 'providers', provider: 'oura' },
      sourceType: 'sleep',
    } as const
    const invalidMeasurement = {
      kind: 'blood-glucose',
      value: 95,
      effective: { kind: 'date-time', value: dateTime },
    }
    // @ts-expect-error Oura sleep admits sleep-duration, never glucose.
    const invalid: OuraSleep = { source, measurements: [invalidMeasurement] }
    expect(invalid).toBeDefined()
  })

  it('generates only catalog-owned scalar source tokens', () => {
    expect(Object.hasOwn(providerScalarOutputRoles.withings, 'getmeas:9')).toBe(
      false,
    )
    expect(providerScalarOutputRoles.withings['getmeas:9+10']).toEqual({
      'blood-pressure': 'blood-pressure-panel',
    })
    expect(providerScalarOutputDiscriminators.withings['getmeas:9+10']).toEqual(
      {
        'blood-pressure': 'single',
      },
    )
  })

  it('keeps native-recording output role and discriminator as distinct coordinates', () => {
    expect(providerAdapterCatalog.recordingDocument).toMatchObject({
      outputRole: 'native-recording',
      outputDiscriminator: 'single',
    })
    expect(providerRawOutputRoles.withings.activityIntraday).toBe(
      'native-recording',
    )
    expect(providerRawOutputDiscriminators.withings.activityIntraday).toBe(
      'single',
    )
  })

  it('converts a batch under per-record contexts and keeps refusals beside conversions', () => {
    const records = [
      record('withings', 'getmeas:11', heartRateMeasurement),
      record('withings', 'getmeas:54', {
        kind: 'oxygen-saturation',
        value: 101,
        effective: { kind: 'date-time', value: dateTime },
      }),
      record('google-health-api', 'steps', {
        kind: 'step-count',
        value: 12,
        effective: { kind: 'period', start, end: dateTime },
      }),
    ]
    let sequence = 0
    const batch = buildProviderExchangeGraphs(records, (candidate) => {
      sequence += 1
      return context(candidate.source.adapter.provider, String(sequence))
    })
    expect(batch.conversions).toHaveLength(2)
    expect(batch.failures).toHaveLength(1)
    expect(batch.failures[0]?.record).toBe(records[1])
    expect(batch.failures[0]?.issues.map(({ code }) => code)).toEqual([
      'mobile-input.value-outside-domain',
    ])
    expect(
      new Set(batch.conversions.map(({ graph }) => graph.identifier.value))
        .size,
    ).toBe(2)
    expect(() =>
      buildProviderExchangeGraphs(records, () => {
        throw new Error('reservation failed')
      }),
    ).toThrow('reservation failed')
  })
})

describe('Provider builder properties', () => {
  it('preserves every finite positive heart-rate value', () => {
    assert(
      property(
        double({ min: 0.01, max: 400, noNaN: true, noDefaultInfinity: true }),
        (value) => {
          const result = buildProviderExchangeGraph(
            record('withings', 'getmeas:11', {
              kind: 'heart-rate',
              value,
              effective: { kind: 'date-time', value: dateTime },
            }),
            context(),
          )
          expect(result.ok).toBe(true)
          if (!result.ok) return
          expect(observationOf(result.value.graph).valueQuantity?.value).toBe(
            value,
          )
        },
      ),
    )
  })

  it('refuses every oxygen saturation outside the percentage range', () => {
    assert(
      property(
        oneof(
          double({ min: -10_000, max: -Number.MIN_VALUE, noNaN: true }),
          double({ min: 100.000_001, max: 10_000, noNaN: true }),
        ),
        (value) => {
          expect(
            buildProviderExchangeGraph(
              record('withings', 'getmeas:54', {
                kind: 'oxygen-saturation',
                value,
                effective: { kind: 'date-time', value: dateTime },
              }),
              context(),
            ),
          ).toMatchObject({
            ok: false,
            issues: [{ code: 'mobile-input.value-outside-domain' }],
          })
        },
      ),
    )
  })
})
