//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { expectTypeOf } from 'expect-type'
import type { Observation as R4Observation } from 'fhir/r4.js'
import type { FhirJson } from '../src/r4/index.js'
import {
  STRUCTURAL_SCHEMA_CAPABILITIES as r4Capabilities,
  STRUCTURAL_SCHEMA_SOURCE as r4Source,
  capabilityStatementSchema as r4CapabilityStatementSchema,
  canonicalSchema as r4CanonicalSchema,
  extensionSchema as r4ExtensionSchema,
  humanNameSchema as r4HumanNameSchema,
  observationSchema as r4ObservationSchema,
  quantitySchema as r4QuantitySchema,
  questionnaireResponseItemAnswerSchema as r4QuestionnaireResponseItemAnswerSchema,
  uriSchema as r4UriSchema,
  urlSchema as r4UrlSchema,
} from '../src/zod/r4/index.js'
import {
  STRUCTURAL_SCHEMA_CAPABILITIES as r4bCapabilities,
  STRUCTURAL_SCHEMA_SOURCE as r4bSource,
  capabilityStatementSchema as r4bCapabilityStatementSchema,
  canonicalSchema as r4bCanonicalSchema,
  extensionSchema as r4bExtensionSchema,
  humanNameSchema as r4bHumanNameSchema,
  observationSchema as r4bObservationSchema,
  quantitySchema as r4bQuantitySchema,
  questionnaireResponseItemAnswerSchema as r4bQuestionnaireResponseItemAnswerSchema,
  uriSchema as r4bUriSchema,
  urlSchema as r4bUrlSchema,
} from '../src/zod/r4b/index.js'

const releases = [
  {
    name: 'R4',
    capabilities: r4Capabilities,
    source: r4Source,
    capabilityStatement: r4CapabilityStatementSchema,
    canonical: r4CanonicalSchema,
    extension: r4ExtensionSchema,
    humanName: r4HumanNameSchema,
    observation: r4ObservationSchema,
    quantity: r4QuantitySchema,
    questionnaireAnswer: r4QuestionnaireResponseItemAnswerSchema,
    uri: r4UriSchema,
    url: r4UrlSchema,
  },
  {
    name: 'R4B',
    capabilities: r4bCapabilities,
    source: r4bSource,
    capabilityStatement: r4bCapabilityStatementSchema,
    canonical: r4bCanonicalSchema,
    extension: r4bExtensionSchema,
    humanName: r4bHumanNameSchema,
    observation: r4bObservationSchema,
    quantity: r4bQuantitySchema,
    questionnaireAnswer: r4bQuestionnaireResponseItemAnswerSchema,
    uri: r4bUriSchema,
    url: r4bUrlSchema,
  },
] as const

