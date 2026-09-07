//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { fhirDateTimeToDate } from '../src/core/primitives.js'
import { fhirQuantityToValue } from '../src/core/quantity.js'
import {
  codeableConceptDisplay,
  containsCoding,
} from '../src/extract/coding.js'
import {
  boundsToFhirPeriod,
  carePlanCategoryDisplays,
  carePlanPeriodIsActive,
  codingToCodeableConcept,
  conditionAbatementDate,
  conditionDuration,
  conditionIsActive,
  conditionIsConfirmed,
  conditionOnsetDate,
  dateToFhirDateTime,
  decodeBase64Binary,
  encodeBase64Binary,
  fhirPeriodToBounds,
  immunizationExpirationDate,
  immunizationIsExpired,
  immunizationReactionDisplays,
  immunizationVaccineDisplay,
  scheduledCovers,
  scheduledDuration,
  scheduledIsPast,
  scheduledIsUpcoming,
  slotSpecialtyDisplays,
  toFhirReference,
  valueToFhirQuantity,
} from '../src/extract/index.js'
import { referenceType } from '../src/extract/resource.js'

const CLINICAL = 'http://terminology.hl7.org/CodeSystem/condition-clinical'
const VERIFICATION =
  'http://terminology.hl7.org/CodeSystem/condition-ver-status'

describe('Condition extraction', () => {
  const condition = {
    resourceType: 'Condition',
    clinicalStatus: { coding: [{ system: CLINICAL, code: 'active' }] },
    verificationStatus: {
      coding: [{ system: VERIFICATION, code: 'confirmed' }],
    },
    onsetDateTime: '2020-01-01T00:00:00Z',
  }

  it('lets the clinical status decide, not the absence of an abatement', () => {
    expect(conditionIsActive(condition)).toBe(true)
    // The defect the old accessor had: coded resolved, but no abatement recorded.
    expect(
      conditionIsActive({
        clinicalStatus: { coding: [{ system: CLINICAL, code: 'resolved' }] },
      }),
    ).toBe(false)
    expect(
      conditionIsActive({
        clinicalStatus: { coding: [{ system: CLINICAL, code: 'remission' }] },
      }),
    ).toBe(false)
    expect(
      conditionIsActive({
        clinicalStatus: { coding: [{ system: CLINICAL, code: 'relapse' }] },
      }),
    ).toBe(true)
  })

  it('falls back to abatement only when no status is stated', () => {
    expect(conditionIsActive({ onsetDateTime: '2020-01-01T00:00:00Z' })).toBe(
      true,
    )
    expect(
      conditionIsActive({ abatementDateTime: '2021-01-01T00:00:00Z' }),
    ).toBe(false)
    expect(conditionIsActive({ abatementString: 'last spring' })).toBe(false)
  })

  it('reads onset and abatement from either a dateTime or a period', () => {
    expect(conditionOnsetDate(condition)).toEqual(
      new Date('2020-01-01T00:00:00Z'),
    )
    expect(
      conditionOnsetDate({ onsetPeriod: { start: '2019-06-01T00:00:00Z' } }),
    ).toEqual(new Date('2019-06-01T00:00:00Z'))
    expect(conditionAbatementDate(condition)).toBeUndefined()
  })

  it('reports a duration only when both ends are known', () => {
    expect(conditionDuration(condition)).toBeUndefined()
    expect(
      conditionDuration({
        onsetDateTime: '2020-01-01T00:00:00Z',
        abatementDateTime: '2020-01-02T00:00:00Z',
      }),
    ).toBe(86_400_000)
  })

  it('checks the verification status within its own system', () => {
    expect(conditionIsConfirmed(condition)).toBe(true)
    expect(
      conditionIsConfirmed({
        verificationStatus: {
          coding: [{ system: 'http://example.org', code: 'confirmed' }],
        },
      }),
    ).toBe(false)
  })
})

describe('Immunization extraction', () => {
  const immunization = {
    resourceType: 'Immunization',
    vaccineCode: { text: 'Influenza' },
    expirationDate: '2026-01-01',
    reaction: [{ detail: { text: 'soreness' } }, { detail: {} }],
  }

  it('names the vaccine and its reactions', () => {
    expect(immunizationVaccineDisplay(immunization)).toBe('Influenza')
    expect(immunizationReactionDisplays(immunization)).toEqual(['soreness'])
  })

  it('separates "not known expired" from "known not expired"', () => {
    expect(immunizationExpirationDate(immunization)).toEqual(
      new Date('2026-01-01T00:00:00Z'),
    )
    expect(
      immunizationIsExpired(immunization, new Date('2026-06-01T00:00:00Z')),
    ).toBe(true)
    expect(
      immunizationIsExpired(immunization, new Date('2025-06-01T00:00:00Z')),
    ).toBe(false)
    expect(immunizationIsExpired({})).toBeUndefined()
  })
})

