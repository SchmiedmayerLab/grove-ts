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
  dateTime,
  heartRateMeasurement,
  identifierSystem,
  identityScope,
  instant,
  observationOf,
  record,
  resources,
  start,
  unwrap,
} from './provider-test-support.js'
import { parseFhirId, parsePartIndex } from '../src/index.js'
import {
  canonicalizeMobileEffectiveInstant,
  deriveEntryFullUrl,
  mobileEffectiveCanonicalizationVectors,
  sharedMobileMeasurementCatalog,
  type MobileMeasurement,
} from '../src/mobile/index.js'
import { deriveProviderIdentities } from '../src/providers/identity.js'
import {
  buildProviderExchangeGraph,
  deriveProviderRecordIdentity,
  parseNormalizedProviderRecord,
  providerOutputCoordinates,
  type NormalizedProviderRecord,
} from '../src/providers/index.js'
import {
  providerMeasurementDefinition,
  providerMeasurementProfile,
  providerObservationProfile,
} from '../src/providers/measurement-definition.js'

const heartRate = record('withings', 'getmeas:11', heartRateMeasurement)
const withSource = (
  base: NormalizedProviderRecord,
  source: Record<string, unknown>,
): NormalizedProviderRecord =>
  ({
    ...base,
    source: { ...base.source, ...source },
  }) as NormalizedProviderRecord
const withMeasurement = (
  base: NormalizedProviderRecord,
  measurement: unknown,
): NormalizedProviderRecord =>
  ({ ...base, measurements: [measurement] }) as NormalizedProviderRecord

