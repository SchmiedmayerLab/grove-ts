//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  context,
  conversionInstant,
  heartRateMeasurement,
  identityScope,
  instant,
  record,
  scopeInput,
  study,
  unwrap,
  uri,
} from './provider-test-support.js'
import { groveExchangeProtocol } from '../src/contract/measurement-catalog.generated.js'
import {
  validateOpaqueIdentityScope,
  type RoledIdentifier,
} from '../src/mobile/index.js'
import {
  buildProviderExchangeGraph,
  buildProviderRecordingGraph,
  buildProviderRetractionEvent,
  encodeRecordingBytes,
  groveRecordingFormatRegistry,
  parseMediaType,
  type ProviderRecordingSource,
  type NormalizedProviderRecord,
} from '../src/providers/index.js'
import {
  parseRetractionEvent,
  retractionTargets,
  type Provenance,
  type RetractionEvent,
  type RetractionTarget,
} from '../src/r4/index.js'

const retractedAt = instant('2026-08-21T10:00:00Z')

const active = unwrap(
  buildProviderExchangeGraph(
    record('withings', 'getmeas:11', heartRateMeasurement),
    context('withings', '100'),
  ),
)
const targets = unwrap(retractionTargets(active.graph))
const primary = targets.find(({ role }) => role === 'primary-output')
if (primary === undefined) throw new Error('No primary output target.')

const provenanceOf = (event: RetractionEvent): Provenance => {
  const provenance = event.entry.find(
    ({ resource }) => resource.resourceType === 'Provenance',
  )?.resource
  if (provenance?.resourceType !== 'Provenance') {
    throw new Error('The retraction graph did not contain Provenance.')
  }
  return provenance
}

const roleExtension = groveExchangeProtocol.extensions.retractionTargetRole
const nativeExtension =
  groveExchangeProtocol.extensions.retractionTargetNativeIdentifier

const byText = (left: string, right: string): number =>
  left.localeCompare(right)

