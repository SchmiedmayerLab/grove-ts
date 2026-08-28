//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'
import { providerAdapterCatalog } from './contract.generated.js'
import { SYSTEMS } from './profiles.js'
import type {
  ProviderPatientReferenceInput,
  ProviderResearchStudyReferenceInput,
} from './types.js'
import {
  parseAbsoluteUri,
  parseFhirInstant,
  type FhirInstant,
  type Issue,
} from '../core/index.js'
import { containsIsolatedSurrogate } from '../mobile/identity.js'
import { groveExchangeProtocol } from '../mobile/measurement-catalog.generated.js'
import { canonicalizeMobileEffectiveInstant } from '../mobile/time.js'
import type {
  ApplicationDeviceInput,
  DeploymentIdentityInput,
  GatewayApplicationInput,
  GroveOpaqueIdentityKind,
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

export const absoluteUriSchema: z.ZodString = z
  .string()
  .refine((value) => parseAbsoluteUri(value).ok, {
    message: 'Expected an absolute ASCII RFC 3986 URI.',
  })

const identifierInputSchemaValue = z.strictObject({
  system: absoluteUriSchema,
  value: nonBlankStringSchema,
})
export const identifierInputSchema: z.ZodObject<
  { system: z.ZodString; value: z.ZodString },
  z.core.$strict
> = identifierInputSchemaValue

export type ProviderScopeAssurance =
  'deployment-scoped-account-pseudonym' | 'documented-global-key-space'

export const providerScopeIdentifierSchema: z.ZodType<{
  readonly system: string
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
  providerPatientReferenceSchemaValue as unknown as z.ZodType<ProviderPatientReferenceInput>

const providerResearchStudyReferenceSchemaValue = z.strictObject({
  type: z.literal('ResearchStudy'),
  identifier: identifierInputSchema,
})
export const providerResearchStudyReferenceSchema: z.ZodType<ProviderResearchStudyReferenceInput> =
  providerResearchStudyReferenceSchemaValue as unknown as z.ZodType<ProviderResearchStudyReferenceInput>

const opaqueIdentifierSystemShape = Object.fromEntries(
  groveExchangeProtocol.opaqueIdentity.identityKinds.map(({ kind }) => [
    kind,
    absoluteUriSchema,
  ]),
) as Record<GroveOpaqueIdentityKind, z.ZodString>

const deploymentIdentitySchemaValue = z.strictObject({
  opaqueIdentifierSystems: z.strictObject(opaqueIdentifierSystemShape),
  eventIdentifierSystem: absoluteUriSchema,
  entryNodeIdentifierSystem: absoluteUriSchema,
  keyId: z.string().regex(/^[A-Za-z0-9._-]+$/u),
  keyEpoch: z.string().regex(/^[1-9]\d*$/u),
  secretBase64Url: z.string().regex(/^[A-Za-z0-9_-]+$/u),
  producerInstance: z
    .string()
    .regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    ),
})
export const deploymentIdentitySchema: z.ZodType<DeploymentIdentityInput> =
  deploymentIdentitySchemaValue as unknown as z.ZodType<DeploymentIdentityInput>

const fhirIdSchemaValue = z.string().regex(/^[A-Za-z0-9\-.]{1,64}$/u)
export const fhirIdSchema: z.ZodString = fhirIdSchemaValue

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
  applicationDeviceSchemaValue as unknown as z.ZodType<ApplicationDeviceInput>

const recordingDeviceBase = {
  stableUnitToken: nonBlankStringSchema,
  subjectIdentifier: identifierInputSchema,
  id: fhirIdSchema.optional(),
  name: nonBlankStringSchema.optional(),
  manufacturer: nonBlankStringSchema.optional(),
  modelNumber: nonBlankStringSchema.optional(),
} as const

export const recordingDeviceSchema: z.ZodType<RecordingDeviceInput> =
  z.discriminatedUnion('identityScope', [
    z.strictObject({
      ...recordingDeviceBase,
      identityScope: z.literal('deployment-scoped'),
    }),
    z.strictObject({
      ...recordingDeviceBase,
      identityScope: z.literal('authorized-hardware'),
      disclosureAuthorization: z.literal('authorized-for-exchange'),
    }),
  ]) as unknown as z.ZodType<RecordingDeviceInput>

export const gatewayApplicationSchema: z.ZodType<GatewayApplicationInput> =
  z.discriminatedUnion('kind', [
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
