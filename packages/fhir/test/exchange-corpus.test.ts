//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

/* eslint-disable sonarjs/no-clear-text-protocols -- The FHIR R4 lifecycle and terminology canonicals are normative HTTP URIs. */

import { readFileSync } from 'node:fs'
import {
  parseGroveMobileExchangeBundle,
  parseGroveMobileRetractionBundle,
} from '../src/r4/index.js'

interface JsonPatchOperation {
  readonly op: 'add' | 'remove' | 'replace'
  readonly path: string
  readonly value?: unknown
}

interface CorpusCase {
  readonly id: string
  readonly base: 'mobile-exchange' | 'mobile-retraction'
  readonly patch: readonly JsonPatchOperation[]
  readonly expectedRule: {
    readonly code: string
    readonly reason: string
    readonly location: string
    readonly severity: 'error'
  }
}

interface ExchangeCorpus {
  readonly schemaVersion: 0
  readonly cases: readonly CorpusCase[]
}

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      new URL(
        `../fixtures/conformance/mobile-exchange/${name}`,
        import.meta.url,
      ),
      'utf8',
    ),
  )

const bases = {
  'mobile-exchange': fixture('exchange-bundle.json'),
  'mobile-retraction': fixture('retraction-bundle.json'),
} as const
const corpus = fixture('corpus.json') as ExchangeCorpus

const pointerComponents = (pointer: string): string[] =>
  pointer
    .slice(1)
    .split('/')
    .map((component) => component.replaceAll('~1', '/').replaceAll('~0', '~'))

const patched = (
  base: unknown,
  operations: readonly JsonPatchOperation[],
): unknown => {
  const result = structuredClone(base)
  for (const operation of operations) {
    const components = pointerComponents(operation.path)
    const property = components.pop()
    if (property === undefined)
      throw new Error('A JSON Patch path is required.')
    let parent = result as Record<string, unknown> | unknown[]
    for (const component of components) {
      const next =
        Array.isArray(parent) ? parent[Number(component)] : parent[component]
      if (typeof next !== 'object' || next === null) {
        throw new Error(`Patch path does not resolve: ${operation.path}`)
      }
      parent = next as Record<string, unknown> | unknown[]
    }
    if (Array.isArray(parent)) {
      const index = Number(property)
      if (operation.op === 'remove') parent.splice(index, 1)
      else if (operation.op === 'add') parent.splice(index, 0, operation.value)
      else parent[index] = operation.value
    } else if (operation.op === 'remove') {
      Reflect.deleteProperty(parent, property)
    } else {
      parent[property] = operation.value
    }
  }
  return result
}