describe.each(releases)('$name generated FHIR JSON boundary', (release) => {
  it('accepts required primitives carried only by metadata', () => {
    const absent = {
      extension: [
        {
          // Fixed by FHIR R4/R4B and never fetched.
          url: 'http://hl7.org/fhir/StructureDefinition/data-absent-reason',
          valueCode: 'unknown',
        },
      ],
    }
    expect(
      release.observation.safeParse({
        resourceType: 'Observation',
        _status: absent,
        code: { text: 'Unavailable measurement' },
      }).success,
    ).toBe(true)
    expect(
      release.capabilityStatement.safeParse({
        resourceType: 'CapabilityStatement',
        status: 'active',
        date: '2026-08-27T12:00:00Z',
        kind: 'instance',
        fhirVersion: '4.0.1',
        _format: [absent],
      }).success,
    ).toBe(true)
  })

  it('accepts aligned repeating primitive null slots and metadata', () => {
    const metadata = (label: string) => ({
      extension: [
        {
          url: 'https://example.org/fhir/StructureDefinition/slot-metadata',
          valueString: label,
        },
      ],
    })
    expect(release.humanName.safeParse({ given: ['Ada'] }).success).toBe(true)
    expect(
      release.humanName.safeParse({
        given: [null],
        _given: [metadata('extension-only')],
      }).success,
    ).toBe(true)
    expect(
      release.humanName.safeParse({
        given: [null, 'Ada', null],
        _given: [metadata('leading'), null, metadata('trailing')],
      }).success,
    ).toBe(true)
  })

  it('rejects unaligned, empty, and doubly empty primitive slots', () => {
    expect(
      release.humanName.safeParse({
        given: ['Ada'],
        _given: [{ id: 'first' }, { id: 'extra' }],
      }).success,
    ).toBe(false)
    expect(
      release.humanName.safeParse({ given: [null], _given: [null] }).success,
    ).toBe(false)
    expect(release.humanName.safeParse({ given: [] }).success).toBe(false)
    expect(release.humanName.safeParse({ _given: [] }).success).toBe(false)
  })

  it('counts primitive shadow properties as their value choice', () => {
    const extensionOnly = {
      url: 'https://example.org/fhir/StructureDefinition/outer',
      _valueString: {
        extension: [
          {
            url: 'https://example.org/fhir/StructureDefinition/inner',
            valueBoolean: true,
          },
        ],
      },
    }
    expect(release.extension.safeParse(extensionOnly).success).toBe(true)
    expect(
      release.extension.safeParse({
        ...extensionOnly,
        _valueBoolean: { id: 'second-choice' },
      }).success,
    ).toBe(false)
    expect(
      release.questionnaireAnswer.safeParse({
        _valueString: {
          extension: [
            {
              url: 'https://example.org/fhir/StructureDefinition/answer-source',
              valueString: 'extension-only answer',
            },
          ],
        },
      }).success,
    ).toBe(true)
  })

  it('rejects empty primitive metadata objects', () => {
    expect(
      release.humanName.safeParse({ given: [null], _given: [{}] }).success,
    ).toBe(false)
    expect(
      release.humanName.safeParse({
        given: [null],
        _given: [{ id: 'id-is-not-content' }],
      }).success,
    ).toBe(false)
    expect(
      release.extension.safeParse({
        url: 'https://example.org/fhir/StructureDefinition/outer',
        _valueString: {},
      }).success,
    ).toBe(false)
  })

  it('applies core invariants to primitive metadata-only values', () => {
    const metadata = {
      extension: [
        {
          url: 'https://example.org/fhir/StructureDefinition/metadata',
          valueString: 'present',
        },
      ],
    }
    expect(
      release.observation.safeParse({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'Unavailable measurement' },
        dataAbsentReason: { text: 'Unknown' },
        _valueString: metadata,
      }).success,
    ).toBe(false)
    expect(
      release.observation.safeParse({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'Measured value' },
        referenceRange: [{ _text: metadata }],
      }).success,
    ).toBe(true)
    expect(release.quantity.safeParse({ _code: metadata }).success).toBe(false)
    expect(
      release.quantity.safeParse({
        _code: metadata,
        _system: metadata,
      }).success,
    ).toBe(true)
  })

  it('rejects empty emitted canonical, uri, and url primitives', () => {
    expect(release.canonical.safeParse('').success).toBe(false)
    expect(release.uri.safeParse('').success).toBe(false)
    expect(release.url.safeParse('').success).toBe(false)
  })

  it('states its decimal and conformance capability limits', () => {
    expect(release.capabilities).toEqual({
      fullFhirPath: false,
      preservesDecimalLexemesAfterJsonParse: false,
      normativeConformanceValidator: 'official-fhir-validator',
    })
  })

  it('publishes its exact pinned package generation source', () => {
    expect(release.source.fhirVersion).toBe(
      release.name === 'R4' ? '4.0.1' : '4.3.0',
    )
    expect(release.source.packageVersion).toBe(release.source.fhirVersion)
    expect(release.source.structureCount).toBeGreaterThan(200)
    expect(release.source.archiveSha512).toMatch(/^[\da-f]{128}$/u)
  })
})

it('types primitive JSON values as optional when a shadow can carry them', () => {
  type WireObservation = FhirJson<R4Observation>
  expectTypeOf<WireObservation['status']>().toEqualTypeOf<
    R4Observation['status'] | undefined
  >()
})
