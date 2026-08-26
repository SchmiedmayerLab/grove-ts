//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { expectTypeOf } from 'expect-type'
import { observationSchema, type IssueSeverity } from '../src/index.js'
import { groveObservationSchema, parseObservation } from '../src/r4/index.js'

const heartRate = {
  resourceType: 'Observation',
  status: 'final',
  code: { coding: [{ system: 'http://loinc.org', code: '8867-4' }] },
  effectiveDateTime: '2024-03-01T10:00:00Z',
  valueQuantity: {
    value: 62,
    unit: 'beats/minute',
    system: 'http://unitsofmeasure.org',
    code: '/min',
  },
} as const

const withField = (field: string, value: unknown): unknown => ({
  ...heartRate,
  [field]: value,
})

describe('the Observation profile', () => {
  it('accepts a conforming measurement', () => {
    expect(groveObservationSchema.safeParse(heartRate).success).toBe(true)
  })

  it.each([
    ['an unknown field', withField('valueQuantiy', 1)],
    [
      'an unknown field two levels down',
      withField('code', {
        coding: [{ system: 'http://loinc.org', code: '8867-4', bogus: 1 }],
      }),
    ],
    [
      'an unknown field three levels down',
      withField('valueQuantity', {
        value: 1,
        extension: [{ url: 'https://x.example', valueString: 's', nope: 1 }],
      }),
    ],
    [
      'a choice element the profile omits',
      withField('valuePeriod', {
        start: '2024-01-01',
      }),
    ],
    ['two populated value[x]', withField('valueString', 'x')],
    ['a malformed effectiveDateTime', withField('effectiveDateTime', 'x2024x')],
    [
      'an identifier without a system',
      withField('identifier', [{ value: 'a' }]),
    ],
    [
      'a period whose end precedes its start',
      {
        ...heartRate,
        effectiveDateTime: undefined,
        effectivePeriod: {
          start: '2024-05-01T00:00:00Z',
          end: '2024-01-01T00:00:00Z',
        },
      },
    ],
  ])('rejects %s', (_label, value) => {
    expect(groveObservationSchema.safeParse(value).success).toBe(false)
  })

  it.each([
    [
      'a complete identifier',
      'identifier',
      [{ system: 'https://x.example', value: 'a' }],
    ],
    ['Observation.method', 'method', { coding: [{ code: 'mean' }] }],
    ['Observation.bodySite', 'bodySite', { coding: [{ code: 'wrist' }] }],
  ])('accepts %s', (_label, field, value) => {
    expect(
      groveObservationSchema.safeParse(withField(field, value)).success,
    ).toBe(true)
  })

  it('reports failures through the result channel rather than throwing', () => {
    const result = parseObservation(withField('valueQuantiy', 1))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0]?.severity).toBe('error')
    }
  })

  it('freezes what it returns', () => {
    const result = parseObservation(heartRate)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(Object.isFrozen(result.value)).toBe(true)
      expect(Object.isFrozen(result.value.code)).toBe(true)
    }
  })
})

describe('the base R4B surface alongside it', () => {
  it('still accepts and strips an unknown field, as it always did', () => {
    const parsed = observationSchema.parse(withField('valueQuantiy', 1))
    expect(parsed).not.toHaveProperty('valueQuantiy')
  })

  it('still accepts values the profile refuses', () => {
    expect(
      observationSchema.safeParse(withField('valuePeriod', { start: '2024' }))
        .success,
    ).toBe(true)
  })

  it('keeps IssueSeverity meaning the OperationOutcome value set', () => {
    // The profiles' own parse-issue severity is `ParseIssueSeverity`, so this name did not move.
    expectTypeOf<IssueSeverity>().toEqualTypeOf<
      'fatal' | 'error' | 'warning' | 'information'
    >()
  })
})
