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
  providerAdapterCatalog,
  providerRawMappings,
} from './contract.generated.js'
import {
  assemblerAgent,
  identifiedEntry,
  identifier,
  makeApplicationDevice,
  provenanceActivity,
  resourceId,
  sourceEntityAgent,
} from './graph.js'
import {
  deriveProviderIdentities,
  parseResourceIdentityInput,
} from './identity.js'
import { containsReversibleIdentityRepresentation } from './privacy.js'
import { EXTENSIONS, PROFILES } from './profiles.js'
import {
  applicationDeviceSchema,
  fhirIdSchema,
  identifierInputSchema,
  nonBlankStringSchema,
  normalizeZodIssue,
  primitiveInstantSchema,
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
  deepFreeze,
  err,
  issues,
  ok,
  parseAbsoluteUri,
  parseFhirInstant,
  parsePatientReference,
  parsePositiveInteger,
  type Issue,
  type PositiveInteger,
  type Result,
} from '../core/index.js'
import { createEntryIdentity } from '../mobile/identity.js'
import type { IdentifiedEntryIdentityInput } from '../mobile/types.js'
import { parseCollectionBundle, type CollectionBundle } from '../r4/index.js'

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const BASE64 = /^(?:[A-Za-z\d+/]{4})*(?:[A-Za-z\d+/]{2}==|[A-Za-z\d+/]{3}=)?$/u
const MEDIA_TYPE = /^[A-Za-z\d!#$&^_.+-]+\/[A-Za-z\d!#$&^_.+-]+$/u

const encodeBase64 = (bytes: Uint8Array): string => {
  let output = ''
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let index = 0; index < bytes.length; index += 3) {
    const first = view.getUint8(index)
    const second = bytes[index + 1]
    const third = bytes[index + 2]
    const block = (first << 16) | ((second ?? 0) << 8) | (third ?? 0)
    output += BASE64_ALPHABET.charAt((block >>> 18) & 63)
    output += BASE64_ALPHABET.charAt((block >>> 12) & 63)
    output +=
      second === undefined ? '=' : BASE64_ALPHABET.charAt((block >>> 6) & 63)
    output += third === undefined ? '=' : BASE64_ALPHABET.charAt(block & 63)
  }
  return output
}

const decodeBase64 = (value: string): Uint8Array => {
  let padding = 0
  if (value.endsWith('==')) padding = 2
  else if (value.endsWith('=')) padding = 1
  const bytes = new Uint8Array((value.length / 4) * 3 - padding)
  let outputIndex = 0
  for (let index = 0; index < value.length; index += 4) {
    const first = BASE64_ALPHABET.indexOf(value.charAt(index))
    const second = BASE64_ALPHABET.indexOf(value.charAt(index + 1))
    const thirdCharacter = value.charAt(index + 2)
    const fourthCharacter = value.charAt(index + 3)
    const third =
      thirdCharacter === '=' ? 0 : BASE64_ALPHABET.indexOf(thirdCharacter)
    const fourth =
      fourthCharacter === '=' ? 0 : BASE64_ALPHABET.indexOf(fourthCharacter)
    const block = (first << 18) | (second << 12) | (third << 6) | fourth
    bytes[outputIndex++] = block >>> 16
    if (thirdCharacter !== '=') bytes[outputIndex++] = block >>> 8
    if (fourthCharacter !== '=') bytes[outputIndex++] = block
  }
  return bytes
}

const decodeCanonicalBase64 = (value: string): Uint8Array | undefined => {
  if (value.length === 0 || !BASE64.test(value)) return undefined
  const bytes = decodeBase64(value)
  return encodeBase64(bytes) === value ? bytes : undefined
}

