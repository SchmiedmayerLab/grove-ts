//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'
import { deriveEntryFullUrl } from './identity.js'
import { implementedMeasurementCatalog } from './measurement-catalog.generated.js'
import type {
  CompleteIdentifierInput,
  NormalizedProviderMeasurement,
} from './types.js'
import {
  deepFreeze,
  issues,
  ok,
  parseFhirInstant,
  type Issue,
  type Result,
} from '../core/index.js'

const primitiveInstantSchema = z
  .string()
  .refine((value) => parseFhirInstant(value).ok, {
    message:
      'Expected an RFC 3339 instant with seconds and an explicit UTC offset.',
  })

const identifierInputSchema = z.strictObject({
  system: z.url(),
  value: z.string().trim().min(1),
})

const entryIdentitySchema = z.strictObject({
  fullUrl: z
    .string()
    .regex(
      /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    ),
  id: z
    .string()
    .regex(/^[A-Za-z0-9\-.]{1,64}$/u)
    .optional(),
  identifier: identifierInputSchema,
})

const applicationDeviceSchema = z.strictObject({
  identity: entryIdentitySchema,
  name: z.string().trim().min(1),
  version: z.string().trim().min(1).optional(),
  manufacturer: z.string().trim().min(1).optional(),
})

const recordingDeviceSchema = z.strictObject({
  identity: entryIdentitySchema,
  name: z.string().trim().min(1).optional(),
  manufacturer: z.string().trim().min(1).optional(),
  modelNumber: z.string().trim().min(1).optional(),
  serialNumber: z.string().trim().min(1).optional(),
})

const sourceBase = {
  identifier: identifierInputSchema,
  display: z.string().trim().min(1).optional(),
  recordingMethod: z
    .enum(['actively-recorded', 'automatically-recorded', 'manual-entry'])
    .optional(),
  recordingDevice: recordingDeviceSchema.optional(),
  sourceTypeCoding: z
    .strictObject({
      system: z.url(),
      code: z.string().trim().min(1),
      display: z.string().trim().min(1).optional(),
    })
    .optional(),
} as const

const sourceSchema = z.union([
  z.strictObject({
    ...sourceBase,
    adapter: z.strictObject({ kind: z.literal('mobile') }),
    dataOrigin: applicationDeviceSchema.optional(),
  }),
  z.strictObject({
    ...sourceBase,
    adapter: z.strictObject({
      kind: z.literal('connected-health'),
      provider: z.enum(['google-health', 'oura', 'withings']),
    }),
    dataOrigin: applicationDeviceSchema,
  }),
])

const instantEffectiveSchema = z.strictObject({
  kind: z.literal('date-time'),
  value: primitiveInstantSchema,
})

const periodEffectiveSchema = z
  .strictObject({
    kind: z.literal('period'),
    start: primitiveInstantSchema,
    end: primitiveInstantSchema,
  })
  .refine((value) => Date.parse(value.start) < Date.parse(value.end), {
    message: 'A measurement Period must end after it starts.',
  })

const instantQuantityMeasurementSchema = z.strictObject({
  kind: z.enum([
    'basal-body-temperature',
    'body-height',
    'body-mass-index',
    'body-temperature',
    'body-weight',
    'heart-rate',
    'oxygen-saturation',
    'respiratory-rate',
  ]),
  value: z.number(),
  effective: instantEffectiveSchema,
})

const specimenIdentitySchema = z.strictObject({
  identity: entryIdentitySchema,
})

const glucoseBase = {
  value: z.number().positive(),
  effective: instantEffectiveSchema,
} as const

const wholeBloodGlucoseMeasurementSchema = z.strictObject({
  kind: z.literal('blood-glucose'),
  ...glucoseBase,
  specimen: specimenIdentitySchema,
})

const capillaryBloodGlucoseMeasurementSchema = z.strictObject({
  kind: z.literal('capillary-blood-glucose'),
  ...glucoseBase,
  specimen: specimenIdentitySchema,
})

