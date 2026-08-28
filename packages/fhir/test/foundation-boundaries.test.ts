//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  compareFhirInstants,
  parseAbsoluteUri,
  parseCanonical,
  parseFhirId,
  parseFhirInstant,
  parsePatientReference,
  parsePositiveInteger,
  parseResearchStudyReference,
  parseSemVer,
} from '../src/core/index.js'
import {
  extensionSchema,
  observationComponentSchema,
  observationSchema,
  periodSchema,
  provenanceSchema,
  referenceSchema,
  sampledDataSchema,
} from '../src/r4/index.js'

const concept = { text: 'test' } as const

describe('foundation primitive boundaries', () => {
  it.each([
    '0.0.0',
    '1.2.3',
    '1.2.3-alpha',
    '1.2.3-alpha.1',
    '1.2.3+001',
    '1.2.3-alpha.1+build.001',
  ])('accepts valid Semantic Versioning value %s', (value) => {
    expect(parseSemVer(value).ok).toBe(true)
  })

  it.each([
    42,
    '',
    '1',
    '1.2',
    '01.2.3',
    '1.02.3',
    '1.2.03',
    '1.2.3-',
    '1.2.3+',
    '1.2.3-alpha..1',
    '1.2.3-01',
    '1.2.3-alpha_1',
    '1.2.3+build..1',
    '1.2.3+build+second',
  ])('rejects invalid Semantic Versioning value %p', (value) => {
    expect(parseSemVer(value).ok).toBe(false)
  })

  it.each([1, 42, Number.MAX_SAFE_INTEGER])(
    'accepts positive safe integer %d',
    (value) => {
      expect(parsePositiveInteger(value).ok).toBe(true)
    },
  )

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, '1'])(
    'rejects non-positive-safe-integer %p',
    (value) => {
      expect(parsePositiveInteger(value).ok).toBe(false)
    },
  )

  it.each([
    ['2024-02-29T23:59:60Z', true],
    ['2000-02-29T00:00:00Z', true],
    ['1900-02-29T00:00:00Z', false],
    ['2026-04-31T00:00:00Z', false],
    ['2026-13-01T00:00:00Z', false],
    ['2026-00-01T00:00:00Z', false],
    ['2026-01-00T00:00:00Z', false],
    ['2026-01-01T24:00:00Z', false],
    ['2026-01-01T00:60:00Z', false],
    ['2026-01-01T00:00:61Z', false],
    ['2026-01-01T00:00:00+14:00', true],
    ['2026-01-01T00:00:00-14:00', true],
    ['2026-01-01T00:00:00+15:00', false],
    ['2026-01-01T00:00:00+01:60', false],
  ] as const)('validates instant calendar boundary %s', (value, accepted) => {
    expect(parseFhirInstant(value).ok).toBe(accepted)
  })

  it.each([
    ['2026-01-01T00:00:00Z', '2026-01-01T00:00:01Z', -1],
    ['2026-01-01T00:00:01Z', '2026-01-01T00:00:00Z', 1],
    ['2026-01-01T00:00:00Z', '2025-12-31T16:00:00-08:00', 0],
    ['2026-01-01T00:00:00.1Z', '2026-01-01T00:00:00.09Z', 1],
    ['2026-01-01T00:00:00.010Z', '2026-01-01T00:00:00.01Z', 0],
    ['2026-01-01T00:00:00.001Z', '2026-01-01T00:00:00.01Z', -1],
  ] as const)(
    'orders %s against %s without precision loss',
    (left, right, expected) => {
      expect(compareFhirInstants(left, right)).toEqual({
        ok: true,
        value: expected,
      })
    },
  )

  it.each([
    [parseAbsoluteUri, 42],
    [parseAbsoluteUri, 'https://example.org/white space'],
    [parseCanonical, 'not absolute'],
    [parseCanonical, 'https://example.org|1|2'],
    [parseFhirId, 42],
    [parseFhirInstant, 42],
  ] as const)(
    'rejects malformed non-reference primitive %p',
    (parser, value) => {
      expect(parser(value).ok).toBe(false)
    },
  )

  it.each([parsePatientReference, parseResearchStudyReference] as const)(
    'enforces exact typed HTTP(S) resource URLs',
    (parser) => {
      const resourceType =
        parser === parsePatientReference ? 'Patient' : 'ResearchStudy'
      const base = `https://care.example/fhir/${resourceType}/example`

      expect(parser(`${resourceType}/example`).ok).toBe(true)
      expect(parser(base).ok).toBe(true)
      expect(
        parser(`http://care.example/fhir/${resourceType}/example`).ok,
      ).toBe(true)
      expect(parser(`ftp://care.example/fhir/${resourceType}/example`).ok).toBe(
        false,
      )
      expect(
        parser(`https://user@care.example/fhir/${resourceType}/example`).ok,
      ).toBe(false)
      expect(
        parser(`https://user:secret@care.example/fhir/${resourceType}/example`)
          .ok,
      ).toBe(false)
      expect(parser(`${base}?_format=json`).ok).toBe(false)
      expect(parser(`${base}#section`).ok).toBe(false)
      expect(parser(`${base}/_history/1`).ok).toBe(false)
      expect(parser(`${base}/`).ok).toBe(false)
      expect(
        parser(` https://care.example/fhir/${resourceType}/example`).ok,
      ).toBe(false)
    },
  )
})

