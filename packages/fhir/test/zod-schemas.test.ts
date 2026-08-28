//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  base64BinarySchema,
  bundleSchema,
  capabilityStatementSchema,
  dateSchema,
  dateTimeSchema,
  decimalSchema,
  medicationAdministrationSchema,
  medicationStatementSchema,
  observationSchema,
  documentReferenceSchema,
  patientSchema,
  positiveIntSchema,
  instantSchema,
  resourceSchema,
  unsignedIntSchema,
  visionPrescriptionSchema,
  xhtmlSchema,
} from '../src/zod/r4/index.js'
import {
  bundleSchema as r4bBundle,
  observationSchema as r4bObservation,
} from '../src/zod/r4b/index.js'

const observation = {
  resourceType: 'Observation',
  id: 'example',
  status: 'final',
  code: {
    coding: [
      // LOINC's canonical FHIR system URI is http by definition: it identifies a code system
      // and is never fetched.
      // eslint-disable-next-line sonarjs/no-clear-text-protocols
      { system: 'http://loinc.org', code: '8867-4', display: 'Heart rate' },
    ],
  },
  subject: { reference: 'Patient/example' },
  effectiveDateTime: '2026-08-20T17:31:01Z',
  valueQuantity: {
    value: 72,
    unit: '/min',
    system: 'http://unitsofmeasure.org',
    code: '/min',
  },
}

describe('generated Zod schemas', () => {
  it('accepts a well-formed Observation', () => {
    expect(observationSchema.parse(observation)).toBeTruthy()
  })

  it('rejects a status outside the required binding', () => {
    // status binds required to ObservationStatus; the enum comes from the release's own ValueSet.
    expect(() =>
      observationSchema.parse({ ...observation, status: 'complete' }),
    ).toThrow()
  })

  it('rejects a malformed dateTime', () => {
    // The regex is the one the release publishes for the dateTime primitive.
    expect(() =>
      observationSchema.parse({
        ...observation,
        effectiveDateTime: '20-08-2026',
      }),
    ).toThrow()
  })

  it('rejects impossible calendar dates and non-finite decimals', () => {
    expect(dateSchema.safeParse('2025-02-29').success).toBe(false)
    expect(dateTimeSchema.safeParse('2026-04-31T12:00:00Z').success).toBe(false)
    expect(instantSchema.safeParse('2026-02-30T12:00:00Z').success).toBe(false)
    expect(dateSchema.safeParse('2024-02-29').success).toBe(true)
    expect(decimalSchema.safeParse(Number.NaN).success).toBe(false)
    expect(decimalSchema.safeParse(Number.POSITIVE_INFINITY).success).toBe(
      false,
    )
  })

  it('rejects empty string-like primitive values', () => {
    expect(base64BinarySchema.safeParse('').success).toBe(false)
    expect(base64BinarySchema.safeParse(' \t\n').success).toBe(false)
    expect(xhtmlSchema.safeParse('').success).toBe(false)
  })

  it('rejects a missing required element', () => {
    const withoutStatus: Record<string, unknown> = { ...observation }
    delete withoutStatus.status
    expect(() => observationSchema.parse(withoutStatus)).toThrow()
  })

  it('accepts required primitives represented only by primitive metadata', () => {
    const absent = {
      extension: [
        {
          // This canonical is fixed by FHIR R4 and is never fetched.
          url: 'http://hl7.org/fhir/StructureDefinition/data-absent-reason',
          valueCode: 'unknown',
        },
      ],
    }
    const withoutStatus: Record<string, unknown> = {
      ...observation,
      _status: absent,
    }
    delete withoutStatus.status
    expect(observationSchema.safeParse(withoutStatus).success).toBe(true)

    expect(
      capabilityStatementSchema.safeParse({
        resourceType: 'CapabilityStatement',
        status: 'active',
        date: '2026-08-27T12:00:00Z',
        kind: 'instance',
        fhirVersion: '4.0.1',
        _format: [absent],
      }).success,
    ).toBe(true)
    expect(
      capabilityStatementSchema.safeParse({
        resourceType: 'CapabilityStatement',
        status: 'active',
        date: '2026-08-27T12:00:00Z',
        kind: 'instance',
        fhirVersion: '4.0.1',
      }).success,
    ).toBe(false)
  })

  it('rejects the wrong resourceType', () => {
    expect(() =>
      observationSchema.parse({ ...observation, resourceType: 'Patient' }),
    ).toThrow()
  })

  it('validates a recursive backbone to its full depth', () => {
    // Questionnaire.item.item is a contentReference back to Questionnaire.item; a nested item
    // with a bad linkId must still be rejected rather than passing as an open record.
    const document = {
      resourceType: 'DocumentReference',
      status: 'current',
      content: [{ attachment: { contentType: 'text/csv' } }],
    }
    expect(documentReferenceSchema.parse(document)).toBeTruthy()
    expect(() =>
      documentReferenceSchema.parse({ ...document, status: 'draft' }),
    ).toThrow()
  })

  it('keeps the extensions a primitive carries', () => {
    // FHIR puts an id or extension on a primitive in a `_`-prefixed sibling. Dropping it would
    // lose data that a conforming producer deliberately sent.
    const withExtension = {
      ...observation,
      _effectiveDateTime: {
        extension: [
          { url: 'http://example.org/precision', valueString: 'second' },
        ],
      },
    }
    const parsed = observationSchema.parse(withExtension) as unknown as Record<
      string,
      unknown
    >
    expect(parsed._effectiveDateTime).toBeDefined()
  })

  it('rejects a property the specification does not define', () => {
    // FHIR JSON is closed: an unmodelled property is an error, not an extension. Stripping it
    // silently would let a misspelled element pass validation.
    expect(() =>
      observationSchema.parse({ ...observation, statuss: 'final' }),
    ).toThrow()
  })

  it('enforces the base Reference presence invariant recursively', () => {
    expect(() =>
      observationSchema.parse({ ...observation, subject: {} }),
    ).toThrow()
    expect(() =>
      observationSchema.parse({
        ...observation,
        subject: { type: 'Patient' },
      }),
    ).toThrow()
  })

  it('requires a Quantity unit system whenever a unit code is present', () => {
    expect(() =>
      observationSchema.parse({
        ...observation,
        valueQuantity: { value: 72, code: '/min' },
      }),
    ).toThrow()
  })

  it('bounds the integer primitives the specification bounds', () => {
    // positiveInt and unsignedInt state their range as a lexical pattern rather than a min.
    expect(() => positiveIntSchema.parse(0)).toThrow()
    expect(positiveIntSchema.parse(1)).toBe(1)
    expect(() => unsignedIntSchema.parse(-1)).toThrow()
    expect(unsignedIntSchema.parse(0)).toBe(0)
  })

  it('parses the same instance under R4B', () => {
    // R4B is a minimal delta over R4 for this surface; an instance valid in one is valid in both.
    expect(r4bObservation.parse(observation)).toBeTruthy()
  })
})

