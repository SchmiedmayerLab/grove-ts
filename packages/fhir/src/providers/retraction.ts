//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'
import {
  concept,
  deduplicateIdentifiedEntries,
  identifiedEntry,
  identifier,
  makeApplicationDevice,
  makeHostDevice,
  resourceId,
} from './graph.js'
import {
  deriveApplicationEntryIdentity,
  deriveDeviceSnapshotEntryIdentity,
  deriveProviderIdentities,
  type DeviceSnapshotRole,
} from './identity.js'
import {
  EXTENSIONS,
  PROFILES,
  PROVIDER_RECORDING_OUTPUT_DISCRIMINATOR,
  PROVIDER_RECORDING_OUTPUT_ROLE,
  SYSTEMS,
} from './profiles.js'
import { absoluteUriSchema } from './provider-input-schemas.js'
import {
  applicationDeviceSchema,
  deploymentIdentitySchema,
  fhirIdSchema,
  nonBlankStringSchema,
  primitiveInstantSchema,
  providerScopeIdentifierIssues,
  providerScopeIdentifierSchema,
} from './provider.js'
import type {
  ConnectedProvider,
  ProviderScopeIdentifierInput,
} from './types.js'
import { type groveExchangeProtocol } from '../contract/measurement-catalog.generated.js'
import {
  providerAdapterCatalog,
  providerRawOutputRoles,
  providerScalarOutputDiscriminators,
  providerScalarOutputRoles,
} from '../contract/providers.generated.js'
import {
  cloneJsonValue,
  deepFreeze,
  issues,
  zodIssueToIssue,
  type AbsoluteUri,
  type FhirId,
  type FhirInstant,
  type Issue,
  type Result,
} from '../core/index.js'
import { groveMobileContract } from '../mobile/contract.js'
import {
  createEntryIdentity,
  deriveEventIdentifier,
  deriveOpaqueIdentifier,
  validateDeploymentIdentity,
} from '../mobile/identity.js'
import type {
  ApplicationDeviceInput,
  CompleteIdentifierInput,
  DeploymentIdentityInput,
} from '../mobile/types.js'
import {
  parseGroveMobileRetractionBundle,
  type GroveMobileRetractionBundle,
} from '../r4/index.js'

export type RetractionTargetRole =
  keyof typeof groveExchangeProtocol.lifecycle.retraction.targetRoles

/**
 * The adapter's own record key for one retracted target, carried verbatim.
 *
 * It never participates in Grove identity and carries no Grove identifier-role coding.
 */
export interface ProviderRetractionTargetNativeIdentifierInput {
  readonly system: AbsoluteUri
  readonly value: string
}

interface ProviderRetractionTargetCommon {
  readonly nativeIdentifier?: ProviderRetractionTargetNativeIdentifierInput
}

export type ProviderRetractionTargetInput =
  | (ProviderRetractionTargetCommon & {
      readonly role: 'primary-output'
      readonly resourceType: 'Observation'
      /** Exact closed output role used when the active Observation was emitted. */
      readonly outputRole: string
      /** Exact closed discriminator paired with the output role in the catalog. */
      readonly outputDiscriminator: string
    })
  | (ProviderRetractionTargetCommon & {
      readonly role: 'source-artifact'
      readonly resourceType: 'DocumentReference'
      readonly formatCode: 'provider-recording'
      readonly partIndex: '0'
    })
  | (ProviderRetractionTargetCommon & {
      readonly role: 'device-snapshot'
      readonly resourceType: 'Device'
      readonly priorEventSequence: string
      readonly deviceRole: DeviceSnapshotRole
      readonly sourceDeviceToken: string
    })

export interface ProviderRetractionInput<
  Provider extends ConnectedProvider = ConnectedProvider,
> {
  readonly source: {
    readonly provider: Provider
    readonly providerScopeIdentifier: ProviderScopeIdentifierInput<Provider>
    readonly sourceType: string
    readonly sourceNativeId: string
  }
  readonly targets: readonly [
    ProviderRetractionTargetInput,
    ...ProviderRetractionTargetInput[],
  ]
  readonly application: ApplicationDeviceInput
  readonly eventSequence: string
  readonly deploymentIdentity: DeploymentIdentityInput
  /** Time the producer learned that the source record was no longer exposed. */
  readonly occurred: FhirInstant
  /** Time the retraction Provenance assertion was recorded. */
  readonly recorded: FhirInstant
  /** Time the immutable retraction Bundle was assembled. */
  readonly assembled: FhirInstant
  readonly repositoryIds?: {
    readonly bundle?: FhirId
    readonly provenance?: FhirId
  }
}

