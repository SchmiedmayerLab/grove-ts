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
  makeConversionProvenance,
  occurredFor,
  resolveContextGraph,
  type ContextGraph,
} from './context-graph.js'
import {
  coding,
  deduplicateIdentifiedEntries,
  governedSourceIdentifier,
  identifiedEntry,
  identifier,
  resourceId,
} from './graph.js'
import {
  deriveProviderIdentities,
  deriveWriterRecordIdentifier,
  type ProviderIdentities,
} from './identity.js'
import {
  EXTENSIONS,
  PROFILES,
  PROVIDER_RECORDING_OUTPUT_DISCRIMINATOR,
  PROVIDER_RECORDING_OUTPUT_ROLE,
} from './profiles.js'
import {
  applicationDeviceSchema,
  governedSourceIdentifierIssues,
  effectiveTimeSchema,
  nativeIdentifierText,
  nonBlankText,
  refusal,
  writerRecordSchema,
} from './provider-input-schemas.js'
import { parseProviderConversionOptions, refusalIssues } from './provider.js'
import type {
  CanonicalBase64,
  ConnectedRawProvider,
  ImmutableRecordingUrl,
  MediaType,
  ProviderConversionOptions,
  ProviderRecordingAttachment,
  ProviderRecordingConversion,
  ProviderRecordingSource,
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
  type Issue,
  type Result,
} from '../core/index.js'
import {
  createEntryIdentity,
  type EntryIdentity,
  type RoledIdentifier,
} from '../mobile/identity.js'
import type {
  ExchangeEventContext,
  ExchangeGraphIdentifiers,
  GovernedSourceIdentifierDisclosurePolicy,
} from '../mobile/types.js'
import { groveRuleIssue, type ClientRecordRule } from '../r4/diagnostics.js'
import { parseExchangeGraph, type DocumentReference } from '../r4/index.js'

const BASE64 = /^(?:[A-Za-z\d+/]{4})*(?:[A-Za-z\d+/]{2}==|[A-Za-z\d+/]{3}=)?$/u
const MEDIA_TYPE = /^[A-Za-z\d!#$&^_.+-]+\/[A-Za-z\d!#$&^_.+-]+$/u
const MAX_ATTACHMENT_SIZE = 2_147_483_647

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

// A primitive parser's verdict, restated as the refusal the registry names for it.
const refusing =
  <Value>(parse: (value: unknown) => Result<Value>, code: ClientRecordRule) =>
  (value: unknown, context: z.core.$RefinementCtx): void => {
    const parsed = parse(value)
    if (!parsed.ok) {
      context.addIssue({
        code: 'custom',
        ...refusal(
          code,
          parsed.issues[0]?.message ?? 'Invalid attachment field.',
        ),
      })
    }
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
  sourceType: nonBlankText,
  sourceNativeId: nativeIdentifierText,
  writer: applicationDeviceSchema,
  effective: effectiveTimeSchema,
  writerRecord: writerRecordSchema.optional(),
})

const recordingAttachmentBase = {
  contentType: z
    .string()
    .superRefine(refusing(parseMediaType, 'mobile-input.value-shape-invalid')),
  title: nonBlankText.optional(),
  format: z.literal(
    'provider-recording',
    refusal(
      'mobile-input.unsupported-source-value',
      'Expected a registered provider recording format.',
    ),
  ) satisfies z.ZodType<ProviderRecordingFormat>,
  payloadAssertion: z.enum(
    providerAdapterCatalog.rawPayloadAdmission.allowedAssertions,
    refusal(
      'mobile-input.value-shape-invalid',
      'Expected exactly one catalog-derived payload admission assertion.',
    ),
  ),
} as const

const recordingAttachmentSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...recordingAttachmentBase,
    kind: z.literal('embedded'),
    dataBase64: z
      .string()
      .superRefine(
        refusing(parseCanonicalBase64, 'mobile-input.empty-recording-series'),
      ),
  }),
  z.strictObject({
    ...recordingAttachmentBase,
    kind: z.literal('external'),
    url: z
      .string()
      .superRefine(
        refusing(
          parseImmutableRecordingUrl,
          'mobile-input.value-shape-invalid',
        ),
      ),
    size: z
      .number()
      .int()
      .min(0)
      .refine(
        (value) => value <= MAX_ATTACHMENT_SIZE,
        refusal(
          'mobile-input.recording-payload-too-large',
          'Attachment.size exceeds the FHIR R4 unsignedInt range.',
        ),
      ),
    hash: z
      .string()
      .superRefine(
        refusing(parseSha1Base64, 'mobile-input.value-shape-invalid'),
      ),
    immutabilityAssurance: z.literal('immutable-version-specific'),
  }),
])

const hasRawMapping = (
  provider: ConnectedRawProvider,
  sourceType: string,
): boolean => Object.hasOwn(providerRawOutputRoles[provider], sourceType)

const refuse = (
  code: ClientRecordRule,
  path: ReadonlyArray<string | number>,
  message: string,
): Issue => groveRuleIssue(code, path, { message })

