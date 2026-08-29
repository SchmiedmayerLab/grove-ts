//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { expectTypeOf } from 'expect-type'
import { compareFhirInstants, deepFreeze } from '../src/core/index.js'
import { cloneJsonValue } from '../src/core/json.js'
import {
  collectResults,
  err,
  fhirDateTimeToDate,
  fhirQuantityToValue,
  mapResult,
  ok,
  parseAbsoluteUri,
  parseCanonical,
  parseR4CollectionBundle,
  parseDevice,
  parseDocumentReference,
  parseFhirId,
  parseFhirInstant,
  parseObservation,
  parsePatientReference,
  parseProvenance,
  parseResearchStudyReference,
  parseSpecimen,
  parseSupportedR4Resource,
  parseUrnUuid,
  type R4CollectionBundle,
  type DocumentReference,
  type Observation,
  type QuantityValue,
  type Result,
} from '../src/index.js'

const observation = {
  resourceType: 'Observation',
  meta: {
    profile: [
      'https://grovealliance.org/fhir/mobile/StructureDefinition/grove-mobile-observation',
    ],
  },
  identifier: [
    { system: 'https://example.org/measurements', value: 'heart-rate-1' },
  ],
  status: 'final',
  code: {
    // FHIR R4 fixes the canonical LOINC system to this HTTP URI.
    // eslint-disable-next-line sonarjs/no-clear-text-protocols
    coding: [{ system: 'http://loinc.org', code: '8867-4' }],
  },
  subject: { reference: 'Patient/example' },
  effectiveDateTime: '2026-08-20T12:00:00Z',
  valueQuantity: {
    value: 64,
    unit: 'beats/minute',
    system: 'http://unitsofmeasure.org',
    code: '/min',
  },
} as const

describe('deepFreeze', () => {
  it('freezes nested structures', () => {
    const value = deepFreeze({ outer: { inner: [1, 2] } })
    expect(Object.isFrozen(value)).toBe(true)
    expect(Object.isFrozen(value.outer)).toBe(true)
    expect(Object.isFrozen(value.outer.inner)).toBe(true)
  })

  it('terminates on a self-referential object', () => {
    // Freezing before descending is what makes this terminate; freezing afterwards recurses
    // until the stack runs out.
    const cyclic: { name: string; self?: unknown } = { name: 'root' }
    cyclic.self = cyclic
    expect(() => deepFreeze(cyclic)).not.toThrow()
    expect(Object.isFrozen(cyclic)).toBe(true)
  })

  it('terminates on a cycle through an array', () => {
    const parent: { children?: unknown } = {}
    parent.children = [{ parent }]
    expect(() => deepFreeze(parent)).not.toThrow()
    expect(Object.isFrozen(parent)).toBe(true)
  })

  it('still freezes mutable descendants of an already frozen parent', () => {
    const child = { value: 1 }
    const parent = Object.freeze({ child })

    deepFreeze(parent)

    expect(Object.isFrozen(child)).toBe(true)
  })

  it('does not invoke accessors while traversing properties', () => {
    let invocationCount = 0
    const value = Object.defineProperty({}, 'computed', {
      get: () => {
        invocationCount += 1
        return { value: 1 }
      },
      enumerable: true,
    })

    deepFreeze(value)

    expect(invocationCount).toBe(0)
    expect(Object.isFrozen(value)).toBe(true)
  })
})

