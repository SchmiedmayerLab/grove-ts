//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { sha1 } from '@noble/hashes/legacy.js'
import { z } from 'zod'
import {
  assemblerAgent,
  coding,
  deduplicateIdentifiedEntries,
  governedSourceIdentifier,
  identifiedEntry,
  identifier,
  makeApplicationDevice,
  makeHostDevice,
  provenanceActivity,
  resourceId,
  sourceEntityAgent,
} from './graph.js'
import {
  deriveApplicationEntryIdentity,
  deriveProviderIdentities,
  deriveWriterRecordIdentifier,
  resolveHostIdentity,
} from './identity.js'
import {
  EXTENSIONS,
  PROFILES,
  PROVIDER_RECORDING_OUTPUT_DISCRIMINATOR,
  PROVIDER_RECORDING_OUTPUT_ROLE,
} from './profiles.js'
import {
  applicationDeviceSchema,
  deploymentIdentitySchema,
  fhirIdSchema,
  identifierInputSchema,
  governedSourceIdentifierIssues,
  governedSourceIdentifierSchema,
  nonBlankStringSchema,
  primitiveInstantSchema,
  providerPatientReferenceSchema,
  providerScopeIdentifierIssues,
  providerScopeIdentifierSchema,
} from './provider.js'
import type {
  CanonicalBase64,
  ProviderRecordingBundleInput,
  ConnectedRawProvider,
  ImmutableRecordingUrl,
  MediaType,
  Sha1Base64,
} from './types.js'
import {
  groveRecordingFormatRegistry,
  providerAdapterCatalog,
  providerRawOutputRoles,
  type ProviderRecordingFormat,
} from '../contract/providers.generated.js'
import {
  cloneJsonValue,
  deepFreeze,
  err,
  issues,
  ok,
  decodeCanonicalBase64,
  encodeBase64,
  parseFhirInstant,
  zodIssueToIssue,
  type Issue,
  type Result,
} from '../core/index.js'
import { createEntryIdentity } from '../mobile/identity.js'
import type { IdentifiedEntryIdentityInput } from '../mobile/types.js'
import {
  parseGroveMobileExchangeBundle,
  type GroveMobileExchangeBundle,
} from '../r4/index.js'

const BASE64 = /^(?:[A-Za-z\d+/]{4})*(?:[A-Za-z\d+/]{2}==|[A-Za-z\d+/]{3}=)?$/u
const MEDIA_TYPE = /^[A-Za-z\d!#$&^_.+-]+\/[A-Za-z\d!#$&^_.+-]+$/u

const decodeRecordingBase64 = (value: string): Uint8Array | undefined =>
  value.length === 0 || !BASE64.test(value) ?
    undefined
  : decodeCanonicalBase64(value)

export const parseCanonicalBase64 = (
  value: unknown,
): Result<CanonicalBase64> => {
  if (typeof value !== 'string' || decodeRecordingBase64(value) === undefined) {
    return err(
      'invalid-code',
      'Expected non-empty, canonically padded RFC 4648 base64.',
    )
  }
  return ok(value as CanonicalBase64)
}

export const encodeRecordingBytes = (
  bytes: Uint8Array,
): Result<CanonicalBase64> => {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
    return err('missing-required', 'Recording bytes must not be empty.')
  }
  return ok(encodeBase64(bytes) as CanonicalBase64)
}

export const parseSha1Base64 = (value: unknown): Result<Sha1Base64> => {
  if (typeof value !== 'string') {
    return err('invalid-code', 'Expected a base64-encoded SHA-1 digest.')
  }
  const decoded = decodeRecordingBase64(value)
  if (decoded?.length !== 20) {
    return err(
      'invalid-code',
      'Expected a canonically padded base64-encoded 20-byte SHA-1 digest.',
    )
  }
  return ok(value as Sha1Base64)
}

export const parseMediaType = (value: unknown): Result<MediaType> => {
  if (typeof value !== 'string' || !MEDIA_TYPE.test(value)) {
    return err(
      'invalid-code',
      'Expected a media type in type/subtype form without parameters.',
    )
  }
  return ok(value as MediaType)
}

const parseAttachmentSize = (value: unknown): Result<number> => {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 2_147_483_647
  ) {
    return err(
      'out-of-range',
      'Attachment.size must be an integer in the FHIR R4 unsignedInt range 0...2147483647.',
    )
  }
  return ok(value)
}