const providerCodes = new Set(
  providerAdapterCatalog.providers.map(({ id }) => id as string),
)
const providerSourceTypes = new Map(
  providerAdapterCatalog.providers.map(({ id, sourceTypes }) => [
    id as string,
    new Set(sourceTypes.map(({ token }) => token as string)),
  ]),
)
const POSITIVE_DECIMAL = /^[1-9]\d*$/u

const comparePositiveDecimals = (left: string, right: string): -1 | 0 | 1 => {
  if (left.length !== right.length) return left.length < right.length ? -1 : 1
  if (left === right) return 0
  return left < right ? -1 : 1
}

const nativeIdentifierSchema = z
  .strictObject({
    system: absoluteUriSchema,
    value: nonBlankStringSchema,
  })
  .optional()

const retractionTargetSchema = z.discriminatedUnion('role', [
  z.strictObject({
    role: z.literal('primary-output'),
    resourceType: z.literal('Observation'),
    outputRole: nonBlankStringSchema,
    outputDiscriminator: nonBlankStringSchema,
    nativeIdentifier: nativeIdentifierSchema,
  }),
  z.strictObject({
    role: z.literal('source-artifact'),
    resourceType: z.literal('DocumentReference'),
    formatCode: z.literal('provider-recording'),
    partIndex: z.literal('0'),
    nativeIdentifier: nativeIdentifierSchema,
  }),
  z.strictObject({
    role: z.literal('device-snapshot'),
    resourceType: z.literal('Device'),
    priorEventSequence: z.string().regex(POSITIVE_DECIMAL),
    deviceRole: z.enum(['application', 'host', 'recording-device']),
    sourceDeviceToken: nonBlankStringSchema,
    nativeIdentifier: nativeIdentifierSchema,
  }),
])

const retractionInputSchema = z.strictObject({
  source: z.strictObject({
    provider: nonBlankStringSchema,
    providerScopeIdentifier: providerScopeIdentifierSchema,
    sourceType: nonBlankStringSchema,
    sourceNativeId: nonBlankStringSchema,
  }),
  targets: z.array(retractionTargetSchema).nonempty(),
  application: applicationDeviceSchema,
  eventSequence: z.string().regex(POSITIVE_DECIMAL),
  deploymentIdentity: deploymentIdentitySchema,
  occurred: primitiveInstantSchema,
  recorded: primitiveInstantSchema,
  assembled: primitiveInstantSchema,
  repositoryIds: z
    .strictObject({
      bundle: fhirIdSchema.optional(),
      provenance: fhirIdSchema.optional(),
    })
    .optional(),
})

const targetIsAdmitted = (
  input: ProviderRetractionInput,
  target: ProviderRetractionTargetInput,
): boolean => {
  if (target.role === 'primary-output') {
    const mapping = (
      providerScalarOutputRoles as Readonly<
        Record<
          string,
          Readonly<Record<string, Readonly<Record<string, string>> | undefined>>
        >
      >
    )[input.source.provider]?.[input.source.sourceType]
    const discriminators = (
      providerScalarOutputDiscriminators as Readonly<
        Record<
          string,
          Readonly<Record<string, Readonly<Record<string, string>> | undefined>>
        >
      >
    )[input.source.provider]?.[input.source.sourceType]
    return (
      mapping !== undefined &&
      discriminators !== undefined &&
      Object.keys(mapping).some(
        (measurementId) =>
          mapping[measurementId] === target.outputRole &&
          discriminators[measurementId] === target.outputDiscriminator,
      )
    )
  }
  if (target.role === 'source-artifact') {
    return (
      (
        providerRawOutputRoles as Readonly<
          Record<string, Readonly<Record<string, string>> | undefined>
        >
      )[input.source.provider]?.[input.source.sourceType] !== undefined
    )
  }
  return (
    comparePositiveDecimals(target.priorEventSequence, input.eventSequence) < 0
  )
}

