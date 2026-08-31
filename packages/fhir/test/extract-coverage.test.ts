//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  appointmentServiceTypeDisplay,
  boundsToFhirPeriod,
  carePlanCreatedDate,
  carePlanNoteTexts,
  carePlanPeriodEnd,
  carePlanPeriodStart,
  codeableConceptDisplays,
  codingToCodeableConcept,
  conditionCategoryDisplays,
  conditionClinicalStatus,
  conditionCodeDisplay,
  conditionRecordedDate,
  contactPointBySystem,
  contactPointsBySystem,
  containedResource,
  containedResourcesByType,
  dateToFhirDate,
  dateToFhirInstant,
  encodeBase64Binary,
  extensionByUrl,
  extensionsByUrl,
  formatHumanName,
  humanNameParts,
  identifiersByType,
  immunizationNoteTexts,
  immunizationOccurrenceDate,
  immunizationRecordedDate,
  immunizationRouteDisplay,
  immunizationSiteDisplay,
  observationBooleanValue,
  observationCodeDisplay,
  observationEffectiveEnd,
  observationHasCategory,
  observationInterpretationDisplays,
  observationIssuedDate,
  observationQuantity,
  observationStringValue,
  observationValueDisplay,
  patientEmailAddresses,
  patientMaritalStatusDisplay,
  patientName,
  patientPhoneNumbers,
  periodDuration,
  periodOverlaps,
  referenceType,
  scheduledEnd,
  scheduledIsUpcoming,
  slotSpecialtyDisplays,
  toReference,
  valueToFhirQuantity,
} from '../src/extract/index.js'

/**
 * The branches the behavioural tests do not reach.
 *
 * Every accessor takes `unknown`, so each has a guard for input that is not an object and for a
 * field the resource does not state. Those guards are the difference between reporting absence
 * and throwing on a resource a caller has not narrowed yet, so they are worth holding closed.
 */
describe('Guards against unnarrowed input', () => {
  const notResources = [undefined, null, 42, 'text', []] as const

  it('reports absence rather than throwing on anything that is not a resource', () => {
    for (const value of notResources) {
      expect(observationCodeDisplay(value)).toBeUndefined()
      expect(observationQuantity(value)).toBeUndefined()
      expect(observationStringValue(value)).toBeUndefined()
      expect(observationBooleanValue(value)).toBeUndefined()
      expect(observationValueDisplay(value)).toBeUndefined()
      expect(observationIssuedDate(value)).toBeUndefined()
      expect(observationEffectiveEnd(value)).toBeUndefined()
      expect(observationInterpretationDisplays(value)).toEqual([])
      expect(conditionClinicalStatus(value)).toBeUndefined()
      expect(conditionCodeDisplay(value)).toBeUndefined()
      expect(conditionRecordedDate(value)).toBeUndefined()
      expect(conditionCategoryDisplays(value)).toEqual([])
      expect(immunizationSiteDisplay(value)).toBeUndefined()
      expect(immunizationRouteDisplay(value)).toBeUndefined()
      expect(immunizationOccurrenceDate(value)).toBeUndefined()
      expect(immunizationRecordedDate(value)).toBeUndefined()
      expect(immunizationNoteTexts(value)).toEqual([])
      expect(carePlanCreatedDate(value)).toBeUndefined()
      expect(carePlanPeriodStart(value)).toBeUndefined()
      expect(carePlanPeriodEnd(value)).toBeUndefined()
      expect(carePlanNoteTexts(value)).toEqual([])
      expect(patientName(value)).toBeUndefined()
      expect(patientPhoneNumbers(value)).toEqual([])
      expect(patientEmailAddresses(value)).toEqual([])
      expect(patientMaritalStatusDisplay(value)).toBeUndefined()
      expect(slotSpecialtyDisplays(value)).toEqual([])
      expect(appointmentServiceTypeDisplay(value)).toBeUndefined()
      expect(codeableConceptDisplays(value)).toEqual([])
      expect(extensionsByUrl(value, 'http://example.org')).toEqual([])
      expect(containedResourcesByType(value, 'Patient')).toEqual([])
      expect(identifiersByType(value, 'http://example.org', 'x')).toEqual([])
      expect(contactPointsBySystem(value, 'phone')).toEqual([])
      expect(humanNameParts(value)).toEqual([])
      expect(referenceType(value)).toBeUndefined()
      expect(toReference(value).ok).toBe(false)
    }
  })

  it('drops a date that does not parse rather than yielding an invalid one', () => {
    expect(observationIssuedDate({ issued: 'not a date' })).toBeUndefined()
    expect(carePlanCreatedDate({ created: '' })).toBeUndefined()
    expect(periodDuration({ start: 'nope', end: 'also nope' })).toBeUndefined()
  })
})

