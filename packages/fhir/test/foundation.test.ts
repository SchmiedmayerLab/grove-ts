//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { expectTypeOf } from 'expect-type'
import { compareFhirInstants } from '../src/core/index.js'
import {
  collectResults,
  err,
  mapResult,
  ok,
  parseAbsoluteUri,
  parseCanonical,
  parseCollectionBundle,
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
  type CollectionBundle,
  type DocumentReference,
  type Observation,
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
    const result = parseCollectionBundle(bundle)
    expect(result.ok).toBe(true)
    expectTypeOf(result).toExtend<Result<CollectionBundle>>()
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
    expect(parseSupportedR4Resource({ resourceType: 'Patient' }).ok).toBe(false)
  })
})

describe('Result composition', () => {
  it('maps success, preserves failure, and collects all issues', () => {
    expect(mapResult(ok(2), (value) => value * 3)).toEqual({
      ok: true,
      value: 6,
    })
    const failure = err('invalid-type', 'wrong value', ['value'])
    expect(mapResult(failure, () => 0)).toBe(failure)
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
