//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

/* eslint-disable sonarjs/no-clear-text-protocols -- FHIR R4 fixes the LOINC, UCUM, and Observation category systems to HTTP URIs. */

import { z } from 'zod'
import {
  groveProfileClaims,
  sharedMobileMeasurementCatalog,
} from '../src/mobile/measurement-catalog.generated.js'
import {
  adapterMeasurementCatalog,
  groveProviderProfileCanonicals,
} from '../src/providers/contract.generated.js'
import {
  hasAdmittedMobileObservationProfile,
  validateMobileObservationSemantics,
} from '../src/r4/active-observation-semantics.js'
import { decodeGroveRuleDiagnostic } from '../src/r4/diagnostics.js'

interface MeasurementDefinition {
  readonly id: string
  readonly profile: string
  readonly code: Readonly<{ system: string; code: string }>
  readonly requiredCodings?: ReadonlyArray<
    Readonly<{ system: string; code: string }>
  >
  readonly category?: Readonly<{ system: string; code: string }>
  readonly effective: 'Period' | 'dateTime' | 'dateTime-or-Period'
  readonly method?: Readonly<{ code: string }>
  readonly methodChoice?: readonly string[]
  readonly valueKind:
    'codeableConcept' | 'components' | 'dateTime' | 'grouping' | 'quantity'
  readonly quantity?: Readonly<{
    system: string
    code: string
    unit: string
  }> | null
  readonly resultCodeSystem?: string
  readonly allowedValues?: readonly string[]
  readonly components?: ReadonlyArray<
    Readonly<{
      id: string
      system: string
      code: string
      cardinality?: string
      quantity: Readonly<{ system: string; code: string; unit: string }>
    }>
  >
}

const sharedDefinitions = sharedMobileMeasurementCatalog as unknown as Readonly<
  Record<string, MeasurementDefinition>
>
const healthKitDefinitions = adapterMeasurementCatalog.healthkit as unknown as
  Readonly<Record<string, MeasurementDefinition>> | undefined
const profileCanonicals = groveProviderProfileCanonicals as Readonly<
  Record<string, string>
>
const aggregationSystem =
  'https://grovealliance.org/fhir/mobile/CodeSystem/grove-aggregation-method'

const definition = (
  kind: string,
  owner: 'healthkit' | 'shared' = 'shared',
): MeasurementDefinition => {
  const value =
    owner === 'shared' ? sharedDefinitions[kind] : healthKitDefinitions?.[kind]
  if (value === undefined)
    throw new Error(`Missing ${owner} ${kind} catalog row.`)
  return value
}

const observationFor = (
  row: MeasurementDefinition,
): Record<string, unknown> => {
  const profile = profileCanonicals[row.profile]
  if (profile === undefined)
    throw new Error(`Missing canonical for ${row.profile}.`)
  const observation: Record<string, unknown> = {
    resourceType: 'Observation',
    meta: { profile: [profile] },
    status: 'final',
    code: {
      coding: [row.code, ...(row.requiredCodings ?? [])],
    },
  }
  if (row.category !== undefined) {
    observation.category = [{ coding: [row.category] }]
  }
  if (row.effective === 'Period') {
    observation.effectivePeriod = {
      start: '2026-08-20T00:00:00Z',
      end: '2026-08-20T01:00:00Z',
    }
  } else {
    observation.effectiveDateTime = '2026-08-20T00:00:00Z'
  }
  if (row.method !== undefined) {
    observation.method = {
      coding: [{ system: aggregationSystem, code: row.method.code }],
    }
  } else if (row.methodChoice !== undefined) {
    observation.method = {
      coding: [{ system: aggregationSystem, code: row.methodChoice[0] }],
    }
  }
  switch (row.valueKind) {
    case 'quantity':
      observation.valueQuantity = {
        value: 1,
        system: row.quantity?.system,
        code: row.quantity?.code,
        unit: row.quantity?.unit,
      }
      break
    case 'codeableConcept':
      observation.valueCodeableConcept = {
        coding: [
          {
            system: row.resultCodeSystem,
            code: row.allowedValues?.[0],
          },
        ],
      }
      break
    case 'dateTime':
      observation.valueDateTime = '1985-04-12'
      break
    case 'grouping':
      observation.hasMember = [{ reference: 'Observation/member' }]
      break
    case 'components':
      observation.component = (row.components ?? [])
        .filter(({ cardinality }) => cardinality !== '0..1')
        .map((component) => ({
          code: {
            coding: [{ system: component.system, code: component.code }],
          },
          valueQuantity: {
            value: 1,
            system: component.quantity.system,
            code: component.quantity.code,
            unit: component.quantity.unit,
          },
        }))
      break
  }
  return observation
}