export const parseImmutableRecordingUrl = (
  value: unknown,
): Result<ImmutableRecordingUrl> => {
  if (typeof value !== 'string' || /\s/u.test(value)) {
    return err('invalid-uri', 'Expected an immutable HTTP(S) recording URL.')
  }
  try {
    const parsed = new URL(value)
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username !== '' ||
      parsed.password !== ''
    ) {
      return err(
        'invalid-uri',
        'Expected an immutable HTTP(S) recording URL without user information.',
      )
    }
    decodeURIComponent(value)
  } catch {
    return err(
      'invalid-uri',
      'Expected an immutable HTTP(S) recording URL with valid percent encoding.',
    )
  }
  return ok(value as ImmutableRecordingUrl)
}

const providerValues = Object.keys(providerRawOutputRoles) as [
  ConnectedRawProvider,
  ...ConnectedRawProvider[],
]

const recordingSourceSchema = z.strictObject({
  adapter: z.strictObject({
    kind: z.literal('providers'),
    provider: z.enum(providerValues),
  }),
  providerScopeIdentifier: providerScopeIdentifierSchema,
  sourceType: nonBlankStringSchema,
  sourceNativeId: nonBlankStringSchema,
  dataOrigin: applicationDeviceSchema,
  writerRecord: z
    .strictObject({
      applicationIdentifier: identifierInputSchema,
      nativeRecordId: nonBlankStringSchema,
      version: z
        .string()
        .regex(/^(?:0|[1-9]\d*)$/u)
        .optional(),
    })
    .optional(),
})

const recordingAttachmentBase = {
  contentType: z.string().min(1),
  title: nonBlankStringSchema.optional(),
  format: z.literal(
    'provider-recording',
  ) satisfies z.ZodType<ProviderRecordingFormat>,
  payloadAssertion: z.enum(
    providerAdapterCatalog.rawPayloadAdmission.allowedAssertions,
  ),
} as const

const recordingAttachmentSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...recordingAttachmentBase,
    kind: z.literal('embedded'),
    dataBase64: z.string().min(1),
  }),
  z.strictObject({
    ...recordingAttachmentBase,
    kind: z.literal('external'),
    url: z.string().min(1),
    size: z.number(),
    hash: z.string().min(1),
    immutabilityAssurance: z.literal('immutable-version-specific'),
  }),
])

const recordingBundleInputSchema = z.strictObject({
  source: recordingSourceSchema,
  attachment: recordingAttachmentSchema,
  subject: providerPatientReferenceSchema,
  application: applicationDeviceSchema,
  eventSequence: z.string().regex(/^[1-9]\d*$/u),
  deploymentIdentity: deploymentIdentitySchema,
  nativeIdentifierDisclosure: governedSourceIdentifierSchema.optional(),
  documentDate: primitiveInstantSchema,
  occurred: primitiveInstantSchema,
  recorded: primitiveInstantSchema,
  assembled: primitiveInstantSchema,
  repositoryIds: z
    .strictObject({
      bundle: fhirIdSchema.optional(),
      document: fhirIdSchema.optional(),
      provenance: fhirIdSchema.optional(),
    })
    .optional(),
})

const hasRawMapping = (
  provider: ConnectedRawProvider,
  sourceType: string,
): boolean => Object.hasOwn(providerRawOutputRoles[provider], sourceType)

