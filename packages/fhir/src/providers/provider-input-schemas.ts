//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'
import { SYSTEMS } from './profiles.js'
import type {
  ProviderPatientReferenceInput,
  ProviderResearchStudyReferenceInput,
} from './types.js'
import { providerAdapterCatalog } from '../contract/providers.generated.js'
import {
  parseAbsoluteUri,
  parseFhirId,
  parseFhirInstant,
  type AbsoluteUri,
  type FhirId,
  type FhirInstant,
  type Issue,
} from '../core/index.js'
import {
  containsIsolatedSurrogate,
  validateDeploymentIdentity,
} from '../mobile/identity.js'
import { canonicalizeMobileEffectiveInstant } from '../mobile/time.js'
import type {
  ApplicationDeviceInput,
  DeploymentIdentityInput,
  GatewayApplicationInput,
  RecordingDeviceInput,
} from '../mobile/types.js'

const primitiveInstantSchemaValue = z
  .string()
  .refine((value) => parseFhirInstant(value).ok, {
    message:
      'Expected an RFC 3339 instant with seconds and an explicit UTC offset.',
  })
export const primitiveInstantSchema: z.ZodString = primitiveInstantSchemaValue

const mobileEffectiveInstantSchemaValue = z
  .string()
  .transform((value, context) => {
    const canonical = canonicalizeMobileEffectiveInstant(value)
    if (!canonical.ok) {
      for (const issue of canonical.issues) {
        context.addIssue({ code: 'custom', message: issue.message })
      }
      return z.NEVER
    }
    return canonical.value
  })
export const mobileEffectiveInstantSchema: z.ZodType<FhirInstant> =
  mobileEffectiveInstantSchemaValue

const nonBlankStringSchemaValue = z
  .string()
  .refine(
    (value) => value.trim() !== '' && !containsIsolatedSurrogate(value),
    'Expected a non-blank Unicode-scalar string.',
  )
export const nonBlankStringSchema: z.ZodString = nonBlankStringSchemaValue

const FHIR_CODE = /^[^\s\p{Cc}]+(?: [^\s\p{Cc}]+)*$/u
const fhirCodeSchema = nonBlankStringSchema.refine(
  (value) => FHIR_CODE.test(value),
  'Expected a FHIR code with no leading, trailing, consecutive, or control whitespace.',
)

// The parser is the proof, so the schema carries the brand the input contract promises.
export const absoluteUriSchema: z.ZodType<AbsoluteUri> = z.custom<AbsoluteUri>(
  (value) => parseAbsoluteUri(value).ok,
  { message: 'Expected an absolute ASCII RFC 3986 URI.' },
)

const identifierInputSchemaValue = z.strictObject({
  system: absoluteUriSchema,
  value: nonBlankStringSchema,
})
export const identifierInputSchema: z.ZodObject<
  { system: z.ZodType<AbsoluteUri>; value: z.ZodString },
  z.core.$strict
> = identifierInputSchemaValue

export type ProviderScopeAssurance =
  'deployment-scoped-account-pseudonym' | 'documented-global-key-space'

export const providerScopeIdentifierSchema: z.ZodType<{
  readonly system: AbsoluteUri
  readonly value: string
  readonly assurance: ProviderScopeAssurance
}> = identifierInputSchema.extend({
  assurance: z.enum([
    'deployment-scoped-account-pseudonym',
    'documented-global-key-space',
  ]),
})

const providerScopeAssuranceByProvider: ReadonlyMap<
  string,
  ProviderScopeAssurance
> = new Map(
  providerAdapterCatalog.providers.map((row) => [
    row.id,
    row.providerScopeMode,
  ]),
)

/** Validates the provider-dependent scope assertion projected from the pinned catalog. */
export const providerScopeIdentifierIssues = (
  provider: string,
  identifier: { readonly assurance: ProviderScopeAssurance },
  path: ReadonlyArray<string | number> = [
    'source',
    'providerScopeIdentifier',
    'assurance',
  ],
): readonly Issue[] => {
  const expected = providerScopeAssuranceByProvider.get(provider)
  if (expected === undefined || identifier.assurance === expected) return []
  return [
    {
      severity: 'error',
      code: 'value-mismatch',
      path,
      message:
        expected === 'deployment-scoped-account-pseudonym' ?
          'This provider has account-scoped native keys and requires a deployment-scoped account pseudonym.'
        : 'This provider has globally unique native keys and requires its documented global key-space pair.',
    },
  ]
}

const governedSourceIdentifierTypeCodingSchema = z.strictObject({
  system: absoluteUriSchema,
  code: fhirCodeSchema,
  display: nonBlankStringSchema.optional(),
})

const governedSourceIdentifierTypeSchema = z
  .strictObject({
    coding: z
      .array(governedSourceIdentifierTypeCodingSchema)
      .nonempty()
      .optional(),
    text: nonBlankStringSchema.optional(),
  })
  .refine((value) => value.coding !== undefined || value.text !== undefined, {
    message: 'Identifier.type requires a non-empty coding or text.',
  })

interface GovernedSourceIdentifierRuntime {
  readonly system: string
  readonly nativeId: string
  readonly type?:
    | {
        readonly coding?:
          | ReadonlyArray<{
              readonly system: string
              readonly code: string
              readonly display?: string | undefined
            }>
          | undefined
        readonly text?: string | undefined
      }
    | undefined
}