describe('R4 foundation', () => {
  it('accepts the bounded R4 Observation without modifying admitted data', () => {
    const result = parseObservation(observation)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value).toEqual(observation)
    expect(Object.isFrozen(result.value)).toBe(true)
    expect(Object.isFrozen(result.value.meta)).toBe(true)
    expectTypeOf(result).toExtend<Result<Observation>>()
  })

  it('isolates parsed resources from later caller mutation', () => {
    const input = structuredClone(observation) as unknown as {
      meta: { profile: string[] }
      valueQuantity: { value: number }
    }
    const result = parseObservation(input)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    input.meta.profile.push('https://example.org/changed-after-parse')
    input.valueQuantity.value = 999

    expect(result.value.meta?.profile).toHaveLength(1)
    expect(result.value.valueQuantity?.value).toBe(64)
  })

  const hostileInputs: ReadonlyArray<readonly [string, unknown]> = [
    ['null', null],
    ['undefined', undefined],
    ['bigint', 1n],
    ['non-finite number', Number.NaN],
    ['class instance', new Date()],
    [
      'throwing getter',
      Object.defineProperty({}, 'status', {
        get: () => {
          throw new Error('must not run')
        },
        enumerable: true,
      }),
    ],
    [
      'hostile proxy',
      new Proxy(
        {},
        {
          ownKeys: () => {
            throw new Error('hostile proxy')
          },
        },
      ),
    ],
  ]
  for (const [label, input] of hostileInputs) {
    it(`reports ${label} parser input without throwing`, () => {
      expect(() => parseObservation(input)).not.toThrow()
      expect(parseObservation(input).ok).toBe(false)
    })
  }

  it('reports cyclic parser input without throwing', () => {
    const cyclic: Record<string, unknown> = { ...observation }
    cyclic.self = cyclic
    expect(() => parseObservation(cyclic)).not.toThrow()
    expect(parseObservation(cyclic).ok).toBe(false)
  })

  it('rejects unknown fields instead of silently stripping them', () => {
    const result = parseObservation({
      ...observation,
      vendorPayload: { secret: true },
    })
    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'schema-invalid' }),
      ]),
    )
  })

  it('rejects conflicting FHIR choice elements', () => {
    const result = parseObservation({ ...observation, valueInteger: 64 })
    expect(result.ok).toBe(false)
  })

  it('enforces Extension ext-1 at the bounded R4 boundary', () => {
    expect(
      parseObservation({
        ...observation,
        extension: [{ url: 'https://example.org/empty-extension' }],
      }).ok,
    ).toBe(false)
    expect(
      parseObservation({
        ...observation,
        extension: [
          {
            url: 'https://example.org/valued-extension',
            valueString: 'present',
          },
        ],
      }).ok,
    ).toBe(true)
  })

  it('accepts primitive metadata without discarding it', () => {
    const input = {
      ...observation,
      _effectiveDateTime: {
        extension: [
          {
            url: 'https://example.org/timezone',
            valueString: 'America/Los_Angeles',
          },
        ],
      },
    }
    const result = parseObservation(input)
    expect(result.ok && result.value._effectiveDateTime).toEqual(
      input._effectiveDateTime,
    )
  })

  it('validates collection graphs and internal fullUrls', () => {
    const bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        {
          fullUrl: 'urn:uuid:94dbe2d8-04fd-4c1e-a4b1-d8b97e38ec54',
          resource: observation,
        },
      ],
    }
    const result = parseR4CollectionBundle(bundle)
    expect(result.ok).toBe(true)
    expectTypeOf(result).toExtend<Result<R4CollectionBundle>>()
  })

  it('parses every bounded graph resource and the supported-resource union', () => {
    const device = { resourceType: 'Device', status: 'active' }
    const specimen = {
      resourceType: 'Specimen',
      status: 'available',
      identifier: [
        { system: 'https://example.org/specimens', value: 'specimen-1' },
      ],
      type: {
        // SNOMED CT's normative FHIR system is the HTTP URI.
        // eslint-disable-next-line sonarjs/no-clear-text-protocols
        coding: [{ system: 'http://snomed.info/sct', code: '119361006' }],
      },
      subject: { reference: 'Patient/example' },
    }
    const provenance = {
      resourceType: 'Provenance',
      target: [{ reference: 'Patient/example' }],
      recorded: '2026-08-20T12:00:00Z',
      agent: [{ who: { reference: 'Device/example' } }],
    }
    const documentReference = {
      resourceType: 'DocumentReference',
      identifier: [
        { system: 'https://example.org/recordings', value: 'recording-1' },
      ],
      status: 'current',
      type: { text: 'Provider-native recording' },
      subject: { reference: 'Patient/example' },
      date: '2026-08-20T12:00:00Z',
      author: [{ reference: 'Device/example' }],
      content: [
        {
          attachment: {
            contentType: 'application/octet-stream',
            data: 'AQID',
            size: 3,
            hash: 'cDeAcZjCKn0rCAc3HXY3eahP388=',
            title: 'Authorized minimized provider recording',
          },
        },
      ],
    } as const
    expect(parseDevice(device).ok).toBe(true)
    const parsedDocument = parseDocumentReference(documentReference)
    expect(parsedDocument.ok).toBe(true)
    expectTypeOf(parsedDocument).toExtend<Result<DocumentReference>>()
    expect(
      parseDocumentReference({
        ...documentReference,
        content: [
          {
            attachment: {
              ...documentReference.content[0].attachment,
              size: 2_147_483_648,
            },
          },
        ],
      }).ok,
    ).toBe(false)
    expect(parseSpecimen(specimen).ok).toBe(true)
    expect(parseProvenance(provenance).ok).toBe(true)
    expect(parseSupportedR4Resource(device).ok).toBe(true)
    expect(parseSupportedR4Resource({ resourceType: 'Patient' }).ok).toBe(true)
    // Encounter is not a resource the guides publish, so the graph union must refuse it.
    expect(parseSupportedR4Resource({ resourceType: 'Encounter' }).ok).toBe(
      false,
    )
  })
})