const interstitialGlucoseMeasurementSchema = z.strictObject({
  kind: z.literal('interstitial-glucose'),
  ...glucoseBase,
  specimen: specimenIdentitySchema,
})

const serumPlasmaGlucoseMeasurementSchema = z.strictObject({
  kind: z.literal('serum-plasma-glucose'),
  ...glucoseBase,
  specimen: z.strictObject({
    identity: entryIdentitySchema,
    specimenKind: z.enum(['plasma', 'serum']),
  }),
})

const periodQuantityMeasurementSchema = z.strictObject({
  kind: z.enum(['active-energy', 'distance', 'sleep-duration', 'step-count']),
  value: z.number().nonnegative(),
  effective: periodEffectiveSchema,
})

const bloodPressureMeasurementSchema = z.strictObject({
  kind: z.literal('blood-pressure'),
  systolic: z.number().positive(),
  diastolic: z.number().positive(),
  effective: instantEffectiveSchema,
})

const sleepStageMeasurementSchema = z.strictObject({
  kind: z.literal('sleep-stage'),
  stage: z.enum(implementedMeasurementCatalog['sleep-stage'].allowedValues),
  sourceStageCoding: z
    .strictObject({
      system: z.url(),
      code: z.string().trim().min(1),
      display: z.string().trim().min(1).optional(),
    })
    .optional(),
  effective: periodEffectiveSchema,
})

export const normalizedProviderMeasurementSchema = z
  .strictObject({
    source: sourceSchema,
    measurement: z.discriminatedUnion('kind', [
      instantQuantityMeasurementSchema,
      periodQuantityMeasurementSchema,
      bloodPressureMeasurementSchema,
      sleepStageMeasurementSchema,
      wholeBloodGlucoseMeasurementSchema,
      capillaryBloodGlucoseMeasurementSchema,
      interstitialGlucoseMeasurementSchema,
      serumPlasmaGlucoseMeasurementSchema,
    ]),
  })
  .superRefine((value, context) => {
    if (
      value.measurement.kind === 'oxygen-saturation' &&
      (value.measurement.value < 0 || value.measurement.value > 100)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['measurement', 'value'],
        message: 'Oxygen saturation must be between 0 and 100 percent.',
      })
    }
    if (
      value.measurement.kind === 'step-count' &&
      !Number.isInteger(value.measurement.value)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['measurement', 'value'],
        message: 'Step count must be an integer.',
      })
    }

    const identities = [
      value.source.recordingDevice?.identity,
      value.source.dataOrigin?.identity,
      ...('specimen' in value.measurement ?
        [value.measurement.specimen.identity]
      : []),
    ].filter((identity) => identity !== undefined)
    for (const identity of identities) {
      const expected = deriveEntryFullUrl(
        identity.identifier as CompleteIdentifierInput,
      )
      if (!expected.ok || expected.value !== identity.fullUrl) {
        context.addIssue({
          code: 'custom',
          path: ['source'],
          message:
            'Device fullUrl must be the IG-defined UUID-v5 derivation of its business identifier.',
        })
      }
    }
  })

const normalizeIssue = (entry: z.core.$ZodIssue): Issue => ({
  severity: 'error',
  code: 'schema-invalid',
  path: entry.path.map((component) =>
    typeof component === 'symbol' ?
      (component.description ?? component.toString())
    : component,
  ),
  message: entry.message,
})

/**
 * Parses the provider-neutral handoff produced by an external provider adapter.
 * Raw provider payload fields are rejected rather than retained or stripped.
 */
export const parseNormalizedProviderMeasurement = (
  input: unknown,
): Result<NormalizedProviderMeasurement> => {
  const result = normalizedProviderMeasurementSchema.safeParse(input)
  if (!result.success) {
    return issues(result.error.issues.map(normalizeIssue))
  }
  return ok(deepFreeze(result.data) as NormalizedProviderMeasurement)
}
