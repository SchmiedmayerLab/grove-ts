//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'
import { SYSTEMS } from './profiles.js'
import type { ProviderConversionOptions, WriterRecord } from './types.js'
import {
  parseAbsoluteUri,
  parseFhirInstant,
  type AbsoluteUri,
  type Issue,
} from '../core/index.js'
import {
  containsIsolatedSurrogate,
  type OpaqueIdentityScope,
} from '../mobile/identity.js'
import { canonicalizeMobileEffectiveInstant } from '../mobile/time.js'
import type {
  ApplicationDevice,
  GovernedSourceIdentifierDisclosurePolicy,
  InstantEffectiveTime,
  PeriodEffectiveTime,
  RecordingDevice,
} from '../mobile/types.js'
import {
  groveRuleParameters,
  type ClientRecordRule,
} from '../r4/diagnostics.js'

// A refinement that refuses the record under one registry code; the parser rebuilds the
// Issue from these params, so the local text stays the detail and the reason stays the registry's.
export const refusal = (
  code: ClientRecordRule,
  message: string,
): {
  readonly message: string
  readonly params: Readonly<Record<string, unknown>>
} => ({
  message,
  params: groveRuleParameters(code, [], { message }),
})

const unicodeScalarText = z
  .string()
  .refine(
    (value) => !containsIsolatedSurrogate(value),
    refusal(
      'mobile-input.text-not-unicode-scalar',
      'A source text field contains an unpaired UTF-16 surrogate.',
    ),
  )

const nonBlankTextValue = unicodeScalarText.refine(
  (value) => value.trim() !== '',
  refusal('mobile-input.value-shape-invalid', 'Expected a non-blank string.'),
)
export const nonBlankText: z.ZodString = nonBlankTextValue

const nativeIdentifierTextValue = unicodeScalarText.refine(
  (value) => value.trim() !== '',
  refusal(
    'mobile-input.native-identifier-invalid',
    'The source-native record identifier is blank.',
  ),
)
export const nativeIdentifierText: z.ZodString = nativeIdentifierTextValue

/** An absolute URI inside a source record; a malformed one is a refused record. */
export const sourceAbsoluteUri: z.ZodType<AbsoluteUri> = z.custom<AbsoluteUri>(
  (value) => parseAbsoluteUri(value).ok,
  refusal(
    'mobile-input.value-shape-invalid',
    'Expected an absolute ASCII RFC 3986 URI.',
  ),
)

/** An absolute URI inside deployment configuration; a malformed one is a fault. */
const absoluteUriSchema = z.custom<AbsoluteUri>(
  (value) => parseAbsoluteUri(value).ok,
  { message: 'Expected an absolute ASCII RFC 3986 URI.' },
)

const sourceIdentifierSchema = z.strictObject({
  system: sourceAbsoluteUri,
  value: unicodeScalarText.refine(
    (value) => value !== '',
    refusal(
      'mobile-input.value-shape-invalid',
      'Identifier.value must not be empty.',
    ),
  ),
})

const mobileEffectiveInstantSchema = z.string().transform((value, context) => {
  const canonical = canonicalizeMobileEffectiveInstant(value)
  if (!canonical.ok) {
    for (const issue of canonical.issues) {
      context.addIssue({
        code: 'custom',
        ...refusal('mobile-input.effective-period-invalid', issue.message),
      })
    }
    return z.NEVER
  }
  return canonical.value
})

const instantEffectiveSchemaValue = z.strictObject({
  kind: z.literal('date-time'),
  value: mobileEffectiveInstantSchema,
})

const periodEffectiveSchemaValue = z
  .strictObject({
    kind: z.literal('period'),
    start: mobileEffectiveInstantSchema,
    end: mobileEffectiveInstantSchema,
  })
  .refine(
    (value) => {
      const start = parseFhirInstant(value.start)
      const end = parseFhirInstant(value.end)
      return (
        start.ok && end.ok && Date.parse(start.value) <= Date.parse(end.value)
      )
    },
    refusal(
      'mobile-input.effective-period-invalid',
      'A measurement Period must not end before it starts.',
    ),
  )
export const instantEffectiveSchema: z.ZodType<InstantEffectiveTime> =
  instantEffectiveSchemaValue