/** Strict boundary for one already-obtained provider recording's source record. */
export const parseProviderRecordingSource = (
  input: unknown,
): Result<ProviderRecordingSource> => {
  const snapshot = cloneJsonValue(input)
  if (!snapshot.ok) {
    return issues([
      refuse(
        'mobile-input.value-shape-invalid',
        [],
        snapshot.issues[0]?.message ?? '',
      ),
    ])
  }
  const parsed = recordingSourceSchema.safeParse(snapshot.value, {
    reportInput: true,
  })
  if (!parsed.success) return issues(refusalIssues(parsed.error))
  if (!hasRawMapping(parsed.data.adapter.provider, parsed.data.sourceType)) {
    return issues([
      refuse(
        'mobile-input.unsupported-source-type',
        ['sourceType'],
        `${parsed.data.adapter.provider}/${parsed.data.sourceType} is not admitted as a Provider native recording.`,
      ),
    ])
  }
  return ok(deepFreeze(parsed.data) as unknown as ProviderRecordingSource)
}

/** Strict boundary for the caller-supplied recording payload and its admission assertion. */
export const parseProviderRecordingAttachment = (
  input: unknown,
): Result<ProviderRecordingAttachment> => {
  const snapshot = cloneJsonValue(input)
  if (!snapshot.ok) {
    return issues([
      refuse(
        'mobile-input.value-shape-invalid',
        [],
        snapshot.issues[0]?.message ?? '',
      ),
    ])
  }
  const parsed = recordingAttachmentSchema.safeParse(snapshot.value, {
    reportInput: true,
  })
  if (!parsed.success) return issues(refusalIssues(parsed.error))
  const declaredContentTypes: readonly string[] =
    groveRecordingFormatRegistry.formats[parsed.data.format].contentTypes
  if (!declaredContentTypes.includes(parsed.data.contentType)) {
    return issues([
      refuse(
        'mobile-input.unsupported-source-value',
        ['contentType'],
        `Recording contentType must be one of ${declaredContentTypes.join(', ')} for the declared ${parsed.data.format} registry format.`,
      ),
    ])
  }
  return ok(deepFreeze(parsed.data) as unknown as ProviderRecordingAttachment)
}

interface RecordingGraphIdentities {
  readonly connected: ProviderIdentities
  readonly document: EntryIdentity
  readonly sourceArtifact: RoledIdentifier
  readonly provenance: EntryIdentity
  readonly writerRecord?: RoledIdentifier
}

const resolveRecordingIdentities = (
  source: ProviderRecordingSource,
  attachment: ProviderRecordingAttachment,
  graph: ContextGraph,
): Result<RecordingGraphIdentities> => {
  const { context } = graph
  const repositoryIds = context.repositoryIds ?? {}
  const connected = deriveProviderIdentities({
    provider: source.adapter.provider,
    repositoryScope: context.repositoryScope,
    sourceType: source.sourceType,
    sourceNativeId: source.sourceNativeId,
    outputs: [
      {
        kind: 'provider-output',
        outputRole: PROVIDER_RECORDING_OUTPUT_ROLE,
        outputDiscriminator: PROVIDER_RECORDING_OUTPUT_DISCRIMINATOR,
      },
      {
        kind: 'provider-artifact',
        formatCode: attachment.format,
        partIndex: '0',
      },
    ],
    event: context.event,
    scope: context.identityScope,
  })
  if (!connected.ok) return connected
  const [documentIdentifier, sourceArtifact] = connected.value.outputs
  if (documentIdentifier === undefined || sourceArtifact === undefined) {
    throw new Error(
      'The recording output and source artifact identities are required.',
    )
  }
  const document = createEntryIdentity(
    documentIdentifier,
    repositoryIds['primary-output'],
  )
  if (!document.ok) return document
  const provenance = createEntryIdentity(
    connected.value.provenanceNode,
    repositoryIds.provenance,
  )
  if (!provenance.ok) return provenance
  const writerRecord =
    source.writerRecord === undefined ?
      ok(undefined)
    : deriveWriterRecordIdentifier(context.identityScope, source.writerRecord)
  if (!writerRecord.ok) return writerRecord
  return ok({
    connected: connected.value,
    document: document.value,
    sourceArtifact,
    provenance: provenance.value,
    ...(writerRecord.value === undefined ?
      {}
    : { writerRecord: writerRecord.value }),
  })
}

const PROVIDER_TITLES = Object.fromEntries(
  providerAdapterCatalog.providers.map(({ id, title }) => [id, title]),
) as Readonly<Record<ConnectedRawProvider, string>>