const validateInput = (input: ProviderRetractionInput): readonly Issue[] => {
  const findings: Issue[] = []
  findings.push(
    ...providerScopeIdentifierIssues(
      input.source.provider,
      input.source.providerScopeIdentifier,
    ),
  )
  const deployment = validateDeploymentIdentity(input.deploymentIdentity)
  if (!deployment.ok) {
    findings.push(
      ...deployment.issues.map((issue) => ({
        ...issue,
        path: ['deploymentIdentity', ...issue.path],
      })),
    )
  }
  if (!providerCodes.has(input.source.provider)) {
    findings.push({
      severity: 'error',
      code: 'invalid-code',
      path: ['source', 'provider'],
      message: 'Retraction source provider must be catalog-owned.',
    })
  } else if (
    !providerSourceTypes
      .get(input.source.provider)
      ?.has(input.source.sourceType)
  ) {
    findings.push({
      severity: 'error',
      code: 'invalid-code',
      path: ['source', 'sourceType'],
      message: 'Retraction source type must be catalog-owned for its provider.',
    })
  }
  for (const [index, target] of input.targets.entries()) {
    if (!targetIsAdmitted(input, target)) {
      findings.push({
        severity: 'error',
        code: 'unsupported-measurement',
        path: ['targets', index],
        message:
          'The Provider facade can retract only a catalog-admitted primary output, source artifact, or device snapshot.',
      })
    }
  }
  if (
    new Set(input.targets.map((target) => JSON.stringify(target))).size !==
    input.targets.length
  ) {
    findings.push({
      severity: 'error',
      code: 'duplicate-identifier',
      path: ['targets'],
      message: 'Retraction targets must be unique.',
    })
  }
  return findings
}

/** Strict runtime boundary for one Provider source-record retraction assertion. */
export const parseProviderRetractionInput = (
  input: unknown,
): Result<ProviderRetractionInput> => {
  const snapshot = cloneJsonValue(input)
  if (!snapshot.ok) return snapshot
  const parsed = retractionInputSchema.safeParse(snapshot.value)
  if (!parsed.success) return issues(parsed.error.issues.map(zodIssueToIssue))
  const value = parsed.data as unknown as ProviderRetractionInput
  const findings = validateInput(value)
  if (findings.length > 0) return issues(findings)
  return { ok: true, value: deepFreeze(value) as ProviderRetractionInput }
}

const sourceComponents = (
  input: ProviderRetractionInput,
): readonly [string, string, string, string, string] => [
  input.source.provider,
  input.source.sourceType,
  input.source.providerScopeIdentifier.system,
  input.source.providerScopeIdentifier.value,
  input.source.sourceNativeId,
]

const deriveTargetIdentifier = (
  input: ProviderRetractionInput,
  target: ProviderRetractionTargetInput,
): Result<CompleteIdentifierInput> => {
  const source = sourceComponents(input)
  if (target.role === 'source-artifact') {
    return deriveOpaqueIdentifier(input.deploymentIdentity, 'provider-output', [
      ...source,
      PROVIDER_RECORDING_OUTPUT_ROLE,
      PROVIDER_RECORDING_OUTPUT_DISCRIMINATOR,
    ])
  }
  if (target.role === 'device-snapshot') {
    const priorEvent = deriveEventIdentifier(
      input.deploymentIdentity,
      target.priorEventSequence,
    )
    if (!priorEvent.ok) return priorEvent
    return deriveOpaqueIdentifier(input.deploymentIdentity, 'device-snapshot', [
      priorEvent.value.system,
      priorEvent.value.value,
      target.deviceRole,
      target.sourceDeviceToken,
    ])
  }
  return deriveOpaqueIdentifier(input.deploymentIdentity, 'provider-output', [
    ...source,
    target.outputRole,
    target.outputDiscriminator,
  ])
}

const compareCanonicalText = (left: string, right: string): -1 | 0 | 1 => {
  if (left === right) return 0
  return left < right ? -1 : 1
}

interface TargetRoleExtension {
  readonly url: string
  readonly valueCode: RetractionTargetRole
}

interface TargetNativeIdentifierExtension {
  readonly url: string
  readonly valueIdentifier: ProviderRetractionTargetNativeIdentifierInput
}

interface TargetReference {
  readonly extension:
    | readonly [TargetRoleExtension]
    | readonly [TargetRoleExtension, TargetNativeIdentifierExtension]
  readonly identifier: ReturnType<typeof identifier>
  readonly type: string
}

const nativeIdentifierOf = (
  target: TargetReference,
): ProviderRetractionTargetNativeIdentifierInput | undefined =>
  target.extension[1]?.valueIdentifier

const compareTargetReferences = (
  left: TargetReference,
  right: TargetReference,
): number => {
  const leftNative = nativeIdentifierOf(left)
  const rightNative = nativeIdentifierOf(right)
  return (
    compareCanonicalText(
      left.extension[0].valueCode,
      right.extension[0].valueCode,
    ) ||
    compareCanonicalText(left.type, right.type) ||
    compareCanonicalText(
      left.identifier.system ?? '',
      right.identifier.system ?? '',
    ) ||
    compareCanonicalText(
      left.identifier.value ?? '',
      right.identifier.value ?? '',
    ) ||
    compareCanonicalText(leftNative?.system ?? '', rightNative?.system ?? '') ||
    compareCanonicalText(leftNative?.value ?? '', rightNative?.value ?? '')
  )
}