describe('Accessors not exercised elsewhere', () => {
  it('reads the remaining Observation fields', () => {
    const observation = {
      issued: '2026-08-20T17:00:00Z',
      code: { text: 'Heart rate' },
      valueString: 'irregular',
      interpretation: [{ text: 'High' }, {}],
      effectivePeriod: { end: '2026-08-20T10:00:00Z' },
    }
    expect(observationIssuedDate(observation)).toEqual(
      new Date('2026-08-20T17:00:00Z'),
    )
    expect(observationCodeDisplay(observation)).toBe('Heart rate')
    expect(observationStringValue(observation)).toBe('irregular')
    expect(observationInterpretationDisplays(observation)).toEqual(['High'])
    expect(observationEffectiveEnd(observation)).toEqual(
      new Date('2026-08-20T10:00:00Z'),
    )
    expect(observationBooleanValue({ valueBoolean: false })).toBe(false)
    expect(
      observationValueDisplay({ valueCodeableConcept: { text: 'Positive' } }),
    ).toBe('Positive')
    expect(observationHasCategory({ category: 'not a list' }, 's', 'c')).toBe(
      false,
    )
    // A malformed Quantity is reported as absent, not as a number without its unit.
    expect(observationQuantity({ valueQuantity: { value: 1 } })).toBeUndefined()
  })

  it('reads the remaining Condition and Immunization fields', () => {
    expect(conditionRecordedDate({ recordedDate: '2026-01-01' })).toEqual(
      new Date('2026-01-01T00:00:00Z'),
    )
    expect(conditionCodeDisplay({ code: { text: 'Asthma' } })).toBe('Asthma')
    expect(conditionCategoryDisplays({ category: 'not a list' })).toEqual([])
    expect(
      immunizationOccurrenceDate({
        occurrenceDateTime: '2026-03-01T00:00:00Z',
      }),
    ).toEqual(new Date('2026-03-01T00:00:00Z'))
    expect(immunizationRecordedDate({ recorded: '2026-03-02' })).toEqual(
      new Date('2026-03-02T00:00:00Z'),
    )
    expect(immunizationSiteDisplay({ site: { text: 'Left arm' } })).toBe(
      'Left arm',
    )
    expect(immunizationRouteDisplay({ route: { text: 'Intramuscular' } })).toBe(
      'Intramuscular',
    )
    expect(
      immunizationNoteTexts({ note: [{ text: 'well tolerated' }] }),
    ).toEqual(['well tolerated'])
  })

  it('reads the remaining CarePlan and scheduling fields', () => {
    const plan = {
      created: '2026-01-01T00:00:00Z',
      period: { start: '2026-01-01T00:00:00Z', end: '2026-12-31T00:00:00Z' },
      note: [{ text: 'reviewed' }],
    }
    expect(carePlanCreatedDate(plan)).toEqual(new Date('2026-01-01T00:00:00Z'))
    expect(carePlanPeriodStart(plan)).toEqual(new Date('2026-01-01T00:00:00Z'))
    expect(carePlanPeriodEnd(plan)).toEqual(new Date('2026-12-31T00:00:00Z'))
    expect(carePlanNoteTexts(plan)).toEqual(['reviewed'])
    expect(
      appointmentServiceTypeDisplay({
        serviceType: [{}, { text: 'Dermatology' }],
      }),
    ).toBe('Dermatology')
    expect(
      appointmentServiceTypeDisplay({ serviceType: 'not a list' }),
    ).toBeUndefined()
    expect(slotSpecialtyDisplays({ specialty: 'not a list' })).toEqual([])
    expect(scheduledEnd({ end: '2026-08-20T10:00:00Z' })).toEqual(
      new Date('2026-08-20T10:00:00Z'),
    )
    expect(scheduledIsUpcoming({})).toBeUndefined()
  })

  it('reads the remaining Patient and person fields', () => {
    const patient = {
      name: [{}, { given: ['Ada'], family: 'Lovelace', suffix: ['PhD'] }],
      maritalStatus: { text: 'Married' },
      telecom: [
        { system: 'phone', value: '+1-555-0100', use: 'home' },
        { system: 'phone', value: '+1-555-0199', use: 'work' },
        { system: 'email', value: 'ada@example.org' },
      ],
    }
    expect(patientName(patient)).toBe('Ada Lovelace')
    expect(patientName(patient, { includeSuffix: true })).toBe(
      'Ada Lovelace PhD',
    )
    expect(patientPhoneNumbers(patient)).toHaveLength(2)
    expect(patientEmailAddresses(patient)).toEqual(['ada@example.org'])
    expect(patientMaritalStatusDisplay(patient)).toBe('Married')
    expect(contactPointBySystem(patient, 'phone', 'work')).toBe('+1-555-0199')
    expect(contactPointBySystem(patient, 'phone', 'mobile')).toBeUndefined()
    expect(contactPointBySystem(patient, 'fax')).toBeUndefined()
    expect(patientName({ name: 'not a list' })).toBeUndefined()
    expect(humanNameParts({ given: 'not a list' })).toEqual([])
    expect(formatHumanName({})).toBeUndefined()
  })

  it('reads the remaining resource helpers', () => {
    expect(extensionByUrl({ extension: 'not a list' }, 'x')).toBeUndefined()
    expect(containedResource({ contained: 'not a list' }, '#a')).toBeUndefined()
    expect(containedResource({}, '#')).toBeUndefined()
    expect(containedResource({}, 'no-hash')).toBeUndefined()
    expect(referenceType({ reference: 42 })).toBeUndefined()
    expect(referenceType({ type: '', reference: 'Patient/1' })).toBe('Patient')
    expect(toReference({ resourceType: 'Patient', id: '' }).ok).toBe(false)
    expect(
      identifiersByType({ identifier: [{ value: 'x' }] }, 's', 'c'),
    ).toEqual([])
  })
})

