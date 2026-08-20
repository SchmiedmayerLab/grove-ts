//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { expectTypeOf } from 'expect-type'
import {
  parseAbsoluteUri,
  parseCanonical,
  parseCollectionBundle,
  parseFhirId,
  parseFhirInstant,
  parseObservation,
  parsePatientReference,
  parseUrnUuid,
  type CollectionBundle,
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
})

describe('validated primitives', () => {
  it.each([
    [parseAbsoluteUri, 'https://example.org/system'],
    [parseCanonical, 'https://example.org/Questionnaire/example|1.2.3'],
    [parseFhirId, 'repository-assigned.1'],
    [parseFhirInstant, '2026-08-20T12:00:00-07:00'],
    [parsePatientReference, 'Patient/example'],
    [parseUrnUuid, 'urn:uuid:94dbe2d8-04fd-4c1e-a4b1-d8b97e38ec54'],
  ] as const)('accepts a valid branded value', (parser, value) => {
    expect(parser(value).ok).toBe(true)
  })

  it.each([
    [parseAbsoluteUri, '/relative'],
    [parseCanonical, 'https://example.org|'],
    [parseFhirId, 'invalid/id'],
    [parseFhirInstant, '2026-08-20T12:00:00'],
    [parsePatientReference, 'Practitioner/example'],
    [parseUrnUuid, 'urn:uuid:NOT-A-UUID'],
  ] as const)('rejects an invalid branded value', (parser, value) => {
    expect(parser(value).ok).toBe(false)
  })
})