describe('Provider R4 graph builder', () => {
  it('rounds Mobile effective instants before enforcing ordering and catalog-owned duration rules', () => {
    const sleep = (startValue: string, endValue: string) =>
      record('oura', 'sleep', {
        kind: 'sleep-duration',
        value: 0.1,
        effective: {
          kind: 'period',
          start: instant(startValue),
          end: instant(endValue),
        },
      })
    expect(
      buildProviderExchangeGraph(
        sleep('2026-08-20T12:00:00.0001Z', '2026-08-20T12:00:00.0002Z'),
        context('oura'),
      ).ok,
    ).toBe(true)
    expect(
      buildProviderExchangeGraph(
        record('google-health-api', 'steps', {
          kind: 'step-count',
          value: 1,
          effective: {
            kind: 'period',
            start: instant('2026-08-20T12:00:00.0001Z'),
            end: instant('2026-08-20T12:00:00.0002Z'),
          },
        }),
        context('google-health-api'),
      ),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'mobile-input.effective-period-invalid' }],
    })

    const result = buildProviderExchangeGraph(
      sleep('2026-08-20T12:00:00.0004Z', '2026-08-20T12:00:00.0006Z'),
      context('oura'),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(observationOf(result.value.graph).effectivePeriod).toEqual({
      start: '2026-08-20T12:00:00.000Z',
      end: '2026-08-20T12:00:00.001Z',
    })
    expect(
      buildProviderExchangeGraph(
        sleep('2026-08-20T12:00:00.0006Z', '2026-08-20T12:00:00.0004Z'),
        context('oura'),
      ),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'mobile-input.effective-period-invalid' }],
    })
  })

  it('faults a subject that is neither logical nor bundled', () => {
    for (const subject of [
      'Patient/example',
      {
        kind: 'logical',
        identifier: context().subject.identifier,
        reference: 'Patient/x',
      },
      { type: 'Patient', identifier: context().subject.identifier },
    ]) {
      const result = buildProviderExchangeGraph(
        heartRate,
        context('withings', '1', { subject: subject as never }),
      )
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.issues[0]?.path[0]).toBe('subject')
    }
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

  it('serializes a canonical effectiveDateTime while preserving its source offset', () => {
    const input = withMeasurement(heartRate, {
      ...heartRateMeasurement,
      effective: {
        kind: 'date-time',
        value: instant('2026-08-20T08:30:00.251500001-07:00'),
      },
    })
    const parsed = parseNormalizedProviderRecord(input)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.measurements[0].effective).toEqual({
      kind: 'date-time',
      value: '2026-08-20T08:30:00.252-07:00',
    })
    const result = unwrap(buildProviderExchangeGraph(input, context()))
    expect(observationOf(result.graph).effectiveDateTime).toBe(
      '2026-08-20T08:30:00.252-07:00',
    )
    const provenance = resources(result.graph).find(
      (r) => r.resourceType === 'Provenance',
    )
    if (provenance?.resourceType !== 'Provenance')
      throw new Error('No Provenance.')
    expect(provenance.occurredDateTime).toBe('2026-08-20T08:30:00.252-07:00')
    expect(provenance.recorded).toBe(context().conversionInstant)
    expect(result.graph.timestamp).toBe(context().conversionInstant)
  })

  it('derives every urn:uuid edge from a complete business identifier', () => {
    const result = unwrap(buildProviderExchangeGraph(heartRate, context()))
    for (const entry of result.graph.entry) {
      expect(entry.fullUrl).toMatch(/^urn:uuid:/u)
      const businessIdentifier = entry.extension?.[0]?.valueIdentifier
      expect(
        deriveEntryFullUrl({
          system: identifierSystem(businessIdentifier?.system ?? ''),
          value: businessIdentifier?.value ?? '',
        }),
      ).toEqual({ ok: true, value: entry.fullUrl })
    }
  })

  it('constructs one composite Withings blood-pressure panel', () => {
    const result = unwrap(
      buildProviderExchangeGraph(
        record('withings', 'getmeas:9+10', bloodPressureMeasurement),
        context(),
      ),
    )
    const observation = observationOf(result.graph)
    expect(observation.component).toHaveLength(2)
    expect(observation.valueQuantity).toBeUndefined()
  })

  it('uses optional Resource.id values only when the context supplies them', () => {
    const result = buildProviderExchangeGraph(
      heartRate,
      context('withings', '1', {
        repositoryIds: {
          bundle: unwrap(parseFhirId('bundle-42')),
          'primary-output': unwrap(parseFhirId('observation-42')),
          provenance: unwrap(parseFhirId('provenance-42')),
          'application-device': unwrap(parseFhirId('application-42')),
          'recording-device': unwrap(parseFhirId('recording-device-42')),
        },
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.graph.id).toBe('bundle-42')
    expect(observationOf(result.value.graph).id).toBe('observation-42')
    expect(
      resources(result.value.graph).find((r) => r.resourceType === 'Provenance')
        ?.id,
    ).toBe('provenance-42')
    expect(
      resources(result.value.graph).find(
        (r) =>
          r.resourceType === 'Device' &&
          r.deviceName?.[0]?.name === application.name,
      )?.id,
    ).toBe('application-42')
  })

  it('omits optional attribution and device fields while preserving repository device ids', () => {
    const result = buildProviderExchangeGraph(
      withSource(heartRate, {
        recordingMethod: undefined,
        recordingDevice: { stableUnitToken: 'minimal-device' },
      }),
      context('withings', '1', {
        repositoryIds: {
          'recording-device': unwrap(parseFhirId('recording-device-42')),
        },
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(observationOf(result.value.graph).extension).toEqual(
      expect.arrayContaining([
        {
          url: 'https://grovealliance.org/fhir/providers/StructureDefinition/provider-source-type',
          valueCode: 'withings/getmeas:11',
        },
      ]),
    )
    const minimalDevice = resources(result.value.graph).find(
      (resource) => resource.id === 'recording-device-42',
    )
    expect(minimalDevice).toBeDefined()
    expect(minimalDevice).not.toHaveProperty('deviceName')
    expect(minimalDevice).not.toHaveProperty('manufacturer')
    expect(minimalDevice).not.toHaveProperty('modelNumber')
  })

  it('refuses only catalog-owned scalar value domains at the record boundary', () => {
    expect(
      parseNormalizedProviderRecord(
        withMeasurement(heartRate, {
          ...heartRateMeasurement,
          effective: { kind: 'date-time', value: 'not-an-instant' },
        }),
      ),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'mobile-input.effective-period-invalid' }],
    })
    expect(
      parseNormalizedProviderRecord(
        withMeasurement(heartRate, { ...heartRateMeasurement, value: 0 }),
      ).ok,
    ).toBe(true)
    expect(
      parseNormalizedProviderRecord(
        withMeasurement(
          record('google-health-api', 'steps', heartRateMeasurement),
          {
            kind: 'step-count',
            value: 1.5,
            effective: { kind: 'period', start, end: dateTime },
          },
        ),
      ),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'mobile-input.value-outside-domain' }],
    })
    expect(
      parseNormalizedProviderRecord(
        withMeasurement(record('withings', 'getmeas:6', heartRateMeasurement), {
          kind: 'body-fat-percentage',
          value: 100.1,
          effective: { kind: 'date-time', value: dateTime },
        }),
      ),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'mobile-input.value-outside-domain' }],
    })
    expect(
      parseNormalizedProviderRecord(
        withMeasurement(heartRate, {
          ...heartRateMeasurement,
          value: Number.POSITIVE_INFINITY,
        }),
      ),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'mobile-input.value-outside-domain' }],
    })
    expect(
      parseNormalizedProviderRecord(
        withMeasurement(heartRate, { ...heartRateMeasurement, value: '64' }),
      ),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'mobile-input.value-shape-invalid' }],
    })
    expect(
      parseNormalizedProviderRecord(
        withSource(heartRate, { writer: { name: 'x' } }),
      ),
    ).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'mobile-input.required-metadata-missing',
          path: ['source', 'writer', 'sourceDeviceToken'],
        },
      ],
    })
    expect(
      parseNormalizedProviderRecord(
        withSource(heartRate, { recordingMethod: 'guessed' }),
      ),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'mobile-input.unsupported-source-value' }],
    })
  })

  it('refuses a source-native identity containing an isolated surrogate', () => {
    expect(
      parseNormalizedProviderRecord(
        withSource(heartRate, { sourceNativeId: 'invalid-\ud800' }),
      ),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'mobile-input.text-not-unicode-scalar' }],
    })
  })

  it('rejects Unicode IRIs wherever inputs require an absolute URI', () => {
    expect(
      parseNormalizedProviderRecord(
        withSource(heartRate, {
          writerRecord: {
            applicationIdentifier: {
              system: 'https://例え.example/apps',
              value: 'a',
            },
            nativeRecordId: 'r',
          },
        }),
      ),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'mobile-input.value-shape-invalid' }],
    })
    expect(
      buildProviderExchangeGraph(
        heartRate,
        context('withings', '1', {
          repositoryScope: {
            system: 'https://例え.example/accounts',
            value: 'a',
          } as never,
        }),
      ),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'invalid-uri', path: ['repositoryScope', 'system'] }],
    })
  })

  it('fails closed at every direct Provider identity primitive boundary', () => {
    const valid = {
      provider: 'withings',
      repositoryScope: context().repositoryScope,
      sourceType: 'getmeas:11',
      sourceNativeId: 'source-record-1',
      outputs: [
        {
          kind: 'provider-output',
          role: 'heart-rate',
          discriminator: 'single',
        },
      ],
      event: context().event,
      scope: identityScope,
    } as const
    expect(deriveProviderIdentities(valid).ok).toBe(true)
    expect(
      deriveProviderIdentities({
        ...valid,
        repositoryScope: {
          ...valid.repositoryScope,
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
            role: 'heart-rate',
            discriminator: '  ',
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
      deriveProviderIdentities({ ...valid, scope: { ...identityScope } }).ok,
    ).toBe(false)
    expect(
      deriveProviderIdentities({
        ...valid,
        event: { ...valid.event, value: 'e0:x:1' },
      }).ok,
    ).toBe(false)
    for (const candidate of [
      { ...valid, provider: 42 },
      { ...valid, sourceType: 42 },
      { ...valid, outputs: 42 },
      { ...valid, outputs: [] },
      { ...valid, outputs: [null] },
      { ...valid, outputs: [{ ...valid.outputs[0], unexpected: true }] },
      { ...valid, repositoryScope: { ...valid.repositoryScope, value: 42 } },
      { ...valid, repositoryScope: { ...valid.repositoryScope, value: '  ' } },
      { ...valid, sourceNativeId: 42 },
      { ...valid, sourceNativeId: '  ' },
      { ...valid, provenanceNodeRole: 'unknown' },
    ]) {
      expect(deriveProviderIdentities(candidate as never).ok).toBe(false)
    }
    expect(
      deriveProviderIdentities({
        ...valid,
        outputs: [],
        provenanceNodeRole: 'retraction-provenance',
      }).ok,
    ).toBe(true)
    const raw = {
      ...valid,
      provider: 'oura',
      sourceType: 'heartrate',
      outputs: [
        {
          kind: 'provider-artifact',
          formatCode: 'provider-recording',
          partIndex: unwrap(parsePartIndex('0')),
        },
      ],
    } as const
    expect(deriveProviderIdentities(raw).ok).toBe(true)
    expect(
      deriveProviderIdentities({
        ...raw,
        outputs: [{ ...raw.outputs[0], partIndex: '01' as never }],
      }).ok,
    ).toBe(false)
    expect(
      deriveProviderIdentities({
        ...raw,
        outputs: [{ ...raw.outputs[0], formatCode: 'invented' }],
      }).ok,
    ).toBe(false)
  })

  it('resolves only shared or exact provider-owned measurement definitions', () => {
    expect(providerMeasurementDefinition('withings', 'heart-rate')).toBe(
      sharedMobileMeasurementCatalog['heart-rate'],
    )
    expect(
      providerMeasurementProfile('withings', 'withings-vascular-age'),
    ).toBe(
      'https://grovealliance.org/fhir/withings/StructureDefinition/withings-vascular-age',
    )
    expect(providerObservationProfile('withings')).toBe(
      'https://grovealliance.org/fhir/withings/StructureDefinition/withings-observation',
    )
    expect(
      providerMeasurementDefinition('withings', 'oura-cardiovascular-age'),
    ).toBeUndefined()
    expect(
      providerMeasurementDefinition('unknown' as never, 'heart-rate'),
    ).toBe(sharedMobileMeasurementCatalog['heart-rate'])
    expect(
      providerMeasurementDefinition('unknown' as never, 'unknown'),
    ).toBeUndefined()
    expect(
      providerMeasurementProfile('unknown' as never, 'unknown'),
    ).toBeUndefined()
    expect(providerObservationProfile('unknown' as never)).toBeUndefined()
  })

  it('reports malformed Provider parser and identity inputs without throwing', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    for (const invalid of [null, undefined, 42, 'invalid', cyclic]) {
      const operations = [
        () => parseNormalizedProviderRecord(invalid),
        () => buildProviderExchangeGraph(invalid as never, context()),
        () => buildProviderExchangeGraph(heartRate, invalid as never),
        () => deriveProviderIdentities(invalid as never),
        // Absent options are the defaults; anything else present must be an options object.
        ...(invalid === undefined ?
          []
        : [
            () =>
              buildProviderExchangeGraph(
                heartRate,
                context(),
                invalid as never,
              ),
          ]),
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
      repositoryScope: context().repositoryScope,
      sourceType: 'getmeas:11',
      sourceNativeId: 'source-record-1',
      outputs: [
        {
          kind: 'provider-output',
          role: 'heart-rate',
          discriminator: 'single',
        },
      ],
      event: context().event,
      scope: identityScope,
    } as const
    expect(deriveProviderIdentities(valid).ok).toBe(true)
    expect(
      deriveProviderIdentities({
        ...valid,
        provider: 'invented-provider',
      } as never),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'mobile-input.unsupported-source-type' }],
    })
    expect(
      deriveProviderIdentities({ ...valid, sourceType: 'invented-source' }),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'mobile-input.unsupported-source-type' }],
    })
    expect(
      deriveProviderIdentities({
        ...valid,
        outputs: [
          {
            kind: 'provider-output',
            role: 'invented-output',
            discriminator: 'single',
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'mobile-input.unsupported-source-value' }],
    })
    expect(
      deriveProviderIdentities({
        ...valid,
        outputs: [
          {
            kind: 'provider-output',
            role: 'heart-rate',
            discriminator: 'invented',
          },
        ],
      }).ok,
    ).toBe(false)
  })

  it('uses both exact grouped Withings output coordinates in the HMAC preimage', () => {
    const input = record('withings', 'getmeas:9+10', bloodPressureMeasurement)
    const coordinates = providerOutputCoordinates(
      'withings',
      'getmeas:9+10',
      'blood-pressure',
    )
    expect(coordinates).toEqual({
      role: 'blood-pressure-panel',
      discriminator: 'single',
    })
    if (coordinates === undefined) return
    const sourceRecord = unwrap(
      deriveProviderRecordIdentity(identityScope, {
        providerCode: 'withings',
        sourceType: input.source.sourceType,
        providerScope: context().repositoryScope,
        nativeRecordId: input.source.sourceNativeId,
      }),
    )
    const expected = unwrap(sourceRecord.output(coordinates))
    const built = unwrap(buildProviderExchangeGraph(input, context()))
    const sourceOutput = observationOf(built.graph).identifier?.find(
      (candidate) =>
        candidate.type?.coding?.some(({ code }) => code === 'source-output'),
    )
    expect(sourceOutput).toMatchObject({
      system: expected.system,
      value: expected.value,
    })
    expect(built.identifiers.sourceRecord).toEqual(sourceRecord.identifier)
    expect(built.identifiers.outputs[0]).toEqual(expected)
  })

  it.each([
    [
      'source native id',
      { sourceNativeId: '\n  ' },
      'mobile-input.native-identifier-invalid',
    ],
    ['source type', { sourceType: '   ' }, 'mobile-input.value-shape-invalid'],
    [
      'writer token',
      { writer: { sourceDeviceToken: '  ', name: 'x' } },
      'mobile-input.value-shape-invalid',
    ],
  ] as const)('refuses a whitespace-only %s', (_name, change, code) => {
    expect(
      parseNormalizedProviderRecord(withSource(heartRate, change)),
    ).toMatchObject({
      ok: false,
      issues: [{ code }],
    })
  })

  it('refuses invalid Unicode in the record and faults it in the context', () => {
    const invalidToken = 'invalid-\ud800'
    expect(
      parseNormalizedProviderRecord(
        withSource(heartRate, {
          writer: { sourceDeviceToken: invalidToken, name: 'x' },
        }),
      ),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'mobile-input.text-not-unicode-scalar' }],
    })
    expect(
      parseNormalizedProviderRecord(
        withSource(heartRate, {
          recordingDevice: { stableUnitToken: invalidToken },
        }),
      ),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'mobile-input.text-not-unicode-scalar' }],
    })
    for (const overrides of [
      { application: { ...application, sourceDeviceToken: invalidToken } },
      {
        converterRole: {
          kind: 'gateway-application',
          application: {
            sourceDeviceToken: invalidToken,
            name: 'Gateway',
            version: '1',
          },
        },
      },
    ] as const) {
      const result = buildProviderExchangeGraph(
        heartRate,
        context('withings', '1', overrides),
      )
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.issues[0]?.code).toBe('invalid-identifier')
    }
  })

  it.each([
    ['google-health-api', 'heart-rate', heartRateMeasurement],
    [
      'google-health-api',
      'blood-glucose',
      {
        kind: 'blood-glucose',
        value: 94,
        effective: { kind: 'date-time', value: dateTime },
      },
    ],
    [
      'oura',
      'sleep',
      {
        kind: 'sleep-stage',
        stage: 'deep',
        effective: { kind: 'period', start, end: dateTime },
      },
    ],
  ] as const)(
    'fails closed for non-scalar or unsupported %s/%s data',
    (provider, sourceType, measurement) => {
      const result = buildProviderExchangeGraph(
        record(
          provider,
          sourceType,
          measurement as unknown as MobileMeasurement,
        ),
        context(provider),
      )
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.issues[0]?.code).toMatch(/^mobile-input\./u)
    },
  )

  it('rejects conflicting facts for one device snapshot and deduplicates identical ones', () => {
    expect(
      buildProviderExchangeGraph(
        withSource(heartRate, { writer: application }),
        context(),
      ).ok,
    ).toBe(true)
    expect(
      buildProviderExchangeGraph(
        withSource(heartRate, {
          writer: {
            ...heartRate.source.writer,
            sourceDeviceToken: application.sourceDeviceToken,
          },
        }),
        context(),
      ),
    ).toMatchObject({ ok: false, issues: [{ code: 'duplicate-identifier' }] })
  })
})
