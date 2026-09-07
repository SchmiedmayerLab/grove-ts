//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  codeableConceptDisplay,
  codeableConceptDisplays,
  codesBySystem,
  containedResource,
  containedResourcesByType,
  containsCoding,
  decodeBase64Binary,
  extensionByUrl,
  extensionsByUrl,
  formatHumanName,
  humanNameParts,
  identifierBySystem,
  identifierByType,
  identifiersBySystem,
  isReferenceToType,
  observationEffectiveDate,
  observationEffectiveOverlaps,
  observationHasCategory,
  observationNoteTexts,
  observationNumericValue,
  observationUnit,
  patientAgeInYears,
  patientBirthDate,
  patientIsDeceased,
  patientName,
  periodDuration,
  periodIsActive,
  periodOverlaps,
  referenceType,
  toReference,
} from '../src/extract/index.js'

const LOINC = 'http://loinc.org'

describe('CodeableConcept extraction', () => {
  const concept = {
    coding: [
      { system: LOINC, code: '29463-7', display: 'Body weight' },
      { system: 'http://snomed.info/sct', code: '27113001' },
    ],
    text: 'Weight',
  }

  it('prefers the text the source chose over the terminology label', () => {
    expect(codeableConceptDisplay(concept)).toBe('Weight')
    expect(codeableConceptDisplay({ coding: concept.coding })).toBe(
      'Body weight',
    )
  })

  it('reports no display rather than falling back to the bare code', () => {
    expect(
      codeableConceptDisplay({ coding: [{ system: LOINC, code: '1234-5' }] }),
    ).toBeUndefined()
    expect(codeableConceptDisplay(undefined)).toBeUndefined()
  })

  it('lists displays and selects codes by system', () => {
    expect(codeableConceptDisplays(concept)).toEqual(['Body weight'])
    expect(codesBySystem(concept, LOINC)).toEqual(['29463-7'])
    expect(codesBySystem(concept, 'http://example.org')).toEqual([])
  })

  it('matches a coding only when the system matches too', () => {
    expect(containsCoding(concept, LOINC, '29463-7')).toBe(true)
    expect(containsCoding(concept, 'http://example.org', '29463-7')).toBe(false)
  })
})

describe('Period extraction', () => {
  const period = { start: '2026-08-20T09:00:00Z', end: '2026-08-20T10:00:00Z' }

  it('treats an absent period as unbounded rather than as never', () => {
    expect(periodIsActive(undefined)).toBe(true)
    expect(periodOverlaps(undefined, new Date(0), new Date())).toBe(false)
  })

  it('reads both ends inclusively', () => {
    expect(periodIsActive(period, new Date('2026-08-20T09:00:00Z'))).toBe(true)
    expect(periodIsActive(period, new Date('2026-08-20T10:00:00Z'))).toBe(true)
    expect(periodIsActive(period, new Date('2026-08-20T10:00:01Z'))).toBe(false)
  })

  it('leaves an open end open instead of defaulting it to now', () => {
    const open = { start: '2020-01-01T00:00:00Z' }
    expect(periodIsActive(open, new Date('2099-01-01T00:00:00Z'))).toBe(true)
    expect(periodDuration(open)).toBeUndefined()
    expect(periodDuration(period)).toBe(3_600_000)
  })

  it('overlaps a range that touches only at an edge', () => {
    expect(
      periodOverlaps(
        period,
        new Date('2026-08-20T10:00:00Z'),
        new Date('2026-08-21T00:00:00Z'),
      ),
    ).toBe(true)
  })
})

describe('Observation extraction', () => {
  const observation = {
    resourceType: 'Observation',
    status: 'final',
    code: {
      coding: [{ system: LOINC, code: '29463-7', display: 'Body weight' }],
    },
    category: [
      {
        coding: [
          {
            system:
              'http://terminology.hl7.org/CodeSystem/observation-category',
            code: 'vital-signs',
          },
        ],
      },
    ],
    effectiveDateTime: '2026-08-20T09:30:00Z',
    valueQuantity: {
      value: 72.5,
      unit: 'kg',
      code: 'kg',
      system: 'http://unitsofmeasure.org',
    },
    note: [
      { text: 'measured after breakfast' },
      { authorString: 'no text here' },
    ],
  }

  it('reads the effective instant as a Date', () => {
    expect(observationEffectiveDate(observation)).toEqual(
      new Date('2026-08-20T09:30:00Z'),
    )
  })

  it('falls back to the start of an effective period', () => {
    const period = {
      effectivePeriod: {
        start: '2026-08-20T09:00:00Z',
        end: '2026-08-20T10:00:00Z',
      },
    }
    expect(observationEffectiveDate(period)).toEqual(
      new Date('2026-08-20T09:00:00Z'),
    )
    expect(observationEffectiveDate({})).toBeUndefined()
  })

  it('reads the quantity as a value and a comparable unit', () => {
    expect(observationNumericValue(observation)).toBe(72.5)
    expect(observationUnit(observation)).toBe('kg')
    expect(
      observationNumericValue({ valueString: 'not a number' }),
    ).toBeUndefined()
  })

  it('matches a category only within its system', () => {
    expect(
      observationHasCategory(
        observation,
        'http://terminology.hl7.org/CodeSystem/observation-category',
        'vital-signs',
      ),
    ).toBe(true)
    expect(
      observationHasCategory(observation, 'http://example.org', 'vital-signs'),
    ).toBe(false)
  })

  it('takes only the notes that carry text', () => {
    expect(observationNoteTexts(observation)).toEqual([
      'measured after breakfast',
    ])
  })

  it('reports whether the effective instant falls in a range', () => {
    expect(
      observationEffectiveOverlaps(
        observation,
        new Date('2026-08-20T00:00:00Z'),
        new Date('2026-08-21T00:00:00Z'),
      ),
    ).toBe(true)
    expect(
      observationEffectiveOverlaps(
        observation,
        new Date('2026-08-21T00:00:00Z'),
        new Date('2026-08-22T00:00:00Z'),
      ),
    ).toBe(false)
  })
})