const governedSourceIdentifierSchemaValue = z.strictObject({
  system: absoluteUriSchema,
  nativeId: nonBlankStringSchema,
  type: governedSourceIdentifierTypeSchema.optional(),
})
export const governedSourceIdentifierSchema: z.ZodType<GovernedSourceIdentifierRuntime> =
  governedSourceIdentifierSchemaValue

/** Deployment-aware checks the structural disclosure schema cannot decide on its own. */
export const governedSourceIdentifierIssues = (
  disclosure: GovernedSourceIdentifierRuntime | undefined,
  sourceNativeId: string,
  deployment: DeploymentIdentityInput,
): readonly Issue[] => {
  if (disclosure === undefined) return []
  const findings: Issue[] = []
  if (disclosure.nativeId !== sourceNativeId) {
    findings.push({
      severity: 'error',
      code: 'value-mismatch',
      path: ['nativeIdentifierDisclosure', 'nativeId'],
      message:
        'The governed source Identifier value must exactly equal the source-native id used for Grove reconciliation.',
    })
  }
  const groveIdentitySystems = new Set([
    SYSTEMS.groveIdentifierRole,
    deployment.eventIdentifierSystem,
    deployment.entryNodeIdentifierSystem,
    ...Object.values(deployment.opaqueIdentifierSystems),
  ])
  if (groveIdentitySystems.has(disclosure.system)) {
    findings.push({
      severity: 'error',
      code: 'value-mismatch',
      path: ['nativeIdentifierDisclosure', 'system'],
      message:
        'A source-native Identifier requires its own governed provider/store namespace, never a Grove graph-role or identity system.',
    })
  }
  for (const [index, coding] of (disclosure.type?.coding ?? []).entries()) {
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

const providerPatientReferenceSchemaValue = z.strictObject({
  type: z.literal('Patient'),
  identifier: identifierInputSchema.extend({
    assurance: z.literal('deployment-scoped-pseudonym'),
  }),
})
export const providerPatientReferenceSchema: z.ZodType<ProviderPatientReferenceInput> =
  providerPatientReferenceSchemaValue

const providerResearchStudyReferenceSchemaValue = z.strictObject({
  type: z.literal('ResearchStudy'),
  identifier: identifierInputSchema,
})
export const providerResearchStudyReferenceSchema: z.ZodType<ProviderResearchStudyReferenceInput> =
  providerResearchStudyReferenceSchemaValue

// One validator owns the deployment contract; a second field-level copy only diverges.
export const deploymentIdentitySchema: z.ZodType<DeploymentIdentityInput> = z
  .custom<DeploymentIdentityInput>()
  .superRefine((value, context) => {
    const validated = validateDeploymentIdentity(value)
    if (validated.ok) return
    for (const issue of validated.issues) {
      context.addIssue({
        code: 'custom',
        path: [...issue.path],
        message: issue.message,
      })
    }
  })

export const fhirIdSchema: z.ZodType<FhirId> = z.custom<FhirId>(
  (value) => parseFhirId(value).ok,
  { message: 'Expected a FHIR id of 1 to 64 unreserved characters.' },
)

const hostDeviceSchema = z.strictObject({
  sourceDeviceToken: nonBlankStringSchema,
  id: fhirIdSchema.optional(),
  name: nonBlankStringSchema.optional(),
  manufacturer: nonBlankStringSchema.optional(),
  modelNumber: nonBlankStringSchema.optional(),
  operatingSystemVersion: nonBlankStringSchema,
})

const applicationDeviceSchemaValue = z.strictObject({
  sourceDeviceToken: nonBlankStringSchema,
  id: fhirIdSchema.optional(),
  name: nonBlankStringSchema,
  version: nonBlankStringSchema.optional(),
  build: nonBlankStringSchema.optional(),
  manufacturer: nonBlankStringSchema.optional(),
  host: hostDeviceSchema.optional(),
})
export const applicationDeviceSchema: z.ZodType<ApplicationDeviceInput> =
  applicationDeviceSchemaValue

const recordingDeviceBase = {
  stableUnitToken: nonBlankStringSchema,
  subjectIdentifier: identifierInputSchema,
  id: fhirIdSchema.optional(),
  name: nonBlankStringSchema.optional(),
  manufacturer: nonBlankStringSchema.optional(),
  modelNumber: nonBlankStringSchema.optional(),
} as const

const recordingDeviceSchemaValue = z.discriminatedUnion('identityScope', [
  z.strictObject({
    ...recordingDeviceBase,
    identityScope: z.literal('deployment-scoped'),
  }),
  z.strictObject({
    ...recordingDeviceBase,
    identityScope: z.literal('authorized-hardware'),
    disclosureAuthorization: z.literal('authorized-for-exchange'),
  }),
])
export const recordingDeviceSchema: z.ZodType<RecordingDeviceInput> =
  recordingDeviceSchemaValue

const gatewayApplicationSchemaValue = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('converter-application'),
    roleAssurance: z.literal('mediated-or-routed-measurement'),
  }),
  z.strictObject({
    kind: z.literal('distinct-application'),
    roleAssurance: z.literal('mediated-or-routed-measurement'),
    application: applicationDeviceSchema,
  }),
])
export const gatewayApplicationSchema: z.ZodType<GatewayApplicationInput> =
  gatewayApplicationSchemaValue