const attachmentFor = (input: ProviderRecordingAttachment) => {
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

const makeDocument = (
  source: ProviderRecordingSource,
  attachment: ProviderRecordingAttachment,
  identities: RecordingGraphIdentities,
  graph: ContextGraph,
  disclosure: GovernedSourceIdentifierDisclosurePolicy,
): DocumentReference => ({
  resourceType: 'DocumentReference' as const,
  ...resourceId(identities.document),
  meta: {
    profile: [
      PROFILES.sensorRecordingDocument,
      PROFILES.providerRecordingDocument,
    ],
  },
  extension: [
    { url: EXTENSIONS.provider, valueCode: source.adapter.provider },
    {
      url: EXTENSIONS.providerSourceType,
      valueCode: `${source.adapter.provider}/${source.sourceType}`,
    },
    ...(source.writerRecord?.version === undefined ?
      []
    : [
        {
          url: EXTENSIONS.writerRecordVersion,
          valueString: source.writerRecord.version,
        },
      ]),
  ],
  identifier: [
    identifier(identities.connected.sourceRecord),
    identifier(identities.document.identifier),
    identifier(identities.sourceArtifact),
    ...(identities.writerRecord === undefined ?
      []
    : [identifier(identities.writerRecord)]),
    ...(disclosure.kind === 'omit' ?
      []
    : [governedSourceIdentifier(disclosure, source.sourceNativeId)]),
  ],
  status: 'current' as const,
  type: {
    text: `${PROVIDER_TITLES[source.adapter.provider]} ${source.sourceType} archive`,
  },
  subject: graph.subject,
  date: graph.context.conversionInstant,
  author: [{ reference: graph.application.fullUrl }],
  content: [
    {
      attachment: attachmentFor(attachment),
      format: coding(
        groveRecordingFormatRegistry.codeSystem,
        attachment.format,
        groveRecordingFormatRegistry.formats[attachment.format].title,
      ),
    },
  ],
})

/**
 * Builds the exchange graph for one already-obtained native provider recording.
 *
 * This pure facade performs no fetching, authentication, webhook handling, vendor parsing,
 * or credential management. Its DocumentReference cannot carry the research-study
 * extension, so a context naming studies is a fault rather than a silent omission.
 */
export const buildProviderRecordingGraph = (
  source: ProviderRecordingSource,
  attachment: ProviderRecordingAttachment,
  context: ExchangeEventContext,
  options: ProviderConversionOptions = {},
): Result<ProviderRecordingConversion> => {
  const parsedSource = parseProviderRecordingSource(source)
  if (!parsedSource.ok) return parsedSource
  const parsedAttachment = parseProviderRecordingAttachment(attachment)
  if (!parsedAttachment.ok) return parsedAttachment
  const parsedOptions = parseProviderConversionOptions(options)
  if (!parsedOptions.ok) return parsedOptions
  const graph = resolveContextGraph(context, parsedSource.value.writer, false)
  if (!graph.ok) return graph
  const disclosure = parsedOptions.value.nativeIdentifierDisclosure ?? {
    kind: 'omit',
  }
  const disclosureIssues = governedSourceIdentifierIssues(
    disclosure,
    graph.value.context.identityScope,
  )
  if (disclosureIssues.length > 0) return issues(disclosureIssues)
  const identities = resolveRecordingIdentities(
    parsedSource.value,
    parsedAttachment.value,
    graph.value,
  )
  if (!identities.ok) return identities
  const document = makeDocument(
    parsedSource.value,
    parsedAttachment.value,
    identities.value,
    graph.value,
    disclosure,
  )
  const provenance = makeConversionProvenance({
    identity: identities.value.provenance,
    profile: PROFILES.providerConversionProvenance,
    targets: [identities.value.document.fullUrl],
    occurred: occurredFor([parsedSource.value.effective]),
    recorded: graph.value.context.conversionInstant,
    sourceRecord: identities.value.connected.sourceRecord,
    graph: graph.value,
  })
  const entries = deduplicateIdentifiedEntries([
    ...graph.value.leadingEntries,
    identifiedEntry(identities.value.document, document),
    ...graph.value.supportingEntries,
    identifiedEntry(identities.value.provenance, provenance),
  ])
  if (!entries.ok) return entries
  const { repositoryIds = {} } = graph.value.context
  const parsed = parseExchangeGraph({
    resourceType: 'Bundle',
    ...(repositoryIds.bundle === undefined ? {} : { id: repositoryIds.bundle }),
    meta: { profile: [PROFILES.mobileBundle] },
    identifier: identifier(identities.value.connected.event),
    type: 'collection',
    timestamp: graph.value.context.conversionInstant,
    entry: entries.value,
  })
  if (!parsed.ok) return parsed
  const identifiers: ExchangeGraphIdentifiers = {
    event: identities.value.connected.event,
    sourceRecord: identities.value.connected.sourceRecord,
    outputs: [identities.value.document.identifier],
    provenance: identities.value.provenance.identifier,
    applicationSnapshot: graph.value.application.identifier,
    hostSnapshot: graph.value.host.identifier,
    writerSnapshot: graph.value.writer.identifier,
    sourceArtifact: identities.value.sourceArtifact,
    ...(graph.value.gatewayApplication === undefined ?
      {}
    : {
        gatewayApplicationSnapshot: graph.value.gatewayApplication.identifier,
      }),
    ...(identities.value.writerRecord === undefined ?
      {}
    : { writerRecord: identities.value.writerRecord }),
  }
  return ok({
    source: parsedSource.value,
    identifiers,
    graph: parsed.value,
    warnings: [],
  })
}