describe('Scheduling extraction', () => {
  const appointment = {
    resourceType: 'Appointment',
    start: '2026-08-20T09:00:00Z',
    end: '2026-08-20T10:00:00Z',
  }

  it('measures the span and places it in time', () => {
    expect(scheduledDuration(appointment)).toBe(3_600_000)
    expect(scheduledCovers(appointment, new Date('2026-08-20T09:30:00Z'))).toBe(
      true,
    )
    expect(scheduledCovers(appointment, new Date('2026-08-20T11:00:00Z'))).toBe(
      false,
    )
  })

  it('does not call an appointment under way past', () => {
    const during = new Date('2026-08-20T09:30:00Z')
    expect(scheduledIsPast(appointment, during)).toBe(false)
    expect(scheduledIsUpcoming(appointment, during)).toBe(false)
    expect(scheduledIsPast(appointment, new Date('2026-08-20T10:00:01Z'))).toBe(
      true,
    )
    expect(scheduledIsPast({})).toBeUndefined()
  })

  it("names a slot's specialties", () => {
    expect(
      slotSpecialtyDisplays({ specialty: [{ text: 'Cardiology' }, {}] }),
    ).toEqual(['Cardiology'])
  })
})

describe('CarePlan extraction', () => {
  it('treats a plan with no period as covering any instant', () => {
    expect(carePlanPeriodIsActive({})).toBe(true)
    expect(
      carePlanPeriodIsActive(
        { period: { end: '2020-01-01T00:00:00Z' } },
        new Date('2026-01-01T00:00:00Z'),
      ),
    ).toBe(false)
  })

  it('names its categories', () => {
    expect(
      carePlanCategoryDisplays({ category: [{ text: 'Assessment' }] }),
    ).toEqual(['Assessment'])
  })
})

describe('Round trips', () => {
  it('carries an instant out and back unchanged', () => {
    const instant = new Date('2026-08-20T09:30:00.250Z')
    const written = dateToFhirDateTime(instant)
    const read = fhirDateTimeToDate(written)
    expect(read.ok && read.value).toEqual(instant)
  })

  it('carries a measurement out and back unchanged', () => {
    const original = {
      value: 72.5,
      unit: 'kg',
      system: 'http://unitsofmeasure.org',
    }
    const written = valueToFhirQuantity(original)
    expect(written.ok).toBe(true)
    const read = written.ok ? fhirQuantityToValue(written.value) : undefined
    expect(read?.ok === true && read.value).toEqual(original)
  })

  it('refuses to write a quantity that carries no measurement', () => {
    expect(valueToFhirQuantity({ value: Number.NaN, unit: 'kg' }).ok).toBe(
      false,
    )
    expect(valueToFhirQuantity({ value: 1, unit: '' }).ok).toBe(false)
  })

  it('carries a period out and back, leaving an open end open', () => {
    const bounds = {
      start: new Date('2026-08-20T09:00:00Z'),
      end: new Date('2026-08-20T10:00:00Z'),
    }
    expect(fhirPeriodToBounds(boundsToFhirPeriod(bounds))).toEqual(bounds)
    const open = { start: new Date('2026-08-20T09:00:00Z') }
    expect(boundsToFhirPeriod(open)).not.toHaveProperty('end')
    expect(fhirPeriodToBounds(boundsToFhirPeriod(open))).toEqual(open)
  })

  it('carries a coding out and back', () => {
    const coding = {
      system: 'http://loinc.org',
      code: '29463-7',
      display: 'Body weight',
    }
    const concept = codingToCodeableConcept(coding)
    expect(codeableConceptDisplay(concept)).toBe('Body weight')
    expect(containsCoding(concept, coding.system, coding.code)).toBe(true)
  })

  it('does not invent a text for a coding that states no display', () => {
    const concept = codingToCodeableConcept({
      system: 'http://loinc.org',
      code: '1234-5',
    })
    expect(concept).not.toHaveProperty('text')
    expect(codeableConceptDisplay(concept)).toBeUndefined()
  })

  it('carries a reference out and back', () => {
    const reference = toFhirReference('Patient', 'p1')
    expect(reference.reference).toBe('Patient/p1')
    expect(referenceType(reference)).toBe('Patient')
  })

  it('carries bytes out and back unchanged', () => {
    const bytes = new Uint8Array([0, 1, 250, 255, 65])
    const written = encodeBase64Binary(bytes)
    const read = decodeBase64Binary(written)
    expect(read.ok && Array.from(read.value)).toEqual(Array.from(bytes))
  })
})