/** Strict parser for the closed Provider mapped-standard facade. */
export const parseProviderRecordingBundleInput = (
  input: unknown,
): Result<ProviderRecordingBundleInput> => {
  const snapshot = cloneJsonValue(input)
  if (!snapshot.ok) return snapshot
  const parsed = recordingBundleInputSchema.safeParse(snapshot.value)
  if (!parsed.success) return issues(parsed.error.issues.map(zodIssueToIssue))

  const findings: Issue[] = []
  findings.push(
    ...providerScopeIdentifierIssues(
      parsed.data.source.adapter.provider,
      parsed.data.source.providerScopeIdentifier,
    ),
  )
  findings.push(
    ...governedSourceIdentifierIssues(
      parsed.data.nativeIdentifierDisclosure,
      parsed.data.source.sourceNativeId,
      parsed.data.deploymentIdentity,
    ),
  )
  if (
    !hasRawMapping(
      parsed.data.source.adapter.provider,
      parsed.data.source.sourceType,
    )
  ) {
    findings.push({
      severity: 'error',
      code: 'unsupported-measurement',
      path: ['source', 'sourceType'],
      message: `${parsed.data.source.adapter.provider}/${parsed.data.source.sourceType} is not admitted as a Provider native recording.`,
    })
  }
  const checks: ReadonlyArray<
    readonly [Result<unknown>, ReadonlyArray<string | number>]
  > = [
    [parseFhirInstant(parsed.data.documentDate), ['documentDate']],
    [parseFhirInstant(parsed.data.occurred), ['occurred']],
    [parseFhirInstant(parsed.data.recorded), ['recorded']],
    [parseFhirInstant(parsed.data.assembled), ['assembled']],
    [
      parseMediaType(parsed.data.attachment.contentType),
      ['attachment', 'contentType'],
    ],
    ...(parsed.data.attachment.kind === 'embedded' ?
      [
        [
          parseCanonicalBase64(parsed.data.attachment.dataBase64),
          ['attachment', 'dataBase64'],
        ] as const,
      ]
    : [
        [
          parseImmutableRecordingUrl(parsed.data.attachment.url),
          ['attachment', 'url'],
        ] as const,
        [
          parseAttachmentSize(parsed.data.attachment.size),
          ['attachment', 'size'],
        ] as const,
        [
          parseSha1Base64(parsed.data.attachment.hash),
          ['attachment', 'hash'],
        ] as const,
      ]),
  ]
  for (const [check, path] of checks) {
    if (!check.ok) {
      findings.push(
        ...check.issues.map((finding) => ({ ...finding, path: [...path] })),
      )
    }
  }

  const declaredContentTypes: readonly string[] =
    groveRecordingFormatRegistry.formats[parsed.data.attachment.format]
      .contentTypes
  if (!declaredContentTypes.includes(parsed.data.attachment.contentType)) {
    findings.push({
      severity: 'error',
      code: 'value-mismatch',
      path: ['attachment', 'contentType'],
      message: `Recording contentType must be one of ${declaredContentTypes.join(', ')} for the declared ${parsed.data.attachment.format} registry format.`,
    })
  }

  if (findings.length === 0) {
    const identity = deriveProviderIdentities({
      provider: parsed.data.source.adapter.provider,
      providerScopeIdentifier: parsed.data.source.providerScopeIdentifier,
      sourceType: parsed.data.source.sourceType,
      sourceNativeId: parsed.data.source.sourceNativeId,
      outputs: [
        {
          kind: 'provider-output',
          outputRole: PROVIDER_RECORDING_OUTPUT_ROLE,
          outputDiscriminator: PROVIDER_RECORDING_OUTPUT_DISCRIMINATOR,
        },
        {
          kind: 'provider-artifact',
          formatCode: parsed.data.attachment.format,
          partIndex: '0',
        },
      ],
      eventSequence: parsed.data.eventSequence,
      deployment: parsed.data.deploymentIdentity,
    })
    if (!identity.ok) findings.push(...identity.issues)
  }

  if (findings.length > 0) return issues(findings)
  return ok(deepFreeze(parsed.data) as unknown as ProviderRecordingBundleInput)
}

interface RecordingGraphIdentities {
  readonly sourceRecord: {
    readonly system: import('../core/index.js').AbsoluteUri
    readonly value: string
  }
  readonly event: {
    readonly system: import('../core/index.js').AbsoluteUri
    readonly value: string
  }
  readonly document: IdentifiedEntryIdentityInput
  readonly sourceArtifact: import('../mobile/types.js').CompleteIdentifierInput
  readonly provenance: IdentifiedEntryIdentityInput
  readonly application: IdentifiedEntryIdentityInput
  readonly applicationHost?: IdentifiedEntryIdentityInput
  readonly dataOrigin: IdentifiedEntryIdentityInput
  readonly dataOriginHost?: IdentifiedEntryIdentityInput
  readonly writerRecord?: import('../mobile/types.js').CompleteIdentifierInput
}