describe('Result composition', () => {
  it('maps success, preserves failure, and collects all issues', () => {
    expect(mapResult(ok(2), (value) => value * 3)).toEqual({
      ok: true,
      value: 6,
    })
    const failure = err('invalid-type', 'wrong value', ['value'])
    expect(mapResult(failure, () => 0)).toEqual(failure)
    expect(collectResults([ok(1), ok(2)])).toEqual({
      ok: true,
      value: [1, 2],
    })
    expect(collectResults([failure, err('invalid-uri', 'bad URI')])).toEqual({
      ok: false,
      issues: [
        {
          severity: 'error',
          code: 'invalid-type',
          path: ['value'],
          message: 'wrong value',
        },
        {
          severity: 'error',
          code: 'invalid-uri',
          path: [],
          message: 'bad URI',
        },
      ],
    })

    const warning = {
      severity: 'warning',
      code: 'external-validation-required',
      path: ['constraint'],
      message: 'Surface this non-blocking constraint.',
    } as const
    expect(mapResult(ok(2, [warning]), (value) => value * 3)).toEqual({
      ok: true,
      value: 6,
      warnings: [warning],
    })
    expect(collectResults([ok(1, [warning]), ok(2)])).toEqual({
      ok: true,
      value: [1, 2],
      warnings: [warning],
    })
  })

  it('reports malformed JavaScript Result inputs without throwing', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    const hostile = new Proxy(
      {},
      {
        get: () => {
          throw new Error('hostile result')
        },
      },
    )
    for (const malformed of [null, undefined, 42, 'invalid', cyclic, hostile]) {
      const map = () =>
        mapResult(malformed as Result<number>, (value) => value * 2)
      const collect = () =>
        collectResults(malformed as ReadonlyArray<Result<number>>)
      expect(map).not.toThrow()
      expect(map().ok).toBe(false)
      expect(collect).not.toThrow()
      expect(collect().ok).toBe(false)
    }
    const collected = collectResults([
      ok(1),
      { ok: false, issues: null } as unknown as Result<number>,
    ])
    expect(collected.ok).toBe(false)
    if (!collected.ok) {
      expect(collected.issues).toContainEqual(
        expect.objectContaining({ code: 'invalid-type', path: [1] }),
      )
    }

    const validIssue = {
      severity: 'error',
      code: 'invalid-type',
      path: ['value'],
      message: 'Invalid value.',
    } as const
    const malformedIssues = [
      null,
      { ...validIssue, severity: 'fatal' },
      { ...validIssue, code: 42 },
      { ...validIssue, path: 'value' },
      { ...validIssue, path: [true] },
      { ...validIssue, message: 42 },
      { ...validIssue, reason: 42 },
      { ...validIssue, location: 42 },
    ]
    for (const malformedIssue of malformedIssues) {
      expect(
        mapResult(
          {
            ok: true,
            value: 1,
            warnings: [malformedIssue],
          } as unknown as Result<number>,
          (value) => value,
        ).ok,
      ).toBe(false)
    }
  })
})

describe('hostile JSON snapshots', () => {
  it('rejects symbol properties and non-data array elements', () => {
    const object = { value: 1, [Symbol('metadata')]: 2 }
    const array = [1]
    Object.defineProperty(array, '0', {
      enumerable: true,
      get: () => 1,
    })

    expect(cloneJsonValue(object).ok).toBe(false)
    expect(cloneJsonValue(array).ok).toBe(false)
  })

  it('rejects extra array properties and invalid nested values', () => {
    const arrayWithProperty = [1] as number[] & { label?: string }
    arrayWithProperty.label = 'not JSON array data'

    expect(cloneJsonValue(arrayWithProperty).ok).toBe(false)
    expect(cloneJsonValue([Number.POSITIVE_INFINITY]).ok).toBe(false)
    expect(cloneJsonValue({ nested: Number.NaN }).ok).toBe(false)
  })
})