describe('Patient extraction', () => {
  const patient = {
    resourceType: 'Patient',
    id: 'p1',
    name: [{ given: ['Ada'], family: 'Lovelace', prefix: ['Ms'] }],
    birthDate: '1985-04-12',
    telecom: [
      { system: 'phone', value: '+1-555-0100', use: 'home' },
      { system: 'email', value: 'ada@example.org' },
    ],
  }

  it('reads the birth date as the UTC start of the day', () => {
    expect(patientBirthDate(patient)).toEqual(new Date('1985-04-12T00:00:00Z'))
  })

  it('computes age in UTC so the birthday does not shift by a day', () => {
    expect(patientAgeInYears(patient, new Date('2026-04-11T23:59:59Z'))).toBe(
      40,
    )
    expect(patientAgeInYears(patient, new Date('2026-04-12T00:00:00Z'))).toBe(
      41,
    )
    expect(patientAgeInYears({}, new Date())).toBeUndefined()
  })

  it('stops ageing a patient at their recorded death', () => {
    const deceased = { ...patient, deceasedDateTime: '2005-04-12T00:00:00Z' }
    expect(patientAgeInYears(deceased, new Date('2026-01-01T00:00:00Z'))).toBe(
      20,
    )
    expect(patientIsDeceased(deceased)).toBe(true)
    expect(patientIsDeceased(patient)).toBe(false)
    expect(patientIsDeceased({ deceasedBoolean: true })).toBe(true)
  })

  it('formats a name, including the prefix only when asked', () => {
    expect(patientName(patient)).toBe('Ada Lovelace')
    expect(patientName(patient, { includePrefix: true })).toBe(
      'Ms Ada Lovelace',
    )
    expect(humanNameParts({ text: 'Family Given' })).toEqual(['Family Given'])
    expect(formatHumanName(undefined)).toBeUndefined()
  })
})

describe('Identifier extraction', () => {
  const resource = {
    identifier: [
      { system: 'http://example.org/mrn', value: '123' },
      { system: 'http://example.org/mrn', value: '456' },
      {
        system: 'http://example.org/ssn',
        value: '789',
        type: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
              code: 'SS',
            },
          ],
        },
      },
    ],
  }

  it('selects by system and by type', () => {
    expect(identifiersBySystem(resource, 'http://example.org/mrn')).toEqual([
      '123',
      '456',
    ])
    expect(identifierBySystem(resource, 'http://example.org/mrn')).toBe('123')
    expect(
      identifierByType(
        resource,
        'http://terminology.hl7.org/CodeSystem/v2-0203',
        'SS',
      ),
    ).toBe('789')
  })

  it('accepts a resource whose identifier is a single object', () => {
    expect(
      identifierBySystem({ identifier: { system: 'x', value: 'one' } }, 'x'),
    ).toBe('one')
  })
})

describe('Resource helpers', () => {
  const resource = {
    resourceType: 'Observation',
    id: 'obs1',
    extension: [
      { url: 'http://example.org/a', valueString: 'first' },
      { url: 'http://example.org/a', valueString: 'second' },
      { url: 'http://example.org/b', valueBoolean: true },
    ],
    contained: [
      { resourceType: 'Patient', id: 'inner' },
      { resourceType: 'Device', id: 'dev' },
    ],
  }

  it('selects extensions by url', () => {
    expect(extensionsByUrl(resource, 'http://example.org/a')).toHaveLength(2)
    expect(extensionByUrl(resource, 'http://example.org/b')).toEqual({
      url: 'http://example.org/b',
      valueBoolean: true,
    })
    expect(extensionsByUrl(resource, 'http://example.org/missing')).toEqual([])
  })

  it('resolves a contained resource only through a local reference', () => {
    expect(containedResource(resource, '#inner')).toEqual({
      resourceType: 'Patient',
      id: 'inner',
    })
    expect(containedResource(resource, 'Patient/inner')).toBeUndefined()
    expect(containedResourcesByType(resource, 'Device')).toHaveLength(1)
  })

  it('reads a reference type from the literal when none is stated', () => {
    expect(referenceType({ reference: 'Patient/123' })).toBe('Patient')
    expect(
      referenceType({
        reference: 'https://ex.org/fhir/Observation/9/_history/2',
      }),
    ).toBe('Observation')
    expect(referenceType({ type: 'Device', reference: 'urn:uuid:abc' })).toBe(
      'Device',
    )
    expect(referenceType({ reference: 'urn:uuid:abc' })).toBeUndefined()
    expect(isReferenceToType({ reference: 'Patient/123' }, 'Patient')).toBe(
      true,
    )
  })

  it('refuses to build a reference to a resource with no id', () => {
    expect(toReference(resource)).toEqual({
      ok: true,
      value: 'Observation/obs1',
    })
    expect(toReference({ resourceType: 'Observation' }).ok).toBe(false)
  })

  it('decodes base64 across whitespace and rejects malformed input', () => {
    const decoded = decodeBase64Binary('QUJD RA==')
    expect(decoded.ok).toBe(true)
    expect(decoded.ok && Array.from(decoded.value)).toEqual([65, 66, 67, 68])
    expect(decodeBase64Binary('ABC').ok).toBe(false)
    expect(decodeBase64Binary(42).ok).toBe(false)
  })
})