describe('Provider source-record retraction', () => {
  it('derives every retractable node of an accepted graph', () => {
    expect(targets.map(({ role }) => role).sort(byText)).toEqual([
      'device-snapshot',
      'device-snapshot',
      'device-snapshot',
      'primary-output',
    ])
    const observation = active.graph.entry.find(
      ({ resource }) => resource.resourceType === 'Observation',
    )?.resource
    if (observation?.resourceType !== 'Observation')
      throw new Error('No Observation.')
    const sourceOutput = observation.identifier?.find((candidate) =>
      candidate.type?.coding?.some(({ code }) => code === 'source-output'),
    )
    expect(primary).toEqual({
      role: 'primary-output',
      resourceType: 'Observation',
      identifier: {
        system: sourceOutput?.system,
        value: sourceOutput?.value,
        role: 'source-output',
      },
    })
    expect(retractionTargets({} as never).ok).toBe(false)
  })

  it('targets the exact prior output identity in a separate append-only event', () => {
    const retraction = unwrap(
      buildProviderRetractionEvent(
        [primary],
        context('withings', '101'),
        active.identifiers.sourceRecord,
        retractedAt,
      ),
    )
    expect(retraction.meta?.profile).toEqual([
      groveExchangeProtocol.profiles.retractionBundle,
    ])
    expect(
      retraction.entry.map(({ resource }) => resource.resourceType),
    ).toEqual(['Device', 'Device', 'Provenance'])
    const provenance = provenanceOf(retraction)
    expect(provenance.target).toEqual([
      {
        extension: [{ url: roleExtension, valueCode: 'primary-output' }],
        type: 'Observation',
        identifier: {
          system: primary.identifier.system,
          value: primary.identifier.value,
          type: {
            coding: [
              {
                system: groveExchangeProtocol.codeSystems.identifierRole,
                code: 'source-output',
              },
            ],
          },
        },
      },
    ])
    expect(provenance.target[0]).not.toHaveProperty('reference')
    expect(provenance.activity?.coding).toContainEqual(
      expect.objectContaining({
        system: groveExchangeProtocol.codeSystems.lifecycleEvent,
        code: groveExchangeProtocol.lifecycle.retraction.activityCode,
      }),
    )
    expect(provenance.occurredDateTime).toBe(retractedAt)
    expect(provenance.recorded).toBe(conversionInstant)
    expect(retraction.timestamp).toBe(conversionInstant)
    expect(provenance.entity?.[0]?.what.identifier?.value).toBe(
      active.identifiers.sourceRecord.value,
    )
    expect(JSON.stringify(retraction)).not.toMatch(/entered-in-error/u)
    expect(parseRetractionEvent(retraction).ok).toBe(true)
  })

  it('rejects additional direct profiles on retraction Provenance', () => {
    const retraction = structuredClone(
      unwrap(
        buildProviderRetractionEvent(
          [primary],
          context('withings', '101'),
          active.identifiers.sourceRecord,
          retractedAt,
        ),
      ),
    )
    const profiles = provenanceOf(retraction).meta?.profile as
      Array<string | null> | undefined
    profiles?.push(
      'https://example.org/fhir/StructureDefinition/unrelated-provenance',
    )
    const parsed = parseRetractionEvent(retraction)
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.issues).toContainEqual(
      expect.objectContaining({ code: 'mobile-exchange.provenance-profile' }),
    )
  })

  it('uses the selected source-output identity when retracting a source artifact', () => {
    const source: ProviderRecordingSource = {
      adapter: { kind: 'providers', provider: 'withings' },
      sourceType: 'activityIntraday',
      sourceNativeId: 'provider-record-activity-1',
      writer: { sourceDeviceToken: 'withings-cloud', name: 'Withings' },
      effective: { kind: 'date-time', value: instant('2026-08-20T12:00:00Z') },
    }
    const recording = unwrap(
      buildProviderRecordingGraph(
        source,
        {
          kind: 'embedded',
          contentType: unwrap(
            parseMediaType(
              groveRecordingFormatRegistry.formats['provider-recording']
                .contentTypes[0],
            ),
          ),
          format: 'provider-recording',
          payloadAssertion: 'verified-sanitized-input',
          dataBase64: unwrap(encodeRecordingBytes(Uint8Array.of(1, 2, 3))),
        },
        context('withings', '200'),
      ),
    )
    const document = recording.graph.entry.find(
      ({ resource }) => resource.resourceType === 'DocumentReference',
    )?.resource
    if (document?.resourceType !== 'DocumentReference')
      throw new Error('No document.')
    const sourceOutput = document.identifier?.find((candidate) =>
      candidate.type?.coding?.some(({ code }) => code === 'source-output'),
    )
    const artifact = unwrap(retractionTargets(recording.graph)).find(
      ({ role }) => role === 'source-artifact',
    )
    expect(artifact).toMatchObject({
      resourceType: 'DocumentReference',
      identifier: { system: sourceOutput?.system, value: sourceOutput?.value },
    })
    if (artifact === undefined) return
    const retraction = unwrap(
      buildProviderRetractionEvent(
        [artifact],
        context('withings', '201'),
        recording.identifiers.sourceRecord,
        retractedAt,
      ),
    )
    expect(provenanceOf(retraction).target[0]?.identifier).toEqual(sourceOutput)
  })

  it('targets the exact prior recording-device snapshot', () => {
    const conversion = unwrap(
      buildProviderExchangeGraph(
        {
          ...record('withings', 'getmeas:11', heartRateMeasurement),
          source: {
            ...record('withings', 'getmeas:11', heartRateMeasurement).source,
            recordingDevice: {
              stableUnitToken: 'recording-unit-1',
              name: 'Recorder',
            },
          },
        } as NormalizedProviderRecord,
        context('withings', '100'),
      ),
    )
    const snapshot = conversion.identifiers.recordingDeviceSnapshot
    const target = unwrap(retractionTargets(conversion.graph)).find(
      ({ identifier }) => identifier.value === snapshot?.value,
    )
    expect(target).toMatchObject({
      role: 'device-snapshot',
      resourceType: 'Device',
    })
    if (target === undefined) return
    const retraction = unwrap(
      buildProviderRetractionEvent(
        [target],
        context('withings', '102'),
        conversion.identifiers.sourceRecord,
        retractedAt,
      ),
    )
    expect(provenanceOf(retraction).target[0]?.identifier?.value).toBe(
      snapshot?.value,
    )
  })

  it('carries the adapter native record identifier on its target', () => {
    const nativeIdentifier = {
      system: uri('https://study.example.org/fhir/NamingSystem/native-record'),
      value: 'record-heart-001',
    }
    const retraction = unwrap(
      buildProviderRetractionEvent(
        [{ ...primary, nativeIdentifier }],
        context('withings', '101'),
        active.identifiers.sourceRecord,
        retractedAt,
      ),
    )
    expect(provenanceOf(retraction).target[0]?.extension).toEqual([
      { url: roleExtension, valueCode: 'primary-output' },
      { url: nativeExtension, valueIdentifier: nativeIdentifier },
    ])
    expect(
      buildProviderRetractionEvent(
        [
          {
            ...primary,
            nativeIdentifier: { system: primary.identifier.system, value: 'x' },
          },
        ],
        context('withings', '101'),
        active.identifiers.sourceRecord,
        retractedAt,
      ),
    ).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'value-mismatch',
          path: ['targets', 0, 'nativeIdentifier', 'system'],
        },
      ],
    })
  })

  it('carries a governed source identifier from the primary output into its target', () => {
    const disclosed = unwrap(
      buildProviderExchangeGraph(
        record('withings', 'getmeas:11', heartRateMeasurement),
        context('withings', '100'),
        {
          nativeIdentifierDisclosure: {
            kind: 'authorized',
            system: uri(
              'https://example.org/repositories/withings-account-7/heart-rate-records',
            ),
          },
        },
      ),
    )
    const target = unwrap(retractionTargets(disclosed.graph)).find(
      ({ role }) => role === 'primary-output',
    )
    expect(target?.nativeIdentifier).toEqual({
      system:
        'https://example.org/repositories/withings-account-7/heart-rate-records',
      value: 'native-withings-getmeas:11',
    })
  })

  it('emits retraction targets in a deterministic canonical order', () => {
    const devices = targets.filter(({ role }) => role === 'device-snapshot')
    const forward = unwrap(
      buildProviderRetractionEvent(
        [primary, ...devices],
        context('withings', '101'),
        active.identifiers.sourceRecord,
        retractedAt,
      ),
    )
    const reversed = unwrap(
      buildProviderRetractionEvent(
        [...devices].reverse().concat(primary) as [
          RetractionTarget,
          ...RetractionTarget[],
        ],
        context('withings', '101'),
        active.identifiers.sourceRecord,
        retractedAt,
      ),
    )
    expect(reversed).toEqual(forward)
  })

  it('reports malformed retraction inputs without throwing', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    for (const invalid of [null, undefined, 42, 'invalid', cyclic]) {
      expect(() =>
        buildProviderRetractionEvent(
          invalid as never,
          invalid as never,
          invalid as never,
          invalid as never,
        ),
      ).not.toThrow()
      expect(
        buildProviderRetractionEvent(
          [primary],
          invalid as never,
          active.identifiers.sourceRecord,
          retractedAt,
        ).ok,
      ).toBe(false)
    }
  })

  it('rejects targets and sources the context did not mint', () => {
    const other = unwrap(
      validateOpaqueIdentityScope({
        ...scopeInput,
        systems: {
          ...scopeInput.systems,
          opaque: {
            ...scopeInput.systems.opaque,
            'provider-output': uri('https://other.example.org/provider-output'),
          },
        },
      }),
    )
    const build = (
      candidates: readonly [RetractionTarget, ...RetractionTarget[]],
      sourceRecord: RoledIdentifier = active.identifiers.sourceRecord,
      overrides = {},
    ) =>
      buildProviderRetractionEvent(
        candidates,
        context('withings', '101', overrides),
        sourceRecord,
        retractedAt,
      )
    expect(build([primary, primary])).toMatchObject({
      ok: false,
      issues: [{ code: 'duplicate-identifier', path: ['targets', 1] }],
    })
    expect(
      build([{ ...primary, resourceType: 'DocumentReference' }] as never),
    ).toMatchObject({ ok: false, issues: [{ code: 'invalid-code' }] })
    expect(build([{ ...primary, role: 'specimen' }] as never)).toMatchObject({
      ok: false,
      issues: [{ code: 'invalid-code' }],
    })
    expect(
      build([
        {
          ...primary,
          identifier: {
            ...primary.identifier,
            system: other.systems.opaque['provider-output'],
          },
        },
      ]),
    ).toMatchObject({ ok: false, issues: [{ code: 'invalid-identifier' }] })
    expect(
      build([
        {
          ...primary,
          identifier: { ...primary.identifier, value: 'clear-record' },
        },
      ]),
    ).toMatchObject({ ok: false, issues: [{ code: 'invalid-identifier' }] })
    expect(build([] as never)).toMatchObject({
      ok: false,
      issues: [{ code: 'missing-required', path: ['targets'] }],
    })
    expect(build([primary], { ...primary.identifier })).toMatchObject({
      ok: false,
      issues: [{ code: 'invalid-identifier', path: ['sourceRecord'] }],
    })
    expect(
      build([primary], undefined, { studies: [study('a')] }),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'value-mismatch', path: ['studies'] }],
    })
    expect(
      buildProviderRetractionEvent(
        [primary],
        context('withings', '101'),
        active.identifiers.sourceRecord,
        '2026-08-21' as never,
      ),
    ).toMatchObject({ ok: false, issues: [{ code: 'invalid-date-time' }] })
    expect(
      buildProviderRetractionEvent(
        [primary],
        { ...context('withings', '101'), identityScope: { ...identityScope } },
        active.identifiers.sourceRecord,
        retractedAt,
      ).ok,
    ).toBe(false)
  })
})