const resolveRecordingGraphIdentities = (
  input: ProviderRecordingBundleInput,
): Result<RecordingGraphIdentities> => {
  const connected = deriveProviderIdentities({
    provider: input.source.adapter.provider,
    providerScopeIdentifier: input.source.providerScopeIdentifier,
    sourceType: input.source.sourceType,
    sourceNativeId: input.source.sourceNativeId,
    outputs: [
      {
        kind: 'provider-output',
        outputRole: PROVIDER_RECORDING_OUTPUT_ROLE,
        outputDiscriminator: PROVIDER_RECORDING_OUTPUT_DISCRIMINATOR,
      },
      {
        kind: 'provider-artifact',
        formatCode: input.attachment.format,
        partIndex: '0',
      },
    ],
    eventSequence: input.eventSequence,
    deployment: input.deploymentIdentity,
  })
  if (!connected.ok) return connected
  const documentIdentifier = connected.value.outputs[0]
  const sourceArtifact = connected.value.outputs[1]
  if (documentIdentifier === undefined || sourceArtifact === undefined) {
    return err(
      'missing-required',
      'The recording output and source artifact identities are required.',
    )
  }
  const document = createEntryIdentity(
    documentIdentifier,
    input.repositoryIds?.document,
  )
  if (!document.ok) return document
  const provenance = createEntryIdentity(
    connected.value.provenanceNode,
    input.repositoryIds?.provenance,
  )
  if (!provenance.ok) return provenance
  const application = deriveApplicationEntryIdentity(
    input.deploymentIdentity,
    connected.value.event,
    input.application,
  )
  if (!application.ok) return application
  const applicationHost = resolveHostIdentity(
    input.application,
    input.deploymentIdentity,
    connected.value.event,
  )
  if (!applicationHost.ok) return applicationHost
  const dataOrigin = deriveApplicationEntryIdentity(
    input.deploymentIdentity,
    connected.value.event,
    input.source.dataOrigin,
  )
  if (!dataOrigin.ok) return dataOrigin
  const dataOriginHost = resolveHostIdentity(
    input.source.dataOrigin,
    input.deploymentIdentity,
    connected.value.event,
  )
  if (!dataOriginHost.ok) return dataOriginHost

  const writerRecord =
    input.source.writerRecord === undefined ?
      undefined
    : deriveWriterRecordIdentifier(
        input.deploymentIdentity,
        input.source.writerRecord.applicationIdentifier,
        input.source.writerRecord.nativeRecordId,
      )
  if (writerRecord !== undefined && !writerRecord.ok) return writerRecord

  return ok({
    sourceRecord: connected.value.sourceRecord,
    event: connected.value.event,
    document: document.value,
    sourceArtifact,
    provenance: provenance.value,
    application: application.value,
    dataOrigin: dataOrigin.value,
    ...(applicationHost.value === undefined ?
      {}
    : { applicationHost: applicationHost.value }),
    ...(dataOriginHost.value === undefined ?
      {}
    : { dataOriginHost: dataOriginHost.value }),
    ...(writerRecord === undefined ? {} : { writerRecord: writerRecord.value }),
  })
}

const PROVIDER_TITLES = Object.fromEntries(
  providerAdapterCatalog.providers.map(({ id, title }) => [id, title]),
) as Readonly<Record<ConnectedRawProvider, string>>

const providerTitle = (provider: ConnectedRawProvider): string =>
  PROVIDER_TITLES[provider]

const attachmentFor = (input: ProviderRecordingBundleInput['attachment']) => {
  if (input.kind === 'external') {
    return {
      contentType: input.contentType,
      url: input.url,
      size: input.size,
      hash: input.hash,
      ...(input.title === undefined ? {} : { title: input.title }),
    }
  }
  // The parser already proved this is canonical base64, so decoding cannot fail.
  const validatedBytes =
    decodeCanonicalBase64(input.dataBase64) ?? new Uint8Array()
  return {
    contentType: input.contentType,
    data: input.dataBase64,
    size: validatedBytes.length,
    hash: encodeBase64(sha1(validatedBytes)),
    ...(input.title === undefined ? {} : { title: input.title }),
  }
}

/**
 * Builds the complete deterministic R4 graph for one already-obtained native
 * provider recording. This pure facade performs no fetching, authentication,
 * webhook handling, vendor parsing, or credential management.
 */