const semanticMessages = (resource: unknown): readonly string[] => {
  const result = z
    .unknown()
    .superRefine((value, context) => {
      validateMobileObservationSemantics(value, context, ['resource'])
    })
    .safeParse(resource)
  return result.success ? [] : result.error.issues.map(({ message }) => message)
}

const expectRule = (resource: unknown, code: string): void => {
  const expectedCode = code.replaceAll('\\', '')
  expect(
    semanticMessages(resource).some((message) => {
      const fallbackSeparator = message.indexOf(': ')
      const actualCode =
        decodeGroveRuleDiagnostic(message)?.code ??
        (fallbackSeparator === -1 ? message : (
          message.slice(0, fallbackSeparator)
        ))
      return actualCode === expectedCode
    }),
  ).toBe(true)
}

describe('catalog-driven Observation semantic boundaries', () => {
  it('admits only complete direct profile modes, including both SensorKit modes', () => {
    const heartRate = observationFor(definition('heart-rate'))
    const platformProfile =
      groveProfileClaims.sensorKitPlatformExclusiveClaims.profiles[0]
    const hybridProfiles =
      groveProfileClaims.sensorKitHybridObservationClaims.profiles

    expect(hasAdmittedMobileObservationProfile(heartRate)).toBe(true)
    expect(
      hasAdmittedMobileObservationProfile({
        resourceType: 'Observation',
        meta: { profile: [platformProfile] },
      }),
    ).toBe(true)
    expect(
      hasAdmittedMobileObservationProfile({
        resourceType: 'Observation',
        meta: { profile: hybridProfiles },
      }),
    ).toBe(true)
    expect(
      semanticMessages({
        resourceType: 'Observation',
        meta: {
          profile: [
            groveProfileClaims.observationAdapterClaim.sharedSensorProfiles[0],
          ],
        },
      }),
    ).toEqual([])
    expect(hasAdmittedMobileObservationProfile(null)).toBe(false)
    expect(
      hasAdmittedMobileObservationProfile({ resourceType: 'Patient' }),
    ).toBe(false)

    for (const profiles of [
      undefined,
      [],
      [42],
      ['https://example.org/unknown'],
      [
        profileCanonicals[definition('heart-rate').profile],
        profileCanonicals[definition('step-count').profile],
      ],
      [
        profileCanonicals[definition('heart-rate').profile],
        profileCanonicals[definition('heart-rate').profile],
      ],
    ]) {
      expect(
        hasAdmittedMobileObservationProfile({
          resourceType: 'Observation',
          meta: { profile: profiles },
        }),
      ).toBe(false)
    }
  })

  it('rejects incomplete connected-provider and general semantic claims', () => {
    const withingsExclusiveDefinition = (
      adapterMeasurementCatalog.withings as unknown as Record<
        string,
        MeasurementDefinition
      >
    )['withings-vascular-age']
    if (withingsExclusiveDefinition === undefined)
      throw new Error('Missing Withings vascular-age catalog row.')
    const withingsExclusive = observationFor(withingsExclusiveDefinition)
    const unknownProfile = structuredClone(
      observationFor(definition('heart-rate')),
    )
    unknownProfile.meta = { profile: ['https://example.org/unknown'] }

    expectRule(unknownProfile, 'mobile-output\\.semantic-profile')
    expect(semanticMessages({ resourceType: 'Patient' })).toEqual([])

    // An owner-specific connected-provider profile is incomplete without its
    // provider envelope and exact marker.
    withingsExclusive.meta = {
      profile: [profileCanonicals[withingsExclusiveDefinition.profile]],
    }
    expectRule(withingsExclusive, 'mobile-output\\.semantic-profile')
  })

  it.each([
    {
      name: 'non-final status',
      mutate: (observation: Record<string, unknown>) => {
        observation.status = 'preliminary'
      },
      code: 'mobile-heart-rate\\.status',
    },
    {
      name: 'missing coding list',
      mutate: (observation: Record<string, unknown>) => {
        observation.code = {}
      },
      code: 'mobile-heart-rate\\.code',
    },
    {
      name: 'duplicate primary code',
      mutate: (observation: Record<string, unknown>) => {
        const code = observation.code as { coding: unknown[] }
        code.coding.push(structuredClone(code.coding[0]))
      },
      code: 'mobile-heart-rate\\.code',
    },
    {
      name: 'wrong primary code',
      mutate: (observation: Record<string, unknown>) => {
        const code = observation.code as {
          coding: Array<Record<string, unknown>>
        }
        code.coding[0] = { system: 'http://loinc.org', code: 'not-admitted' }
      },
      code: 'mobile-heart-rate\\.code',
    },
    {
      name: 'missing category',
      mutate: (observation: Record<string, unknown>) => {
        Reflect.deleteProperty(observation, 'category')
      },
      code: 'mobile-heart-rate\\.category',
    },
    {
      name: 'additional same-system category',
      mutate: (observation: Record<string, unknown>) => {
        const category = observation.category as Array<{
          coding: Array<Record<string, unknown>>
        }>
        category[0]?.coding.push({
          system: 'http://terminology.hl7.org/CodeSystem/observation-category',
          code: 'laboratory',
        })
      },
      code: 'mobile-heart-rate\\.category',
    },
    {
      name: 'neither flexible effective choice',
      mutate: (observation: Record<string, unknown>) => {
        Reflect.deleteProperty(observation, 'effectiveDateTime')
      },
      code: 'mobile-heart-rate\\.effective',
    },
    {
      name: 'both flexible effective choices',
      mutate: (observation: Record<string, unknown>) => {
        observation.effectivePeriod = {
          start: '2026-08-20T00:00:00Z',
          end: '2026-08-20T01:00:00Z',
        }
      },
      code: 'mobile-heart-rate\\.effective',
    },
    {
      name: 'missing quantity value',
      mutate: (observation: Record<string, unknown>) => {
        const quantity = observation.valueQuantity as Record<string, unknown>
        Reflect.deleteProperty(quantity, 'value')
      },
      code: 'mobile-output\\.fixed-quantity-unit',
    },
    ...['system', 'code', 'unit'].map((field) => ({
      name: `invalid quantity ${field}`,
      mutate: (observation: Record<string, unknown>) => {
        const quantity = observation.valueQuantity as Record<string, unknown>
        quantity[field] = 'not-admitted'
      },
      code: 'mobile-output\\.fixed-quantity-unit',
    })),
    {
      name: 'quantity comparator',
      mutate: (observation: Record<string, unknown>) => {
        const quantity = observation.valueQuantity as Record<string, unknown>
        quantity.comparator = '<'
      },
      code: 'mobile-output\\.fixed-quantity-unit',
    },
  ])('rejects a heart-rate Observation with $name', ({ mutate, code }) => {
    const observation = observationFor(definition('heart-rate'))
    mutate(observation)
    expectRule(observation, code)
  })

  it('enforces required supplemental codes and uncategorized measurements', () => {
    const resting = observationFor(definition('resting-heart-rate'))
    expect(semanticMessages(resting)).toEqual([])
    const restingCode = resting.code as { coding: unknown[] }
    restingCode.coding.pop()
    expectRule(resting, 'mobile-resting-heart-rate\\.required-coding')

    const sleep = observationFor(definition('sleep-duration'))
    sleep.category = [
      { coding: [{ system: 'http://loinc.org', code: 'sleep' }] },
    ]
    expectRule(sleep, 'mobile-sleep-duration\\.category')
  })

  it('enforces fixed and choice aggregation methods', () => {
    const fixed = observationFor(definition('deep-sleep-duration'))
    fixed.method = undefined
    expectRule(fixed, 'mobile-deep-sleep-duration\\.method')

    const choice = observationFor(definition('respiratory-rate-average'))
    choice.method = {}
    expectRule(choice, 'mobile-respiratory-rate-average\\.method')
    choice.method = {
      coding: [
        { system: aggregationSystem, code: 'not-admitted' },
        { system: aggregationSystem, code: 'also-not-admitted' },
      ],
    }
    expectRule(choice, 'mobile-respiratory-rate-average\\.method')
  })

  it('enforces bounded effective periods and quantity value domains', () => {
    const weight = observationFor(definition('body-weight'))
    Reflect.deleteProperty(weight, 'effectiveDateTime')
    expectRule(weight, 'mobile-body-weight\\.effective')

    const steps = observationFor(definition('step-count'))
    steps.effectivePeriod = { start: '2026-08-20T00:00:00Z' }
    expectRule(steps, 'mobile-step-count\\.effective')
    steps.effectivePeriod = {
      start: '2026-08-20T00:00:00Z',
      end: '2026-08-20T00:00:00Z',
    }
    expectRule(steps, 'mobile-step-count\\.nonzero-period')
    ;(steps.valueQuantity as Record<string, unknown>).value = -1
    expectRule(steps, 'mobile-step-count\\.value-domain')
    ;(steps.valueQuantity as Record<string, unknown>).value = 0.5
    expectRule(steps, 'mobile-step-count\\.value-domain')

    const saturation = observationFor(definition('oxygen-saturation'))
    ;(saturation.valueQuantity as Record<string, unknown>).value = 100
    expect(semanticMessages(saturation)).toEqual([])
    ;(saturation.valueQuantity as Record<string, unknown>).value = 101
    expectRule(saturation, 'mobile-oxygen-saturation\\.value-domain')
  })

  it('enforces closed coded, date-time, and grouping result shapes', () => {
    const coded = observationFor(definition('intermenstrual-bleeding'))
    expect(semanticMessages(coded)).toEqual([])
    coded.valueCodeableConcept = {}
    expectRule(coded, 'mobile-intermenstrual-bleeding\\.coded-result')
    coded.valueCodeableConcept = {
      coding: [
        { system: 'https://example.org/other', code: 'present' },
        {
          system:
            'https://grovealliance.org/fhir/mobile/CodeSystem/grove-intermenstrual-bleeding',
          code: 'not-admitted',
        },
      ],
    }
    expectRule(coded, 'mobile-intermenstrual-bleeding\\.coded-result')

    const dateOfBirth = observationFor(definition('date-of-birth', 'healthkit'))
    expect(semanticMessages(dateOfBirth)).toEqual([])
    Reflect.deleteProperty(dateOfBirth, 'valueDateTime')
    expectRule(dateOfBirth, 'mobile-date-of-birth\\.date-time-result')

    const food = observationFor(definition('food-correlation', 'healthkit'))
    expect(semanticMessages(food)).toEqual([])
    food.hasMember = 'not-a-reference-list'
    expectRule(food, 'mobile-food-correlation\\.members')
    food.hasMember = []
    expectRule(food, 'mobile-food-correlation\\.members')
  })

  it('enforces distinct required blood-pressure components and their units', () => {
    const row = definition('blood-pressure')
    const missing = observationFor(row)
    missing.component = []
    expectRule(missing, 'mobile-blood-pressure\\.systolic')

    const duplicate = observationFor(row)
    const components = duplicate.component as unknown[]
    components.push(structuredClone(components[0]))
    expectRule(duplicate, 'mobile-blood-pressure\\.systolic')

    const shared = observationFor(row)
    const sharedComponents = shared.component as Array<Record<string, unknown>>
    const first = sharedComponents[0]
    const second = sharedComponents[1]
    if (first === undefined || second === undefined)
      throw new Error('Expected both blood-pressure components.')
    first.code = {
      coding: [
        ...(first.code as { coding: unknown[] }).coding,
        ...(second.code as { coding: unknown[] }).coding,
      ],
    }
    shared.component = [first]
    expectRule(shared, 'mobile-blood-pressure\\.diastolic')

    const malformed = observationFor(row)
    const malformedComponent = (
      malformed.component as Array<Record<string, unknown>>
    )[0]
    if (malformedComponent === undefined)
      throw new Error('Expected a blood-pressure component.')
    malformedComponent.code = {
      coding: [
        { system: 'http://loinc.org', code: '8480-6' },
        { system: 'http://loinc.org', code: 'not-admitted' },
      ],
    }
    const quantity = malformedComponent.valueQuantity as Record<string, unknown>
    quantity.comparator = '<'
    quantity.system = 'https://example.org/not-ucum'
    quantity.code = 'not-admitted'
    quantity.unit = 'not-admitted'
    expectRule(malformed, 'mobile-blood-pressure\\.systolic')

    const audiogram = observationFor(definition('audiogram-panel', 'healthkit'))
    const optionalComponent = definition('audiogram-panel', 'healthkit')
      .components?.[0]
    if (optionalComponent === undefined)
      throw new Error('Expected an optional audiogram component.')
    audiogram.component = [
      {
        code: {
          coding: [
            { system: optionalComponent.system, code: optionalComponent.code },
          ],
        },
        valueQuantity: {},
      },
    ]
    expectRule(audiogram, `mobile-audiogram-panel\\.${optionalComponent.id}`)
  })
})