export const parseCanonicalBase64 = (
  value: unknown,
): Result<CanonicalBase64> => {
  if (typeof value !== 'string' || decodeCanonicalBase64(value) === undefined) {
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
  const decoded = decodeCanonicalBase64(value)
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

const parseAttachmentSize = (value: unknown): Result<PositiveInteger> => {
  const parsed = parsePositiveInteger(value)
  if (!parsed.ok) return parsed
  if (parsed.value > 2_147_483_647) {
    return err(
      'out-of-range',
      'Attachment.size must fit the FHIR R4 unsignedInt range.',
    )
  }
  return parsed
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

const providerValues = Object.keys(providerRawMappings) as [
  ConnectedRawProvider,
  ...ConnectedRawProvider[],
]

const recordingSourceSchema = z.strictObject({
  adapter: z.strictObject({
    kind: z.literal('providers'),
    provider: z.enum(providerValues),
  }),
  providerAccountIdentifier: identifierInputSchema.extend({
    assurance: z.literal('deployment-scoped-pseudonym'),
  }),
  sourceType: nonBlankStringSchema,
  sourceNativeId: nonBlankStringSchema,
  dataOrigin: applicationDeviceSchema,
})

const recordingAttachmentBase = {
  contentType: z.string().min(1),
  title: nonBlankStringSchema,
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
  subject: z.string(),
  application: applicationDeviceSchema,
  eventSequence: z.number(),
  documentDate: primitiveInstantSchema,
  recorded: primitiveInstantSchema,
  repositoryIds: z
    .strictObject({
      bundle: fhirIdSchema.optional(),
      document: fhirIdSchema.optional(),
      provenance: fhirIdSchema.optional(),
    })
    .optional(),
})

const recordingGraphIdentityIssues = (
  input: z.infer<typeof recordingBundleInputSchema>,
): readonly Issue[] => {
  const graphIdentityInputs: ReadonlyArray<
    readonly [
      Parameters<typeof parseResourceIdentityInput>[0],
      readonly string[],
    ]
  > = [
    [input.application.identity, ['application', 'identity']],
    [input.source.dataOrigin.identity, ['source', 'dataOrigin', 'identity']],
  ]
  return graphIdentityInputs.flatMap(([identity, path]) => {
    const parsedIdentity = parseResourceIdentityInput(identity)
    return parsedIdentity.ok ?
        []
      : parsedIdentity.issues.map((entry) => ({
          ...entry,
          path: [...path, ...entry.path],
        }))
  })
}

const hasRawMapping = (
  provider: ConnectedRawProvider,
  sourceType: string,
): boolean => Object.hasOwn(providerRawMappings[provider], sourceType)

const attachmentMetadataStrings = (
  attachment: z.infer<typeof recordingAttachmentSchema>,
): readonly string[] => {
  if (attachment.kind === 'external') {
    return [
      attachment.contentType,
      attachment.title,
      attachment.hash,
      attachment.url,
    ]
  }
  const bytes = decodeCanonicalBase64(attachment.dataBase64)
  return [
    attachment.contentType,
    attachment.title,
    ...(bytes === undefined ? [] : [encodeBase64(sha1(bytes))]),
  ]
}

const emittedCallerStrings = (
  input: z.infer<typeof recordingBundleInputSchema>,
): readonly string[] => [
  input.source.adapter.provider,
  input.source.sourceType,
  input.subject,
  input.documentDate,
  input.recorded,
  ...attachmentMetadataStrings(input.attachment),
  input.application.identity.identifier.system,
  input.application.identity.identifier.value,
  input.application.identity.id ?? '',
  input.application.name,
  input.application.version ?? '',
  input.application.manufacturer ?? '',
  input.source.dataOrigin.identity.identifier.system,
  input.source.dataOrigin.identity.identifier.value,
  input.source.dataOrigin.identity.id ?? '',
  input.source.dataOrigin.name,
  input.source.dataOrigin.version ?? '',
  input.source.dataOrigin.manufacturer ?? '',
  input.repositoryIds?.bundle ?? '',
  input.repositoryIds?.document ?? '',
  input.repositoryIds?.provenance ?? '',
]

/** Strict parser for the closed Provider mapped-standard facade. */
export const parseProviderRecordingBundleInput = (
  input: unknown,
): Result<ProviderRecordingBundleInput> => {
  const parsed = recordingBundleInputSchema.safeParse(input)
  if (!parsed.success) {
    return issues(parsed.error.issues.map(normalizeZodIssue))
  }

  const findings: Issue[] = []
  findings.push(...recordingGraphIdentityIssues(parsed.data))
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
    [parsePatientReference(parsed.data.subject), ['subject']],
    [parsePositiveInteger(parsed.data.eventSequence), ['eventSequence']],
    [parseFhirInstant(parsed.data.documentDate), ['documentDate']],
    [parseFhirInstant(parsed.data.recorded), ['recorded']],
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

  const emittedStrings = emittedCallerStrings(parsed.data)
  for (const [privateValue, path, label] of [
    [
      parsed.data.source.sourceNativeId,
      ['source', 'sourceNativeId'],
      'sourceNativeId',
    ],
    [
      parsed.data.source.providerAccountIdentifier.value,
      ['source', 'providerAccountIdentifier', 'value'],
      'providerAccountIdentifier.value',
    ],
  ] as const) {
    if (
      emittedStrings.some(
        (value) =>
          value !== '' &&
          containsReversibleIdentityRepresentation(value, privateValue),
      )
    ) {
      findings.push({
        severity: 'error',
        code: 'invalid-identifier',
        path,
        message: `${label} is an identity input only and must not appear in emitted FHIR metadata.`,
      })
    }
  }

  if (findings.length === 0) {
    const providerAccountSystem = parseAbsoluteUri(
      parsed.data.source.providerAccountIdentifier.system,
    )
    const eventSequence = parsePositiveInteger(parsed.data.eventSequence)
    if (!providerAccountSystem.ok) {
      findings.push(...providerAccountSystem.issues)
    } else if (!eventSequence.ok) {
      findings.push(...eventSequence.issues)
    } else {
      const identity = deriveProviderIdentities({
        provider: parsed.data.source.adapter.provider,
        providerAccountIdentifier: {
          system: providerAccountSystem.value,
          value: parsed.data.source.providerAccountIdentifier.value,
        },
        sourceType: parsed.data.source.sourceType,
        sourceNativeId: parsed.data.source.sourceNativeId,
        outputDiscriminators: [
          providerAdapterCatalog.recordingDocument.outputDiscriminator,
        ],
        eventSequence: eventSequence.value,
      })
      if (!identity.ok) findings.push(...identity.issues)
    }
  }

  if (findings.length > 0) return issues(findings)
  return ok(
    deepFreeze(parsed.data) as unknown as ProviderRecordingBundleInput,
  )
}

interface RecordingGraphIdentities {
  readonly sourceRecord: {
    readonly system: import('../core/index.js').AbsoluteUri
    readonly value: string
  }
  readonly exchange: {
    readonly system: import('../core/index.js').AbsoluteUri
    readonly value: string
  }
  readonly document: IdentifiedEntryIdentityInput
  readonly provenance: IdentifiedEntryIdentityInput
  readonly application: IdentifiedEntryIdentityInput
  readonly dataOrigin: IdentifiedEntryIdentityInput
}

const resolveRecordingGraphIdentities = (
  input: ProviderRecordingBundleInput,
): Result<RecordingGraphIdentities> => {
  const connected = deriveProviderIdentities({
    provider: input.source.adapter.provider,
    providerAccountIdentifier: input.source.providerAccountIdentifier,
    sourceType: input.source.sourceType,
    sourceNativeId: input.source.sourceNativeId,
    outputDiscriminators: [
      providerAdapterCatalog.recordingDocument.outputDiscriminator,
    ],
    eventSequence: input.eventSequence,
  })
  if (!connected.ok) return connected
  const document = createEntryIdentity(
    connected.value.outputs[0],
    input.repositoryIds?.document,
  )
  if (!document.ok) return document
  const provenance = createEntryIdentity(
    connected.value.conversion,
    input.repositoryIds?.provenance,
  )
  if (!provenance.ok) return provenance
  const application = createEntryIdentity(
    input.application.identity.identifier,
    input.application.identity.id,
  )
  if (!application.ok) return application
  const dataOrigin = createEntryIdentity(
    input.source.dataOrigin.identity.identifier,
    input.source.dataOrigin.identity.id,
  )
  if (!dataOrigin.ok) return dataOrigin

  const fullUrls = [
    document.value.fullUrl,
    provenance.value.fullUrl,
    application.value.fullUrl,
    dataOrigin.value.fullUrl,
  ]
  if (new Set(fullUrls).size !== fullUrls.length) {
    return err(
      'duplicate-identifier',
      'Every Bundle entry requires a distinct business identifier.',
    )
  }
  return ok({
    sourceRecord: connected.value.sourceRecord,
    exchange: connected.value.exchange,
    document: document.value,
    provenance: provenance.value,
    application: application.value,
    dataOrigin: dataOrigin.value,
  })
}

const providerTitle = (provider: ConnectedRawProvider): string =>
  providerAdapterCatalog.providers.find((entry) => entry.id === provider)
    ?.title ?? provider

const attachmentFor = (
  input: ProviderRecordingBundleInput['attachment'],
) => {
  if (input.kind === 'external') {
    return {
      contentType: input.contentType,
      url: input.url,
      size: input.size,
      hash: input.hash,
      title: input.title,
    }
  }
  const validatedBytes = decodeBase64(input.dataBase64)
  return {
    contentType: input.contentType,
    data: input.dataBase64,
    size: validatedBytes.length,
    hash: encodeBase64(sha1(validatedBytes)),
    title: input.title,
  }
}

/**
 * Builds the complete deterministic R4 graph for one already-obtained native
 * provider recording. This pure facade performs no fetching, authentication,
 * webhook handling, vendor parsing, or credential management.
 */
export const buildProviderRecordingBundle = (
  input: ProviderRecordingBundleInput,
): Result<CollectionBundle> => {
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
    ],
    identifier: [
      identifier(identities.value.sourceRecord),
      identifier(identities.value.document.identifier),
    ],
    status: 'current' as const,
    type: {
      text: `${providerTitle(validated.source.adapter.provider)} ${validated.source.sourceType} archive`,
    },
    subject: { reference: validated.subject },
    date: validated.documentDate,
    author: [{ reference: identities.value.application.fullUrl }],
    content: [{ attachment: attachmentFor(validated.attachment) }],
  }
  const application = makeApplicationDevice(validated.application)
  const dataOrigin = makeApplicationDevice(validated.source.dataOrigin)
  const provenance = {
    resourceType: 'Provenance' as const,
    ...resourceId(identities.value.provenance),
    meta: { profile: [PROFILES.providerConversionProvenance] },
    target: [{ reference: identities.value.document.fullUrl }],
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

  return parseCollectionBundle({
    resourceType: 'Bundle',
    ...(validated.repositoryIds?.bundle === undefined ?
      {}
    : { id: validated.repositoryIds.bundle }),
    meta: { profile: [PROFILES.mobileBundle] },
    identifier: identifier(identities.value.exchange),
    type: 'collection',
    timestamp: validated.recorded,
    entry: [
      identifiedEntry(identities.value.document, document),
      identifiedEntry(identities.value.dataOrigin, dataOrigin),
      identifiedEntry(identities.value.application, application),
      identifiedEntry(identities.value.provenance, provenance),
    ],
  })
}