/** A Bundle entry carrying whatever the test wants to put in a polymorphic resource slot. */
const bundleCarrying = (resource: unknown): unknown => ({
  resourceType: 'Bundle',
  type: 'collection',
  entry: [{ resource }],
})

describe('polymorphic resource slots', () => {
  it('rejects a malformed resource inside a Bundle entry', () => {
    // The slot admits any resource, which is not the same as admitting any object: an
    // Observation nested here is the same Observation the package validates anywhere else.
    const result = bundleSchema.safeParse(
      bundleCarrying({ ...observation, status: 'complete' }),
    )
    expect(result.success).toBe(false)
  })

  it('names the element the fault is in, not the entry that carries it', () => {
    const result = bundleSchema.safeParse(
      bundleCarrying({ ...observation, status: 'complete' }),
    )
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual([
      'entry',
      0,
      'resource',
      'status',
    ])
  })

  it('accepts a well-formed resource inside a Bundle entry', () => {
    expect(bundleSchema.parse(bundleCarrying(observation))).toBeTruthy()
  })

  it('rejects a malformed contained resource', () => {
    const result = observationSchema.safeParse({
      ...observation,
      contained: [{ resourceType: 'Patient', gender: 'undisclosed' }],
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['contained', 0, 'gender'])
  })

  it('rejects a malformed entry response outcome', () => {
    const result = bundleSchema.safeParse({
      resourceType: 'Bundle',
      type: 'transaction-response',
      entry: [
        {
          response: {
            status: '201 Created',
            outcome: { ...observation, status: 'complete' },
          },
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('rejects a resource slot holding something that is not a resource', () => {
    expect(bundleSchema.safeParse(bundleCarrying(42)).success).toBe(false)
    expect(bundleSchema.safeParse(bundleCarrying({ id: 'x' })).success).toBe(
      false,
    )
  })

  it('checks a resource type the release publishes', () => {
    // Every resource R4 defines is modelled, so a CarePlan is checked rather than waved through:
    // this one is missing the required intent and subject.
    expect(
      bundleSchema.safeParse(
        bundleCarrying({ resourceType: 'CarePlan', status: 'draft' }),
      ).success,
    ).toBe(false)
  })

  it('rejects a resource type the pinned release does not publish', () => {
    expect(
      bundleSchema.safeParse(
        bundleCarrying({ resourceType: 'SomethingNotInR4', status: 'draft' }),
      ).success,
    ).toBe(false)
  })

  it('validates a Bundle nested inside a Bundle', () => {
    const nested = bundleCarrying(
      bundleCarrying({ ...observation, status: 'complete' }),
    )
    expect(bundleSchema.safeParse(nested).success).toBe(false)
    expect(
      bundleSchema.safeParse(bundleCarrying(bundleCarrying(observation)))
        .success,
    ).toBe(true)
  })

  it('terminates on a resource that contains itself', () => {
    // JSON cannot express this, but an in-memory object handed to safeParse can, and the
    // dispatch would otherwise recur until the stack ran out.
    const cyclic: Record<string, unknown> = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [] as unknown[],
    }
    ;(cyclic.entry as unknown[]).push({ resource: cyclic })
    expect(() => bundleSchema.safeParse(cyclic)).not.toThrow()
  })

  it('dispatches the same way from the exported resource schema', () => {
    expect(resourceSchema.safeParse(observation).success).toBe(true)
    expect(
      resourceSchema.safeParse({ ...observation, status: 'complete' }).success,
    ).toBe(false)
  })

  it('dispatches under R4B too', () => {
    expect(
      r4bBundle.safeParse(
        bundleCarrying({ ...observation, status: 'complete' }),
      ).success,
    ).toBe(false)
    expect(r4bBundle.parse(bundleCarrying(observation))).toBeTruthy()
  })
})

describe('the resources the guides emit', () => {
  const patient = { resourceType: 'Patient', id: 'example' }
  const medicationAdministration = {
    resourceType: 'MedicationAdministration',
    status: 'completed',
    medicationCodeableConcept: { text: 'Aspirin 81 mg' },
    subject: { reference: 'Patient/example' },
    effectiveDateTime: '2026-08-20T12:00:00Z',
  }
  const medicationStatement = {
    resourceType: 'MedicationStatement',
    status: 'active',
    medicationCodeableConcept: { text: 'Aspirin 81 mg' },
    subject: { reference: 'Patient/example' },
  }
  const visionPrescription = {
    resourceType: 'VisionPrescription',
    status: 'active',
    created: '2026-08-20T12:00:00Z',
    patient: { reference: 'Patient/example' },
    dateWritten: '2026-08-20T12:00:00Z',
    prescriber: { reference: 'Practitioner/example' },
    lensSpecification: [{ product: { text: 'lens' }, eye: 'right' }],
  }

  it.each([
    ['Patient', patientSchema, patient, { gender: 'undisclosed' }],
    [
      'MedicationAdministration',
      medicationAdministrationSchema,
      medicationAdministration,
      { status: 'finished' },
    ],
    [
      'MedicationStatement',
      medicationStatementSchema,
      medicationStatement,
      { status: 'ongoing' },
    ],
    [
      'VisionPrescription',
      visionPrescriptionSchema,
      visionPrescription,
      { status: 'live' },
    ],
  ])(
    'validates %s and the slots that carry it',
    (_name, schema, valid, fault) => {
      expect(schema.safeParse(valid).success).toBe(true)
      expect(schema.safeParse({ ...valid, ...fault }).success).toBe(false)
      expect(bundleSchema.safeParse(bundleCarrying(valid)).success).toBe(true)
      expect(
        bundleSchema.safeParse(bundleCarrying({ ...valid, ...fault })).success,
      ).toBe(false)
    },
  )
})