describe('validated primitives', () => {
  it.each([
    [parseAbsoluteUri, 'https://example.org/system'],
    [parseCanonical, 'https://example.org/Questionnaire/example|1.2.3'],
    [parseFhirId, 'repository-assigned.1'],
    [parseFhirInstant, '2026-08-20T12:00:00-07:00'],
    [parsePatientReference, 'Patient/example'],
    [parsePatientReference, 'https://care.example/fhir/Patient/example'],
    [parseResearchStudyReference, 'ResearchStudy/example'],
    [
      parseResearchStudyReference,
      'https://research.example/fhir/ResearchStudy/example',
    ],
    [parseUrnUuid, 'urn:uuid:94dbe2d8-04fd-4c1e-a4b1-d8b97e38ec54'],
  ] as const)('accepts a valid branded value', (parser, value) => {
    expect(parser(value).ok).toBe(true)
  })

  it.each([
    [parseAbsoluteUri, '/relative'],
    [parseCanonical, 42],
    [parseCanonical, 'https://example.org|'],
    [parseFhirId, 'invalid/id'],
    [parseFhirInstant, '2026-08-20T12:00:00'],
    [parseFhirInstant, '2026-02-30T12:00:00Z'],
    [parseFhirInstant, '0000-01-01T12:00:00Z'],
    [parseFhirInstant, '2026-08-20T12:00:00+14:01'],
    [parsePatientReference, 'Practitioner/example'],
    [parsePatientReference, 'https://care.example/fhir/Patient/example/'],
    [
      parsePatientReference,
      'https://care.example/fhir/Patient/example?_format=json',
    ],
    [
      parsePatientReference,
      'https://care.example/fhir/Patient/example#section',
    ],
    [
      parsePatientReference,
      'https://care.example/fhir/Patient/example/_history/2',
    ],
    [parseResearchStudyReference, 'fhir/ResearchStudy/example'],
    [parseResearchStudyReference, 42],
    [
      parseResearchStudyReference,
      'https://research.example/fhir/ResearchStudy/example?_format=json',
    ],
    [
      parseResearchStudyReference,
      'https://research.example/fhir/ResearchStudy/example/_history/2',
    ],
    [parseUrnUuid, 'urn:uuid:NOT-A-UUID'],
  ] as const)('rejects an invalid branded value', (parser, value) => {
    expect(parser(value).ok).toBe(false)
  })

  it('rejects an invalid instant comparison before ordering', () => {
    expect(compareFhirInstants('not-an-instant', 42).ok).toBe(false)
  })
})

const dateOf = (value: unknown): string => {
  const result = fhirDateTimeToDate(value)
  expect(result.ok).toBe(true)
  return result.ok ? result.value.toISOString() : ''
}

describe('native accessors', () => {
  it.each([
    ['2026-08-20T12:00:00Z', '2026-08-20T12:00:00.000Z'],
    ['2026-08-20T12:00:00.123456Z', '2026-08-20T12:00:00.123Z'],
    ['2026-08-20T14:30:00+02:30', '2026-08-20T12:00:00.000Z'],
    // A leap second belongs to the second it names, which is the one that follows it.
    ['2016-12-31T23:59:60Z', '2017-01-01T00:00:00.000Z'],
    // Lower precision names a period; the accessor resolves it to that period's start.
    ['2026-08-20', '2026-08-20T00:00:00.000Z'],
    ['2026-08', '2026-08-01T00:00:00.000Z'],
    ['2026', '2026-01-01T00:00:00.000Z'],
    // Well before the epoch, where the seconds and the fraction have opposite signs.
    ['1969-07-20T20:17:40.5Z', '1969-07-20T20:17:40.500Z'],
  ])('reads %s as an instant', (value, expected) => {
    expect(dateOf(value)).toBe(expected)
  })

  it.each([
    [42],
    ['20-08-2026'],
    ['2026-02-30'],
    ['0000'],
    ['2026-13'],
    // FHIR states no dateTime without an offset once a time is present.
    ['2026-08-20T12:00:00'],
  ])('refuses %s rather than inventing an instant', (value) => {
    expect(fhirDateTimeToDate(value).ok).toBe(false)
  })

  it('reads a Quantity as its code, not its label', () => {
    const result = fhirQuantityToValue({
      value: 64,
      unit: 'beats/minute',
      system: 'http://unitsofmeasure.org',
      code: '/min',
    })
    expect(result.ok && result.value).toEqual({
      value: 64,
      unit: '/min',
      system: 'http://unitsofmeasure.org',
    })
  })

  it('falls back to the display unit when no code is stated', () => {
    const result = fhirQuantityToValue({ value: 3, unit: 'steps' })
    expect(result.ok && result.value).toEqual({ value: 3, unit: 'steps' })
  })

  it('keeps a comparator rather than reporting a bound as a measurement', () => {
    const result = fhirQuantityToValue({
      value: 5,
      code: 'mg',
      comparator: '<',
    })
    expect(result.ok && result.value.comparator).toBe('<')
  })

  it.each([
    [undefined],
    [{ unit: 'mg' }],
    [{ value: Number.NaN, unit: 'mg' }],
    [{ value: 1 }],
    [{ value: 1, unit: '' }],
    [{ value: 1, code: 'mg', comparator: '!=' }],
  ])('refuses a Quantity it cannot reduce', (value) => {
    expect(fhirQuantityToValue(value).ok).toBe(false)
  })

  it('states the value and unit as types rather than as unknowns', () => {
    const result = fhirQuantityToValue({ value: 1, code: 'mg' })
    if (!result.ok) throw new Error('expected a reduced Quantity')
    expectTypeOf(result.value).toEqualTypeOf<QuantityValue>()
    expectTypeOf(result.value.value).toEqualTypeOf<number>()
    expectTypeOf(result.value.unit).toEqualTypeOf<string>()
  })
})