export const buildProviderRecordingBundle = (
  input: ProviderRecordingBundleInput,
): Result<GroveMobileExchangeBundle> => {
  const parsed = parseProviderRecordingBundleInput(input)
  if (!parsed.ok) return parsed
  const validated = parsed.value
  const identities = resolveRecordingGraphIdentities(validated)
  if (!identities.ok) return identities

  const sourceCode = `${validated.source.adapter.provider}/${validated.source.sourceType}`
  const document = {
    resourceType: 'DocumentReference' as const,
    ...resourceId(identities.value.document),
    meta: {
      profile: [
        PROFILES.sensorRecordingDocument,
        PROFILES.providerRecordingDocument,
      ],
    },
    extension: [
      {
        url: EXTENSIONS.provider,
        valueCode: validated.source.adapter.provider,
      },
      {
        url: EXTENSIONS.providerSourceType,
        valueCode: sourceCode,
      },
      ...(validated.source.writerRecord?.version === undefined ?
        []
      : [
          {
            url: EXTENSIONS.writerRecordVersion,
            valueString: validated.source.writerRecord.version,
          },
        ]),
    ],
    identifier: [
      identifier(identities.value.sourceRecord),
      identifier(identities.value.document.identifier),
      identifier(identities.value.sourceArtifact),
      ...(identities.value.writerRecord === undefined ?
        []
      : [identifier(identities.value.writerRecord)]),
      ...(validated.nativeIdentifierDisclosure === undefined ?
        []
      : [governedSourceIdentifier(validated.nativeIdentifierDisclosure)]),
    ],
    status: 'current' as const,
    type: {
      text: `${providerTitle(validated.source.adapter.provider)} ${validated.source.sourceType} archive`,
    },
    subject: {
      type: validated.subject.type,
      identifier: {
        system: validated.subject.identifier.system,
        value: validated.subject.identifier.value,
      },
    },
    date: validated.documentDate,
    author: [{ reference: identities.value.application.fullUrl }],
    content: [
      {
        attachment: attachmentFor(validated.attachment),
        format: coding(
          groveRecordingFormatRegistry.codeSystem,
          validated.attachment.format,
          groveRecordingFormatRegistry.formats[validated.attachment.format]
            .title,
        ),
      },
    ],
  }
  const application = makeApplicationDevice({
    ...validated.application,
    identity: identities.value.application,
    ...(identities.value.applicationHost === undefined ?
      {}
    : { parentReference: identities.value.applicationHost.fullUrl }),
  })
  const applicationHost =
    (
      validated.application.host === undefined ||
      identities.value.applicationHost === undefined
    ) ?
      undefined
    : makeHostDevice({
        ...validated.application.host,
        identity: identities.value.applicationHost,
      })
  const dataOrigin = makeApplicationDevice({
    ...validated.source.dataOrigin,
    identity: identities.value.dataOrigin,
    ...(identities.value.dataOriginHost === undefined ?
      {}
    : { parentReference: identities.value.dataOriginHost.fullUrl }),
  })
  const dataOriginHost =
    (
      validated.source.dataOrigin.host === undefined ||
      identities.value.dataOriginHost === undefined
    ) ?
      undefined
    : makeHostDevice({
        ...validated.source.dataOrigin.host,
        identity: identities.value.dataOriginHost,
      })
  const provenance = {
    resourceType: 'Provenance' as const,
    ...resourceId(identities.value.provenance),
    meta: {
      profile: [PROFILES.providerConversionProvenance],
    },
    target: [{ reference: identities.value.document.fullUrl }],
    occurredDateTime: validated.occurred,
    recorded: validated.recorded,
    activity: provenanceActivity(),
    agent: [assemblerAgent(identities.value.application.fullUrl)],
    entity: [
      {
        role: 'source' as const,
        what: { identifier: identifier(identities.value.sourceRecord) },
        agent: [sourceEntityAgent(identities.value.dataOrigin.fullUrl)],
      },
    ],
  }

  const entries = deduplicateIdentifiedEntries([
    identifiedEntry(identities.value.document, document),
    ...((
      dataOriginHost === undefined ||
      identities.value.dataOriginHost === undefined
    ) ?
      []
    : [identifiedEntry(identities.value.dataOriginHost, dataOriginHost)]),
    identifiedEntry(identities.value.dataOrigin, dataOrigin),
    ...((
      applicationHost === undefined ||
      identities.value.applicationHost === undefined
    ) ?
      []
    : [identifiedEntry(identities.value.applicationHost, applicationHost)]),
    identifiedEntry(identities.value.application, application),
    identifiedEntry(identities.value.provenance, provenance),
  ])
  if (!entries.ok) return entries

  return parseGroveMobileExchangeBundle({
    resourceType: 'Bundle',
    ...(validated.repositoryIds?.bundle === undefined ?
      {}
    : { id: validated.repositoryIds.bundle }),
    meta: { profile: [PROFILES.mobileBundle] },
    identifier: identifier(identities.value.event),
    type: 'collection',
    timestamp: validated.assembled,
    entry: entries.value,
  })
}