describe('shared Grove Mobile exchange corpus', () => {
  it('accepts both normative positive graphs', () => {
    expect(parseGroveMobileExchangeBundle(bases['mobile-exchange']).ok).toBe(
      true,
    )
    expect(
      parseGroveMobileRetractionBundle(bases['mobile-retraction']).ok,
    ).toBe(true)
  })

  it('accepts a directly claimed HealthKit application snapshot with its product identifier', () => {
    const input = patched(bases['mobile-exchange'], [
      {
        op: 'replace',
        path: '/entry/1/resource/meta/profile/0',
        value:
          'https://grovealliance.org/fhir/healthkit/StructureDefinition/healthkit-application-device',
      },
      {
        op: 'add',
        path: '/entry/1/resource/identifier/1',
        value: {
          type: {
            coding: [
              {
                system:
                  'https://grovealliance.org/fhir/healthkit/CodeSystem/healthkit-identifier-type',
                code: 'apple-bundle-id',
              },
            ],
          },
          system:
            'https://grovealliance.org/fhir/healthkit/NamingSystem/apple-bundle-id',
          value: 'org.example.study',
        },
      },
    ])
    expect(parseGroveMobileExchangeBundle(input).ok).toBe(true)
  })

  it('does not mistake an Expression.reference URI for a FHIR Reference', () => {
    const input = patched(bases['mobile-exchange'], [
      {
        op: 'add',
        path: '/entry/2/resource/extension',
        value: [
          {
            url: 'https://example.org/fhir/StructureDefinition/rule-expression',
            valueExpression: {
              language: 'text/fhirpath',
              reference: 'https://example.org/fhir/Library/measurement-rule',
            },
          },
        ],
      },
    ])
    expect(parseGroveMobileExchangeBundle(input).ok).toBe(true)
  })

  it('reports the actual unresolved reference path instead of assuming subject', () => {
    const input = patched(bases['mobile-exchange'], [
      {
        op: 'add',
        path: '/entry/2/resource/derivedFrom',
        value: [{ reference: 'urn:uuid:00000000-0000-5000-8000-000000000000' }],
      },
    ])
    const result = parseGroveMobileExchangeBundle(input)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(
      result.issues.find(
        ({ code }) => code === 'mobile-exchange.resolved-reference',
      )?.location,
    ).toBe('Bundle.entry[2].resource.derivedFrom[0].reference')
  })

  it('keeps Grove Identifier systems dedicated to one role per graph', () => {
    const sourceSystem = (
      bases['mobile-exchange'] as {
        entry: Array<{
          resource: { identifier?: Array<{ system: string }> }
        }>
      }
    ).entry[2]?.resource.identifier?.[0]?.system
    const input = patched(bases['mobile-exchange'], [
      {
        op: 'replace',
        path: '/entry/2/resource/identifier/1/system',
        value: sourceSystem,
      },
    ])
    const result = parseGroveMobileExchangeBundle(input)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'mobile-exchange.identity-system-role',
      }),
    )
  })

  it('requires the exact native Recording Document beside a SensorKit ECG', () => {
    const input = patched(bases['mobile-exchange'], [
      {
        op: 'replace',
        path: '/entry/2/resource/meta/profile',
        value: [
          'https://grovealliance.org/fhir/sensor/StructureDefinition/grove-sensor-ecg-observation',
          'https://grovealliance.org/fhir/sensorkit/StructureDefinition/sensorkit-ecg-observation',
        ],
      },
    ])
    const result = parseGroveMobileExchangeBundle(input)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'mobile-output.hybrid-companion' }),
    )
  })

  it('rejects catalog-owned adapter source markers on source-neutral output', () => {
    const input = patched(bases['mobile-exchange'], [
      {
        op: 'add',
        path: '/entry/2/resource/extension/1',
        value: {
          url: 'https://grovealliance.org/fhir/healthkit/StructureDefinition/healthkit-source-type-extension',
          valueCode: 'HKQuantityTypeIdentifierHeartRate',
        },
      },
    ])
    const result = parseGroveMobileExchangeBundle(input)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(
        result.issues.some(({ message }) =>
          message.includes('mobile-exchange.adapter-source-marker'),
        ),
      ).toBe(true)
    }
  })

  it('requires the exact catalog source marker on an adapter-profiled output', () => {
    const input = patched(bases['mobile-exchange'], [
      {
        op: 'add',
        path: '/entry/2/resource/meta/profile/1',
        value:
          'https://grovealliance.org/fhir/healthkit/StructureDefinition/healthkit-observation',
      },
      {
        op: 'replace',
        path: '/entry/3/resource/meta/profile/0',
        value:
          'https://grovealliance.org/fhir/healthkit/StructureDefinition/healthkit-conversion-provenance',
      },
    ])
    const result = parseGroveMobileExchangeBundle(input)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(
        result.issues.some(({ message }) =>
          message.includes('mobile-exchange.adapter-source-marker'),
        ),
      ).toBe(true)
    }
  })

  it('represents Health Connect DataOrigin.packageName as a logical Device agent, never a Bundle Device', () => {
    const healthConnectGraph = patched(bases['mobile-exchange'], [
      {
        op: 'add',
        path: '/entry/2/resource/meta/profile/1',
        value:
          'https://grovealliance.org/fhir/health-connect/StructureDefinition/health-connect-observation',
      },
      {
        op: 'add',
        path: '/entry/2/resource/extension/1',
        value: {
          url: 'https://grovealliance.org/fhir/health-connect/StructureDefinition/health-connect-record-type',
          valueCode: 'HeartRateRecord',
        },
      },
      {
        op: 'replace',
        path: '/entry/3/resource/meta/profile/0',
        value:
          'https://grovealliance.org/fhir/health-connect/StructureDefinition/health-connect-conversion-provenance',
      },
      {
        op: 'add',
        path: '/entry/3/resource/entity/0/agent',
        value: [
          {
            type: {
              coding: [
                {
                  system:
                    'http://terminology.hl7.org/CodeSystem/provenance-participant-type',
                  code: 'enterer',
                },
              ],
            },
            who: {
              type: 'Device',
              identifier: {
                system:
                  'https://grovealliance.org/fhir/health-connect/NamingSystem/android-package-name',
                value: 'org.example.health.writer',
              },
            },
          },
        ],
      },
    ])
    expect(parseGroveMobileExchangeBundle(healthConnectGraph).ok).toBe(true)

    const literalDataOrigin = patched(healthConnectGraph, [
      {
        op: 'add',
        path: '/entry/3/resource/entity/0/agent/0/who/reference',
        value: 'urn:uuid:8f87a88a-8744-5116-8901-9274f62472ac',
      },
    ])
    const result = parseGroveMobileExchangeBundle(literalDataOrigin)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(
        result.issues.some(({ message }) =>
          message.includes('health-connect.data-origin-application'),
        ),
      ).toBe(true)
    }
  })

  it.each(corpus.cases)(
    'rejects $id with stable producer rule $expectedRule.code',
    ({ base, patch, expectedRule }) => {
      const input = patched(bases[base], patch)
      const result =
        base === 'mobile-exchange' ?
          parseGroveMobileExchangeBundle(input)
        : parseGroveMobileRetractionBundle(input)
      expect(result.ok).toBe(false)
      if (result.ok) return
      const emitted = result.issues.find(
        ({ code }) => code === expectedRule.code,
      )
      expect(emitted).toBeDefined()
      expect(
        emitted === undefined ? undefined : (
          {
            code: emitted.code,
            reason: emitted.reason,
            location: emitted.location,
            severity: emitted.severity,
          }
        ),
      ).toEqual(expectedRule)
    },
  )

  it.each([
    {
      name: 'missing quantity value',
      patch: [
        {
          op: 'remove' as const,
          path: '/entry/2/resource/valueQuantity/value',
        },
      ],
    },
    {
      name: 'impossible effective calendar date',
      patch: [
        {
          op: 'replace' as const,
          path: '/entry/2/resource/effectiveDateTime',
          value: '2026-02-30T08:30:00-07:00',
        },
      ],
    },
    {
      name: 'duplicated primary clinical coding',
      patch: [
        {
          op: 'add' as const,
          path: '/entry/2/resource/code/coding/1',
          value: { system: 'http://loinc.org', code: '8867-4' },
        },
      ],
    },
    {
      name: 'duplicated category coding',
      patch: [
        {
          op: 'add' as const,
          path: '/entry/2/resource/category/0/coding/1',
          value: {
            system:
              'http://terminology.hl7.org/CodeSystem/observation-category',
            code: 'vital-signs',
          },
        },
      ],
    },
    {
      name: 'unprofiled Device snapshot',
      patch: [
        {
          op: 'remove' as const,
          path: '/entry/1/resource/meta',
        },
      ],
    },
    {
      name: 'Device snapshot with an additional arbitrary profile',
      patch: [
        {
          op: 'add' as const,
          path: '/entry/1/resource/meta/profile/1',
          value: 'https://example.org/fhir/StructureDefinition/extra-device',
        },
      ],
    },
    {
      name: 'empty contained array in an active graph',
      patch: [
        {
          op: 'add' as const,
          path: '/entry/2/resource/contained',
          value: [],
        },
      ],
    },
    {
      name: 'HealthKit application Device without its product identifier',
      patch: [
        {
          op: 'replace' as const,
          path: '/entry/1/resource/meta/profile/0',
          value:
            'https://grovealliance.org/fhir/healthkit/StructureDefinition/healthkit-application-device',
        },
      ],
    },
    {
      name: 'application Device with an extra identity role',
      patch: [
        {
          op: 'add' as const,
          path: '/entry/1/resource/identifier/1',
          value: {
            system:
              'https://study.example.org/fhir/NamingSystem/grove-source-record-v0/test-key/1',
            value: 'v0:test-key:1:Fz7vAPqR5b-ZOS8DwWQn3q7MogUtBVdlb3vYhRZniGU',
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
        },
      ],
    },
    {
      name: 'relative reference to another Bundle entry',
      patch: [
        {
          op: 'replace' as const,
          path: '/entry/2/resource/subject/reference',
          value: 'Patient/GroveMobileExchangePatientExample',
        },
      ],
    },
    {
      name: 'duplicated active exchange profile claim',
      patch: [
        {
          op: 'add' as const,
          path: '/meta/profile/1',
          value:
            'https://grovealliance.org/fhir/mobile/StructureDefinition/grove-mobile-exchange-bundle',
        },
      ],
    },
    {
      name: 'simultaneous active and retraction profile claims',
      patch: [
        {
          op: 'add' as const,
          path: '/meta/profile/1',
          value:
            'https://grovealliance.org/fhir/mobile/StructureDefinition/grove-mobile-retraction-bundle',
        },
      ],
    },
    {
      name: 'duplicated semantic Observation profile claim',
      patch: [
        {
          op: 'add' as const,
          path: '/entry/2/resource/meta/profile/1',
          value:
            'https://grovealliance.org/fhir/mobile/StructureDefinition/grove-mobile-heart-rate',
        },
      ],
    },
    {
      name: 'adapter output profile under source-neutral Provenance',
      patch: [
        {
          op: 'add' as const,
          path: '/entry/2/resource/meta/profile/1',
          value:
            'https://grovealliance.org/fhir/providers/StructureDefinition/providers-observation',
        },
      ],
    },
    {
      name: 'adapter Provenance targeting a source-neutral output',
      patch: [
        {
          op: 'replace' as const,
          path: '/entry/3/resource/meta/profile/0',
          value:
            'https://grovealliance.org/fhir/providers/StructureDefinition/providers-conversion-provenance',
        },
      ],
    },
    {
      name: 'duplicated transform lifecycle coding',
      patch: [
        {
          op: 'add' as const,
          path: '/entry/3/resource/activity/coding/1',
          value: {
            system: 'http://terminology.hl7.org/CodeSystem/iso-21089-lifecycle',
            code: 'transform',
          },
        },
      ],
    },
    {
      name: 'different ISO lifecycle coding beside transform',
      patch: [
        {
          op: 'add' as const,
          path: '/entry/3/resource/activity/coding/1',
          value: {
            system: 'http://terminology.hl7.org/CodeSystem/iso-21089-lifecycle',
            code: 'originate',
          },
        },
      ],
    },
    {
      name: 'different Grove lifecycle coding in active event',
      patch: [
        {
          op: 'add' as const,
          path: '/entry/3/resource/activity/coding/1',
          value: {
            system:
              'https://grovealliance.org/fhir/mobile/CodeSystem/grove-lifecycle-event',
            code: 'future-lifecycle-code',
          },
        },
      ],
    },
  ])('rejects adversarial $name input', ({ patch }) => {
    expect(
      parseGroveMobileExchangeBundle(patched(bases['mobile-exchange'], patch))
        .ok,
    ).toBe(false)
  })

  it.each([
    {
      name: 'different Grove lifecycle coding beside retraction',
      value: {
        system:
          'https://grovealliance.org/fhir/mobile/CodeSystem/grove-lifecycle-event',
        code: 'future-lifecycle-code',
      },
    },
    {
      name: 'ISO lifecycle coding in retraction event',
      value: {
        system: 'http://terminology.hl7.org/CodeSystem/iso-21089-lifecycle',
        code: 'originate',
      },
    },
  ])('rejects adversarial retraction $name', ({ value }) => {
    expect(
      parseGroveMobileRetractionBundle(
        patched(bases['mobile-retraction'], [
          {
            op: 'add',
            path: '/entry/0/resource/activity/coding/1',
            value,
          },
        ]),
      ).ok,
    ).toBe(false)
  })

  it('rejects even an empty contained array in a retraction graph', () => {
    const result = parseGroveMobileRetractionBundle(
      patched(bases['mobile-retraction'], [
        {
          op: 'add',
          path: '/entry/0/resource/contained',
          value: [],
        },
      ]),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(
        result.issues.some(
          ({ code }) =>
            code === 'mobile-exchange.contained-resource-prohibited',
        ),
      ).toBe(true)
    }
  })
})