describe('bounded R4 schema invariants', () => {
  it('validates Period ordering while admitting either open endpoint', () => {
    expect(periodSchema.safeParse({ start: '2026-01-01' }).success).toBe(true)
    expect(periodSchema.safeParse({ end: '2026-01-02' }).success).toBe(true)
    expect(
      periodSchema.safeParse({
        start: '2026-01-01T00:00:00Z',
        end: '2026-01-02T00:00:00Z',
      }).success,
    ).toBe(true)
    expect(
      periodSchema.safeParse({
        start: '2026-01-02T00:00:00Z',
        end: '2026-01-01T00:00:00Z',
      }).success,
    ).toBe(false)
  })

  it.each([
    'yesterday',
    '2026-13-01',
    '2026-01-32',
    '2026-01-01T25:00:00Z',
    '2026-01-01T00:00:00',
    '01/02/2026',
  ])('rejects %s, which is not a FHIR dateTime', (start) => {
    expect(periodSchema.safeParse({ start }).success).toBe(false)
  })

  it('reports a malformed date as malformed rather than as being out of order', () => {
    const result = periodSchema.safeParse({
      start: 'yesterday',
      end: '2026-01-02',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((entry) => entry.message)).toEqual([
      'Expected a FHIR dateTime.',
    ])
  })

  it('requires a full instant where R4 says instant, not a bare date', () => {
    expect(
      observationSchema.safeParse({
        resourceType: 'Observation',
        status: 'final',
        code: concept,
        issued: '2026-01-01',
      }).success,
    ).toBe(false)
  })

  it('orders a period whose endpoint carries the leap second R4 permits', () => {
    // Date.parse returns NaN for :60, which once let an out-of-order period through.
    expect(
      periodSchema.safeParse({
        start: '2026-01-01T00:00:60Z',
        end: '2020-01-01T00:00:00Z',
      }).success,
    ).toBe(false)
    expect(
      periodSchema.safeParse({
        start: '2020-01-01T00:00:60Z',
        end: '2026-01-01T00:00:00Z',
      }).success,
    ).toBe(true)
  })

  it('types every temporal field, not only the ones an example happened to use', () => {
    expect(
      provenanceSchema.safeParse({
        resourceType: 'Provenance',
        target: [{ reference: 'Observation/x' }],
        recorded: '2026-01-01T00:00:00Z',
        occurredDateTime: 'yesterday',
        agent: [{ who: { reference: 'Device/x' } }],
      }).success,
    ).toBe(false)
  })

  it('permits nested extensions or one value but never both or two values', () => {
    expect(
      extensionSchema.safeParse({
        url: 'https://example.org/outer',
        extension: [{ url: 'https://example.org/inner', valueString: 'value' }],
      }).success,
    ).toBe(true)
    expect(
      extensionSchema.safeParse({
        url: 'https://example.org/outer',
        extension: [{ url: 'https://example.org/inner' }],
        valueBoolean: true,
      }).success,
    ).toBe(false)
    expect(
      extensionSchema.safeParse({
        url: 'https://example.org/outer',
        valueBoolean: true,
        valueInteger: 1,
      }).success,
    ).toBe(false)
  })

  it('enforces component value and data-absent choice semantics', () => {
    const component = { code: concept }
    expect(
      observationComponentSchema.safeParse({
        ...component,
        valueSampledData: {
          origin: { value: 0 },
          period: 1,
          dimensions: 1,
          data: '1 2 3',
        },
      }).success,
    ).toBe(true)
    expect(
      observationComponentSchema.safeParse({
        ...component,
        valueBoolean: true,
        valueInteger: 1,
      }).success,
    ).toBe(false)
    expect(
      observationComponentSchema.safeParse({
        ...component,
        valueString: 'present',
        dataAbsentReason: concept,
      }).success,
    ).toBe(false)
  })

  it('enforces Observation effective and result choices', () => {
    const base = {
      resourceType: 'Observation',
      status: 'final',
      code: concept,
    } as const

    expect(
      observationSchema.safeParse({
        ...base,
        effectiveDateTime: '2026-01-01T00:00:00Z',
        effectivePeriod: { start: '2026-01-01T00:00:00Z' },
      }).success,
    ).toBe(false)
    expect(
      observationSchema.safeParse({
        ...base,
        valueBoolean: true,
        valueInteger: 1,
      }).success,
    ).toBe(false)
    expect(
      observationSchema.safeParse({
        ...base,
        valueQuantity: { value: 1 },
        dataAbsentReason: concept,
      }).success,
    ).toBe(false)
  })

  it('validates sampled data, references, and populated Provenance entities', () => {
    expect(
      sampledDataSchema.safeParse({
        origin: { value: 0 },
        period: 1,
        dimensions: 2,
        data: '1 2 3 4',
      }).success,
    ).toBe(true)
    expect(
      referenceSchema.safeParse({
        // FHIR R4 Reference.type is a URI naming the resource definition.
        type: 'http://hl7.org/fhir/StructureDefinition/Patient',
        identifier: {
          system: 'https://example.org/patients',
          value: 'patient-1',
        },
      }).success,
    ).toBe(true)
    expect(
      referenceSchema.safeParse({ display: 'missing identity' }).success,
    ).toBe(false)

    const provenance = {
      resourceType: 'Provenance',
      target: [{ reference: 'Observation/example' }],
      occurredPeriod: {
        start: '2026-01-01T00:00:00Z',
        end: '2026-01-01T00:01:00Z',
      },
      recorded: '2026-01-01T00:02:00Z',
      agent: [{ who: { reference: 'Device/application' } }],
      entity: [
        {
          role: 'source',
          what: { reference: 'DocumentReference/source' },
          agent: [{ who: { reference: 'Device/recorder' } }],
        },
      ],
    } as const
    expect(provenanceSchema.safeParse(provenance).success).toBe(true)
    expect(
      provenanceSchema.safeParse({
        ...provenance,
        occurredDateTime: '2026-01-01T00:00:00Z',
      }).success,
    ).toBe(false)
  })
})