describe('Encoders on their edges', () => {
  it('writes a period that states only an end', () => {
    const end = new Date('2026-08-20T10:00:00Z')
    expect(boundsToFhirPeriod({ end })).toEqual({ end: end.toISOString() })
    expect(boundsToFhirPeriod({})).toEqual({})
  })

  it('carries a comparator through a Quantity', () => {
    const written = valueToFhirQuantity({
      value: 5,
      unit: 'mg',
      comparator: '<',
    })
    expect(written.ok && written.value.comparator).toBe('<')
    expect(written.ok && written.value).not.toHaveProperty('system')
  })

  it('writes the calendar day in UTC rather than the host zone', () => {
    const instant = new Date('2026-08-20T23:30:00Z')
    expect(dateToFhirDate(instant)).toBe('2026-08-20')
    expect(dateToFhirInstant(instant)).toBe('2026-08-20T23:30:00.000Z')
  })

  it('writes a concept without a text when no display is given', () => {
    expect(
      codingToCodeableConcept({ system: 'http://loinc.org', code: '1' }),
    ).toEqual({ coding: [{ system: 'http://loinc.org', code: '1' }] })
  })

  it('encodes empty bytes', () => {
    expect(encodeBase64Binary(new Uint8Array())).toBe('')
  })

  it('overlaps a period that states neither end', () => {
    expect(periodOverlaps({}, new Date(0), new Date())).toBe(true)
  })
})
