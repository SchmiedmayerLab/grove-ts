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
  dateTime,
  deploymentIdentity,
  end,
  heartRateMeasurement,
  instant,
  resourceIdentity,
  resources,
  start,
  unwrap,
  uri,
} from './provider-test-support.js'
import { parseFhirId } from '../src/index.js'
import {
  canonicalizeMobileEffectiveInstant,
  deriveEntryFullUrl,
  mobileEffectiveCanonicalizationVectors,
  type MobileMeasurement,
} from '../src/mobile/index.js'
import { deriveProviderIdentities } from '../src/providers/identity.js'
import {
  buildProviderMeasurementBundle,
  parseNormalizedProviderRecord,
  parseProviderMeasurementBundleInput,
  providerOutputCoordinates,
  type ProviderMeasurementBundleInput,
} from '../src/providers/index.js'

describe('Provider R4 graph builder', () => {
  it('rounds Mobile effective instants before enforcing ordering and catalog-owned duration rules', () => {
    const collapsed = baseInput('oura', 'sleep', {
      kind: 'sleep-duration',
      value: 0.1,
      effective: {
        kind: 'period',
        start: instant('2026-08-20T12:00:00.0001Z'),
        end: instant('2026-08-20T12:00:00.0002Z'),
      },
    })
    expect(buildProviderMeasurementBundle(collapsed).ok).toBe(true)
    expect(
      buildProviderMeasurementBundle(
        baseInput('google-health-api', 'steps', {
          kind: 'step-count',
          value: 1,
          effective: {
            kind: 'period',
            start: instant('2026-08-20T12:00:00.0001Z'),
            end: instant('2026-08-20T12:00:00.0002Z'),
          },
        }),
      ).ok,
    ).toBe(false)

    const input = baseInput('oura', 'sleep', {
      kind: 'sleep-duration',
      value: 0.1,
      effective: {
        kind: 'period',
        start: instant('2026-08-20T12:00:00.0004Z'),
        end: instant('2026-08-20T12:00:00.0006Z'),
      },
    })
    const result = buildProviderMeasurementBundle(input)
    expect(result.ok).toBe(true)
    const observation = resources(result).find(
      (resource) => resource.resourceType === 'Observation',
    )
    expect(observation?.effectivePeriod).toEqual({
      start: '2026-08-20T12:00:00.000Z',
      end: '2026-08-20T12:00:00.001Z',
    })
    expect(
      buildProviderMeasurementBundle({
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
      } as ProviderMeasurementBundleInput).ok,
    ).toBe(false)
  })

  it('requires identifier-only typed logical subjects', () => {
    const input = baseInput('withings', 'getmeas:11', heartRateMeasurement)
    expect(
      parseProviderMeasurementBundleInput({
        ...input,
        subject: 'Patient/example',
      }).ok,
    ).toBe(false)
    expect(
      parseProviderMeasurementBundleInput({
        ...input,
        subject: { ...input.subject, reference: 'Patient/example' },
      }).ok,
    ).toBe(false)
    expect(
      parseProviderMeasurementBundleInput({
        ...input,
        subject: {
          type: 'Patient',
          identifier: {
            system: 'https://example.org/patient-pseudonyms',
            value: 'patient-example',
          },
        },
      }).ok,
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
    const parsed = parseProviderMeasurementBundleInput(input)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.measurements[0].effective).toEqual({
      kind: 'date-time',
      value: '2026-08-20T08:30:00.252-07:00',
    })

    const result = buildProviderMeasurementBundle(input)
    const observation = resources(result).find(
      (resource) => resource.resourceType === 'Observation',
    )
    expect(observation?.effectiveDateTime).toBe('2026-08-20T08:30:00.252-07:00')
  })

  it('derives every urn:uuid edge from a complete business identifier', () => {
    const result = buildProviderMeasurementBundle(
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
    const result = buildProviderMeasurementBundle(
      baseInput('withings', 'getmeas:9+10', bloodPressureMeasurement),
    )
    const observation = resources(result).find(
      (resource) => resource.resourceType === 'Observation',
    )
    expect(observation?.component).toHaveLength(2)
    expect(observation?.valueQuantity).toBeUndefined()
  })

  it('uses optional Resource.id values only when supplied by a repository', () => {
    const result = buildProviderMeasurementBundle({
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
    const result = buildProviderMeasurementBundle({
      ...input,
      application: {
        ...application,
        id: unwrap(parseFhirId('application-42')),
        name: application.name,
      },
      source: {
        adapter: input.source.adapter,
        providerScopeIdentifier: input.source.providerScopeIdentifier,
        sourceType: input.source.sourceType,
        sourceNativeId: input.source.sourceNativeId,
        dataOrigin: input.source.dataOrigin,
        recordingDevice: {
          stableUnitToken: 'minimal-device',
          subjectIdentifier: {
            system: uri('https://example.org/participants'),
            value: 'participant-pseudonym-001',
          },
          id: unwrap(parseFhirId('recording-device-42')),
          identityScope: 'deployment-scoped',
        },
      },
    } as ProviderMeasurementBundleInput)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const observation = resources(result).find(
      (resource) => resource.resourceType === 'Observation',
    )
    expect(observation?.extension).toEqual(
      expect.arrayContaining([
        {
          url: 'https://grovealliance.org/fhir/providers/StructureDefinition/provider-source-type',
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

  it('enforces only catalog-owned scalar value domains at the runtime boundary', () => {
    const input = baseInput('withings', 'getmeas:11', heartRateMeasurement)
    expect(
      parseProviderMeasurementBundleInput({
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
      parseProviderMeasurementBundleInput({
        ...input,
        measurements: [{ ...heartRateMeasurement, value: 0 }],
      }).ok,
    ).toBe(true)
    expect(
      parseProviderMeasurementBundleInput({
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
      parseProviderMeasurementBundleInput({
        ...baseInput('withings', 'getmeas:6', {
          kind: 'body-fat-percentage',
          value: 0,
          effective: { kind: 'date-time', value: dateTime },
        }),
        measurements: [
          {
            kind: 'body-fat-percentage',
            value: 100.1,
            effective: { kind: 'date-time', value: dateTime },
          },
        ],
      }).ok,
    ).toBe(false)
    expect(
      parseProviderMeasurementBundleInput(
        baseInput('withings', 'getmeas:6', {
          kind: 'body-fat-percentage',
          value: 0,
          effective: { kind: 'date-time', value: dateTime },
        }),
      ).ok,
    ).toBe(true)
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
    } as ProviderMeasurementBundleInput
    expect(parseProviderMeasurementBundleInput(invalid).ok).toBe(false)
    expect(buildProviderMeasurementBundle(invalid).ok).toBe(false)
  })

  it('rejects Unicode IRIs wherever provider inputs require an absolute URI', () => {
    const input = baseInput('withings', 'getmeas:11', heartRateMeasurement)
    expect(
      parseProviderMeasurementBundleInput({
        ...input,
        source: {
          ...input.source,
          providerScopeIdentifier: {
            ...input.source.providerScopeIdentifier,
            system: 'https://例え.example/provider-accounts',
          },
        },
      }).ok,
    ).toBe(false)
    expect(
      parseProviderMeasurementBundleInput({
        ...input,
        deploymentIdentity: {
          ...input.deploymentIdentity,
          eventIdentifierSystem: 'https://例え.example/events',
        },
      }).ok,
    ).toBe(false)
  })

  it('fails closed at every direct Provider identity primitive boundary', () => {
    const valid = {
      provider: 'withings',
      providerScopeIdentifier: {
        system: uri('https://example.org/provider-accounts'),
        value: 'account-pseudonym',
        assurance: 'deployment-scoped-account-pseudonym',
      },
      sourceType: 'getmeas:11',
      sourceNativeId: 'source-record-1',
      outputs: [
        {
          kind: 'provider-output',
          outputRole: 'heart-rate',
          outputDiscriminator: 'single',
        },
      ],
      eventSequence: '1',
      deployment: deploymentIdentity,
    } as const
    expect(
      deriveProviderIdentities({
        ...valid,
        providerScopeIdentifier: {
          ...valid.providerScopeIdentifier,
          system: '/relative' as never,
        },
      }).ok,
    ).toBe(false)
    expect(
      deriveProviderIdentities({
        ...valid,
        outputs: [
          {
            kind: 'provider-output',
            outputRole: 'heart-rate',
            outputDiscriminator: '  ',
          },
        ],
      }).ok,
    ).toBe(false)
    expect(
      deriveProviderIdentities({
        ...valid,
        outputs: [...valid.outputs, ...valid.outputs],
      }).ok,
    ).toBe(false)
    expect(
      deriveProviderIdentities({
        ...valid,
        eventSequence: '0',
      }).ok,
    ).toBe(false)
  })

  it('reports malformed Provider parser and identity inputs without throwing', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    for (const invalid of [null, undefined, 42, 'invalid', cyclic]) {
      const operations = [
        () => parseNormalizedProviderRecord(invalid),
        () => parseProviderMeasurementBundleInput(invalid),
        () => buildProviderMeasurementBundle(invalid as never),
        () => deriveProviderIdentities(invalid as never),
      ]
      for (const operation of operations) {
        expect(operation).not.toThrow()
        expect(operation().ok).toBe(false)
      }
    }
  })

  it('does not mint identities for selectors outside the pinned Provider catalog', () => {
    const valid = {
      provider: 'withings',
      providerScopeIdentifier: {
        system: uri('https://example.org/provider-accounts'),
        value: 'account-pseudonym',
        assurance: 'deployment-scoped-account-pseudonym',
      },
      sourceType: 'getmeas:11',
      sourceNativeId: 'source-record-1',
      outputs: [
        {
          kind: 'provider-output',
          outputRole: 'heart-rate',
          outputDiscriminator: 'single',
        },
      ],
      eventSequence: '1',
      deployment: deploymentIdentity,
    } as const
    expect(deriveProviderIdentities(valid).ok).toBe(true)
    expect(
      deriveProviderIdentities({
        ...valid,
        provider: 'invented-provider',
      } as never).ok,
    ).toBe(false)
    expect(
      deriveProviderIdentities({ ...valid, sourceType: 'invented-source' }).ok,
    ).toBe(false)
    expect(
      deriveProviderIdentities({
        ...valid,
        outputs: [
          {
            kind: 'provider-output',
            outputRole: 'invented-output',
            outputDiscriminator: 'single',
          },
        ],
      }).ok,
    ).toBe(false)
    expect(
      deriveProviderIdentities({
        ...valid,
        outputs: [
          {
            kind: 'provider-output',
            outputRole: 'heart-rate',
            outputDiscriminator: 'invented-discriminator',
          },
        ],
      }).ok,
    ).toBe(false)
  })

  it('uses both exact grouped Withings output coordinates in the HMAC preimage', () => {
    const input = baseInput(
      'withings',
      'getmeas:9+10',
      bloodPressureMeasurement,
    )
    const coordinates = providerOutputCoordinates(
      'withings',
      'getmeas:9+10',
      'blood-pressure',
    )
    expect(coordinates).toEqual({
      outputRole: 'blood-pressure-panel',
      outputDiscriminator: 'single',
    })
    if (coordinates === undefined) return

    const expected = deriveProviderIdentities({
      provider: 'withings',
      providerScopeIdentifier: input.source.providerScopeIdentifier,
      sourceType: input.source.sourceType,
      sourceNativeId: input.source.sourceNativeId,
      outputs: [{ kind: 'provider-output', ...coordinates }],
      eventSequence: input.eventSequence,
      deployment: input.deploymentIdentity,
    })
    const bundle = buildProviderMeasurementBundle(input)
    expect(expected.ok && bundle.ok).toBe(true)
    if (!expected.ok || !bundle.ok) return
    const observation = resources(bundle).find(
      ({ resourceType }) => resourceType === 'Observation',
    )
    if (observation?.resourceType !== 'Observation') {
      throw new Error('The grouped output did not emit an Observation.')
    }
    const sourceOutput = observation.identifier?.find((candidate) =>
      candidate.type?.coding?.some(({ code }) => code === 'source-output'),
    )
    const expectedOutput = expected.value.outputs[0]
    expect(expectedOutput).toBeDefined()
    expect(sourceOutput).toMatchObject({
      system: expectedOutput?.system,
      value: expectedOutput?.value,
    })
  })

  it.each([
    [
      'provider account value',
      (input: ProviderMeasurementBundleInput) => ({
        ...input,
        source: {
          ...input.source,
          providerScopeIdentifier: {
            ...input.source.providerScopeIdentifier,
            value: ' \t ',
          },
        },
      }),
    ],
    [
      'source native id',
      (input: ProviderMeasurementBundleInput) => ({
        ...input,
        source: { ...input.source, sourceNativeId: '\n  ' },
      }),
    ],
    [
      'source type',
      (input: ProviderMeasurementBundleInput) => ({
        ...input,
        source: { ...input.source, sourceType: '   ' },
      }),
    ],
    [
      'converter source-device token',
      (input: ProviderMeasurementBundleInput) => ({
        ...input,
        application: {
          ...input.application,
          sourceDeviceToken: '\t',
        },
      }),
    ],
    [
      'data-origin source-device token',
      (input: ProviderMeasurementBundleInput) => ({
        ...input,
        source: {
          ...input.source,
          dataOrigin: {
            ...input.source.dataOrigin,
            sourceDeviceToken: '  ',
          },
        },
      }),
    ],
  ] as const)('rejects a whitespace-only %s', (_name, mutate) => {
    const input = baseInput('withings', 'getmeas:11', heartRateMeasurement)
    expect(parseProviderMeasurementBundleInput(mutate(input)).ok).toBe(false)
  })

  it.each(['converter', 'gateway', 'data-origin', 'recording-device'] as const)(
    'rejects an invalid Unicode %s business identity',
    (role) => {
      const input = baseInput('withings', 'getmeas:11', heartRateMeasurement)
      const invalidToken = 'invalid-\ud800'
      let candidate: ProviderMeasurementBundleInput
      if (role === 'converter') {
        candidate = {
          ...input,
          application: {
            ...input.application,
            sourceDeviceToken: invalidToken,
          },
        }
      } else if (role === 'gateway') {
        candidate = {
          ...input,
          gatewayApplication: {
            kind: 'distinct-application',
            roleAssurance: 'mediated-or-routed-measurement',
            application: {
              sourceDeviceToken: invalidToken,
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
              sourceDeviceToken: invalidToken,
            },
          },
        } as ProviderMeasurementBundleInput
      } else {
        candidate = {
          ...input,
          source: {
            ...input.source,
            recordingDevice: {
              stableUnitToken: invalidToken,
              subjectIdentifier: {
                system: uri('https://example.org/participants'),
                value: 'example',
              },
              identityScope: 'deployment-scoped',
            },
          },
        } as ProviderMeasurementBundleInput
      }
      expect(parseProviderMeasurementBundleInput(candidate).ok).toBe(false)
      expect(buildProviderMeasurementBundle(candidate).ok).toBe(false)
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
      const result = buildProviderMeasurementBundle(
        baseInput(
          provider,
          sourceType,
          measurement as unknown as MobileMeasurement,
        ),
      )
      expect(result.ok).toBe(false)
    },
  )

  it('rejects non-canonical events and conflicting facts for one device snapshot', () => {
    const input = baseInput('withings', 'getmeas:11', heartRateMeasurement)
    expect(
      buildProviderMeasurementBundle({
        ...input,
        eventSequence: '0',
      }).ok,
    ).toBe(false)
    expect(
      buildProviderMeasurementBundle({
        ...input,
        source: {
          ...input.source,
          dataOrigin: input.application,
        },
      } as unknown as ProviderMeasurementBundleInput).ok,
    ).toBe(true)
    expect(
      buildProviderMeasurementBundle({
        ...input,
        source: {
          ...input.source,
          dataOrigin: {
            ...input.source.dataOrigin,
            sourceDeviceToken: input.application.sourceDeviceToken,
          },
        },
      } as unknown as ProviderMeasurementBundleInput).ok,
    ).toBe(false)
  })
})