export const periodEffectiveSchema: z.ZodType<PeriodEffectiveTime> =
  periodEffectiveSchemaValue
export const effectiveTimeSchema: z.ZodType<
  InstantEffectiveTime | PeriodEffectiveTime
> = z.discriminatedUnion('kind', [
  instantEffectiveSchemaValue,
  periodEffectiveSchemaValue,
])

const applicationDeviceSchemaValue = z.strictObject({
  sourceDeviceToken: nonBlankText,
  name: nonBlankText,
  version: nonBlankText.optional(),
  build: nonBlankText.optional(),
})
export const applicationDeviceSchema: z.ZodType<ApplicationDevice> =
  applicationDeviceSchemaValue

const recordingDeviceSchemaValue = z.strictObject({
  stableUnitToken: nonBlankText,
  name: nonBlankText.optional(),
  manufacturer: nonBlankText.optional(),
  modelNumber: nonBlankText.optional(),
})
export const recordingDeviceSchema: z.ZodType<RecordingDevice> =
  recordingDeviceSchemaValue

const writerRecordSchemaValue = z.strictObject({
  applicationIdentifier: sourceIdentifierSchema,
  nativeRecordId: nativeIdentifierText,
  version: z
    .string()
    .regex(
      /^(?:0|[1-9]\d*)$/u,
      refusal(
        'mobile-input.native-identifier-invalid',
        'A writer record version is a canonical non-negative decimal.',
      ),
    )
    .optional(),
})
export const writerRecordSchema: z.ZodType<WriterRecord> =
  writerRecordSchemaValue

const FHIR_CODE = /^[^\s\p{Cc}]+(?: [^\s\p{Cc}]+)*$/u
const fhirCodeSchema = z
  .string()
  .refine(
    (value) => FHIR_CODE.test(value),
    'Expected a FHIR code with no leading, trailing, consecutive, or control whitespace.',
  )
const configurationText = z
  .string()
  .refine(
    (value) => value.trim() !== '' && !containsIsolatedSurrogate(value),
    'Expected a non-blank Unicode-scalar string.',
  )

const disclosureCodingSchema = z.strictObject({
  system: absoluteUriSchema,
  code: fhirCodeSchema,
  display: configurationText.optional(),
})

const disclosurePolicySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('omit') }),
  z.strictObject({
    kind: z.literal('authorized'),
    system: absoluteUriSchema,
    type: z
      .strictObject({
        coding: z
          .tuple([disclosureCodingSchema], disclosureCodingSchema)
          .optional(),
        text: configurationText.optional(),
      })
      .refine(
        (value) => value.coding !== undefined || value.text !== undefined,
        {
          message: 'Identifier.type requires a non-empty coding or text.',
        },
      )
      .optional(),
  }),
])

const conversionOptionsSchemaValue = z.strictObject({
  nativeIdentifierDisclosure: disclosurePolicySchema.optional(),
})
export const conversionOptionsSchema: z.ZodType<ProviderConversionOptions> =
  conversionOptionsSchemaValue

/** Deployment-aware checks the structural disclosure schema cannot decide on its own. */
export const governedSourceIdentifierIssues = (
  policy: GovernedSourceIdentifierDisclosurePolicy,
  scope: OpaqueIdentityScope,
): readonly Issue[] => {
  if (policy.kind === 'omit') return []
  const findings: Issue[] = []
  const groveIdentitySystems = new Set<string>([
    SYSTEMS.groveIdentifierRole,
    scope.systems.event,
    scope.systems.entryNode,
    ...Object.values(scope.systems.opaque),
  ])
  if (groveIdentitySystems.has(policy.system)) {
    findings.push({
      severity: 'error',
      code: 'value-mismatch',
      path: ['nativeIdentifierDisclosure', 'system'],
      message:
        'A source-native Identifier requires its own governed provider/store namespace, never a Grove graph-role or identity system.',
    })
  }
  for (const [index, coding] of (policy.type?.coding ?? []).entries()) {
    if (coding.system === SYSTEMS.groveIdentifierRole) {
      findings.push({
        severity: 'error',
        code: 'value-mismatch',
        path: ['nativeIdentifierDisclosure', 'type', 'coding', index, 'system'],
        message:
          'A source-native Identifier.type must not claim a Grove graph identity role.',
      })
    }
  }
  return findings
}
