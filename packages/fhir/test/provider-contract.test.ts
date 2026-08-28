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
  baseInput,
  dateTime,
  end,
  heartRateMeasurement,
  resources,
  resourceIdentity,
  start,
  unwrap,
  uri,
} from './provider-test-support.js'
import { parseGroveMobileExchangeBundle } from '../src/index.js'
import {
  createEntryIdentity,
  deriveEntryFullUrl,
  entryIdentifierName,
  groveExchangeProtocol,
} from '../src/mobile/index.js'
import {
  buildProviderMeasurementBundle,
  parseNormalizedProviderRecord,
  parseProviderMeasurementBundleInput,
  providerAdapterCatalog,
  providerRawOutputDiscriminators,
  providerRawOutputRoles,
  providerScalarOutputDiscriminators,
  providerScalarOutputRoles,
  type ConnectedProviderRecord,
  type ProviderMeasurementBundleInput,
} from '../src/providers/index.js'

describe('Exchange entry identity', () => {
  it.each(groveExchangeProtocol.testVectors.fullUrls)(
    'matches the protocol $id vector',
    (vector) => {
      const derived = deriveEntryFullUrl({
        system: uri(vector.system),
        value: vector.value,
      })
      expect(derived).toEqual({ ok: true, value: vector.fullUrl })
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
      buildProviderMeasurementBundle(
        baseInput('withings', 'getmeas:6', {
          kind: 'body-fat-percentage',
          value: 0,
          effective: { kind: 'date-time', value: dateTime },
        }),
      ),
    )
    const tampered = structuredClone(valid)
    const observation = tampered.entry.find(
      ({ resource }) => resource.resourceType === 'Observation',
    )?.resource
    if (observation?.resourceType !== 'Observation') {
      throw new Error('Expected a body-fat Observation.')
    }
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
              valueQuantity: {
                ...observation.valueQuantity,
                value: 100.1,
              },
            },
          }
        : entry,
      ),
    }
    const parsed = parseGroveMobileExchangeBundle(invalidBundle)
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      expect(
        parsed.issues.some(({ message }) =>
          message.includes('mobile-body-fat-percentage.value-domain'),
        ),
      ).toBe(true)
    }
  })

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
      entryIdentifierName({
        system: '/relative' as never,
        value: 'record-1',
      }).ok,
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

  it('requires the provider-dependent scope assurance declared by the catalog', () => {
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
        providerScopeIdentifier: Record<string, unknown>
      }
    }
    const { system, value } = fixture.source.providerScopeIdentifier
    expect(
      parseNormalizedProviderRecord({
        ...fixture,
        source: {
          ...fixture.source,
          providerScopeIdentifier: { system, value },
        },
      }).ok,
    ).toBe(false)

    expect(
      parseNormalizedProviderRecord({
        ...fixture,
        source: {
          ...fixture.source,
          providerScopeIdentifier: {
            ...fixture.source.providerScopeIdentifier,
            assurance: 'deployment-scoped-account-pseudonym',
          },
        },
      }).ok,
    ).toBe(false)

    const accountScoped = baseInput(
      'withings',
      'getmeas:11',
      heartRateMeasurement,
    )
    expect(
      parseNormalizedProviderRecord({
        source: {
          ...accountScoped.source,
          providerScopeIdentifier: {
            system: 'https://example.org/provider-key-spaces',
            value: 'withings-global',
            assurance: 'documented-global-key-space',
          },
        },
        measurements: accountScoped.measurements,
      }).ok,
    ).toBe(false)
  })

  it('strictly parses the complete graph input and preserves identity strings verbatim', () => {
    const input = baseInput('withings', 'getmeas:11', heartRateMeasurement)
    const result = parseProviderMeasurementBundleInput({
      ...input,
      source: {
        ...input.source,
        providerScopeIdentifier: {
          ...input.source.providerScopeIdentifier,
          value: ' pseudonym-with-significant-spaces ',
        },
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.source.providerScopeIdentifier.value).toBe(
      ' pseudonym-with-significant-spaces ',
    )

    expect(
      buildProviderMeasurementBundle({
        ...input,
        rawVendorResponse: { heart_rate: 64 },
      } as ProviderMeasurementBundleInput & {
        rawVendorResponse: unknown
      }).ok,
    ).toBe(false)
    expect(
      buildProviderMeasurementBundle({
        ...input,
        source: {
          ...input.source,
          rawVendorResponse: { heart_rate: 64 },
        },
      } as unknown as ProviderMeasurementBundleInput).ok,
    ).toBe(false)
  })

  it('rejects an arbitrary adapter and a mismatched source token', () => {
    const dataOrigin = {
      sourceDeviceToken: 'oura',
      name: 'Oura',
    }
    expect(
      parseNormalizedProviderRecord({
        source: {
          adapter: { kind: 'mobile', provider: 'oura' },
          providerScopeIdentifier: {
            system: 'https://example.org/provider-key-spaces',
            value: 'oura-document-uuid-global',
            assurance: 'documented-global-key-space',
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
          adapter: { kind: 'providers', provider: 'oura' },
          providerScopeIdentifier: {
            system: 'https://example.org/provider-key-spaces',
            value: 'oura-document-uuid-global',
            assurance: 'documented-global-key-space',
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
      adapter: { kind: 'providers', provider: 'withings' },
      providerScopeIdentifier: {
        system: uri('https://example.org/deployments/provider-accounts'),
        value: 'pseudonym-withings-001',
        assurance: 'deployment-scoped-account-pseudonym',
      },
      sourceType: 'getmeas:11',
      sourceNativeId: 'heart-rate-1',
      dataOrigin: {
        sourceDeviceToken: 'withings',
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
      adapter: { kind: 'providers', provider: 'oura' },
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
})

describe('Provider builder properties', () => {
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
          const result = buildProviderMeasurementBundle(
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
            buildProviderMeasurementBundle(
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