/**
 * Builds one append-only source-retraction assertion.
 *
 * It emits logical typed targets only. It never copies, mutates, tombstones, or marks prior
 * clinical resources entered-in-error; receiver lifecycle policy remains separate.
 */
export const buildProviderRetractionBundle = (
  input: ProviderRetractionInput,
): Result<GroveMobileRetractionBundle> => {
  const parsed = parseProviderRetractionInput(input)
  if (!parsed.ok) return parsed
  const validated = parsed.value

  const identities = deriveProviderIdentities({
    provider: validated.source.provider,
    providerScopeIdentifier: validated.source.providerScopeIdentifier,
    sourceType: validated.source.sourceType,
    sourceNativeId: validated.source.sourceNativeId,
    outputs: [],
    eventSequence: validated.eventSequence,
    deployment: validated.deploymentIdentity,
    provenanceNodeRole: 'retraction-provenance',
  })
  if (!identities.ok) return identities
  const provenanceIdentity = createEntryIdentity(
    identities.value.provenanceNode,
    validated.repositoryIds?.provenance,
  )
  if (!provenanceIdentity.ok) return provenanceIdentity
  const applicationIdentity = deriveApplicationEntryIdentity(
    validated.deploymentIdentity,
    identities.value.event,
    validated.application,
  )
  if (!applicationIdentity.ok) return applicationIdentity
  const hostIdentity =
    validated.application.host === undefined ?
      undefined
    : deriveDeviceSnapshotEntryIdentity(
        validated.deploymentIdentity,
        identities.value.event,
        validated.application.host.sourceDeviceToken,
        'host',
        validated.application.host.id,
      )
  if (hostIdentity !== undefined && !hostIdentity.ok) return hostIdentity

  const targetReferences: TargetReference[] = []
  for (const target of validated.targets) {
    const targetIdentifier = deriveTargetIdentifier(validated, target)
    if (!targetIdentifier.ok) return targetIdentifier
    const role: TargetRoleExtension = {
      url: EXTENSIONS.retractionTargetRole,
      valueCode: target.role,
    }
    targetReferences.push({
      extension:
        target.nativeIdentifier === undefined ?
          [role]
        : [
            role,
            {
              url: EXTENSIONS.retractionTargetNativeIdentifier,
              valueIdentifier: target.nativeIdentifier,
            },
          ],
      type: target.resourceType,
      identifier: identifier(targetIdentifier.value),
    })
  }
  targetReferences.sort(compareTargetReferences)

  const provenance = {
    resourceType: 'Provenance' as const,
    ...resourceId(provenanceIdentity.value),
    meta: { profile: [PROFILES.retractionProvenance] },
    target: targetReferences,
    occurredDateTime: validated.occurred,
    recorded: validated.recorded,
    activity: concept(
      SYSTEMS.groveLifecycleEvent,
      groveMobileContract.lifecycle.sourceRecordRetracted,
      'Source record retracted',
    ),
    agent: [
      {
        type: concept(SYSTEMS.provenanceParticipant, 'assembler', 'Assembler'),
        who: {
          reference: applicationIdentity.value.fullUrl,
        },
      },
    ],
    entity: [
      {
        role: 'source' as const,
        what: { identifier: identifier(identities.value.sourceRecord) },
      },
    ],
  }
  const application = makeApplicationDevice({
    ...validated.application,
    identity: applicationIdentity.value,
    ...(hostIdentity === undefined ?
      {}
    : { parentReference: hostIdentity.value.fullUrl }),
  })
  const host =
    validated.application.host === undefined || hostIdentity === undefined ?
      undefined
    : makeHostDevice({
        ...validated.application.host,
        identity: hostIdentity.value,
      })
  const entry = deduplicateIdentifiedEntries([
    ...(host === undefined || hostIdentity === undefined ?
      []
    : [identifiedEntry(hostIdentity.value, host)]),
    identifiedEntry(applicationIdentity.value, application),
    identifiedEntry(provenanceIdentity.value, provenance),
  ])
  if (!entry.ok) return entry

  return parseGroveMobileRetractionBundle(
    deepFreeze({
      resourceType: 'Bundle' as const,
      ...(validated.repositoryIds?.bundle === undefined ?
        {}
      : { id: validated.repositoryIds.bundle }),
      meta: { profile: [PROFILES.retractionBundle] },
      identifier: identifier(identities.value.event),
      type: 'collection' as const,
      timestamp: validated.assembled,
      entry: entry.value,
    }),
  )
}
