//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { v5 as uuidV5 } from 'uuid'
import { groveMobileContract } from './contract.js'
import { groveExchangeProtocol } from './measurement-catalog.generated.js'
import type {
  CompleteIdentifierInput,
  DeploymentIdentityInput,
  GroveIdentifierRole,
  GroveOpaqueIdentityKind,
  IdentifiedEntryIdentityInput,
} from './types.js'
import {
  cloneJsonValue,
  deepFreeze,
  err,
  ok,
  parseAbsoluteUri,
  parseFhirId,
  parseUrnUuid,
  type FhirId,
  type JsonValue,
  type Result,
  type UrnUuid,
} from '../core/index.js'
import { providerAdapterCatalog } from '../providers/contract.generated.js'

const ASCII_TOKEN = /^[A-Za-z\d._-]+$/u
const POSITIVE_DECIMAL = /^[1-9]\d*$/u
const UNSIGNED_DECIMAL = /^(?:0|[1-9]\d*)$/u
const LOWERCASE_ROLE = /^[a-z][a-z\d-]*$/u
const CANONICAL_PRODUCER_UUID =
  /^[\da-f]{8}-[\da-f]{4}-[1-5][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/u
const OPAQUE_VALUE = /^v0:[A-Za-z\d._-]+:[1-9]\d*:[A-Za-z\d_-]{43}$/u
const EVENT_VALUE =
  /^e0:[\da-f]{8}-[\da-f]{4}-[1-5][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}:[1-9]\d*$/u
const ENTRY_NODE_VALUE = /^n0:[a-z][a-z\d-]*:(?:0|[1-9]\d*):[A-Za-z\d_-]{43}$/u
const BASE64_URL = /^[A-Za-z\d_-]+$/u
const MINIMUM_HMAC_KEY_BYTES = 32

const PROVIDER_CODES: ReadonlySet<string> = new Set(
  providerAdapterCatalog.providers.map(({ id }) => id),
)
const PROVIDER_IDENTITY_KINDS: ReadonlySet<string> = new Set([
  'provider-record',
  'provider-output',
  'provider-artifact',
])
const GENERIC_SOURCE_IDENTITY_KINDS: ReadonlySet<string> = new Set([
  'source-record',
  'source-output',
  'source-artifact',
])

const identityKinds = groveExchangeProtocol.opaqueIdentity.identityKinds.map(
  ({ kind }) => kind,
) as readonly GroveOpaqueIdentityKind[]

const identityComponentCounts = Object.fromEntries(
  groveExchangeProtocol.opaqueIdentity.identityKinds.map(
    ({ kind, components }) => [kind, components.length],
  ),
) as Readonly<Record<GroveOpaqueIdentityKind, number>>

const identifierRoleByKind: Readonly<
  Record<
    GroveOpaqueIdentityKind,
    Exclude<GroveIdentifierRole, 'entry-node' | 'event'>
  >
> = Object.fromEntries(
  groveExchangeProtocol.opaqueIdentity.identityKinds.map(
    ({ kind, identifierRole }) => [kind, identifierRole],
  ),
) as Readonly<
  Record<
    GroveOpaqueIdentityKind,
    Exclude<GroveIdentifierRole, 'entry-node' | 'event'>
  >
>

type OpaqueIdentityDefinition =
  (typeof groveExchangeProtocol)['opaqueIdentity']['identityKinds'][number]

type StringComponentTuple<Components extends readonly string[]> = Readonly<{
  [Index in keyof Components]: string
}>

/** Exact ordered component tuples projected from the pinned protocol catalog. */
export type GroveOpaqueIdentityComponents = Readonly<{
  [Kind in GroveOpaqueIdentityKind]: StringComponentTuple<
    Extract<OpaqueIdentityDefinition, { readonly kind: Kind }>['components']
  >
}>

export const containsIsolatedSurrogate = (value: string): boolean => {
  if (typeof value !== 'string') return true
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!Number.isInteger(next) || next < 0xdc00 || next > 0xdfff) return true
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true
    }
  }
  return false
}

/** Grove's unsigned-32-bit big-endian length-prefixed UTF-8 field encoding. */
export const encodeLengthFramedUtf8 = (
  components: readonly string[],
): Result<Uint8Array> => {
  const snapshot = cloneJsonValue(components)
  if (!snapshot.ok) return snapshot
  if (!Array.isArray(snapshot.value)) {
    return err('invalid-type', 'Framed fields must be supplied as an array.')
  }
  let encoder: TextEncoder
  try {
    encoder = new TextEncoder()
  } catch {
    return err(
      'out-of-range',
      'The runtime could not initialize UTF-8 framing.',
    )
  }
  const encoded: Uint8Array[] = []
  let size = 0
  for (const [index, component] of snapshot.value.entries()) {
    if (typeof component !== 'string' || containsIsolatedSurrogate(component)) {
      return err(
        'invalid-identifier',
        'Framed fields must be strings containing Unicode scalar values only.',
        [index],
      )
    }
    let bytes: Uint8Array
    try {
      bytes = encoder.encode(component)
    } catch {
      return err(
        'out-of-range',
        'The runtime could not allocate a UTF-8 framed field.',
        [index],
      )
    }
    if (
      bytes.length > 0xffff_ffff ||
      size > Number.MAX_SAFE_INTEGER - bytes.length - 4
    ) {
      return err(
        'out-of-range',
        'A framed field is too large for unsigned-32-bit length framing.',
        [index],
      )
    }
    encoded.push(bytes)
    size += 4 + bytes.length
  }

  try {
    const framed = new Uint8Array(size)
    const view = new DataView(framed.buffer)
    let offset = 0
    for (const bytes of encoded) {
      view.setUint32(offset, bytes.length, false)
      offset += 4
      framed.set(bytes, offset)
      offset += bytes.length
    }
    return ok(framed)
  } catch {
    return err(
      'out-of-range',
      'The runtime could not allocate the complete UTF-8 frame.',
    )
  }
}

const base64UrlWithoutPadding = (bytes: Uint8Array): string => {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  let result = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0
    const second = bytes[index + 1]
    const third = bytes[index + 2]
    const block = (first << 16) | ((second ?? 0) << 8) | (third ?? 0)
    result += alphabet.charAt((block >>> 18) & 63)
    result += alphabet.charAt((block >>> 12) & 63)
    if (second !== undefined) result += alphabet.charAt((block >>> 6) & 63)
    if (third !== undefined) result += alphabet.charAt(block & 63)
  }
  return result
}

const decodeBase64UrlWithoutPadding = (
  value: string,
): Uint8Array | undefined => {
  if (
    typeof value !== 'string' ||
    !BASE64_URL.test(value) ||
    value.length % 4 === 1
  ) {
    return undefined
  }
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  const bytes: number[] = []
  let accumulator = 0
  let bits = 0
  for (const character of value) {
    const digit = alphabet.indexOf(character)
    if (digit < 0) return undefined
    accumulator = (accumulator << 6) | digit
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((accumulator >>> bits) & 0xff)
    }
  }
  if (bits > 0 && (accumulator & ((1 << bits) - 1)) !== 0) return undefined
  const decoded = Uint8Array.from(bytes)
  return base64UrlWithoutPadding(decoded) === value ? decoded : undefined
}

const isPublicConformanceKey = (key: Uint8Array): boolean =>
  key.length === 32 && key.every((value, index) => value === index)

const DEPLOYMENT_IDENTITY_KEYS = [
  'entryNodeIdentifierSystem',
  'eventIdentifierSystem',
  'keyEpoch',
  'keyId',
  'opaqueIdentifierSystems',
  'producerInstance',
  'secretBase64Url',
] as const

const validateDeploymentIdentityInternal = (
  input: unknown,
  allowPublicConformanceKey: boolean,
): Result<DeploymentIdentityInput> => {
  const snapshot = cloneJsonValue(input)
  if (!snapshot.ok) return snapshot
  if (
    typeof snapshot.value !== 'object' ||
    snapshot.value === null ||
    Array.isArray(snapshot.value)
  ) {
    return err(
      'missing-required',
      'Deployment identity configuration must be a complete object.',
    )
  }
  const rawCandidate = snapshot.value as Readonly<Record<string, JsonValue>>
  const deploymentKeys = Object.keys(rawCandidate)
  if (
    deploymentKeys.length !== DEPLOYMENT_IDENTITY_KEYS.length ||
    deploymentKeys.some(
      (key) => !(DEPLOYMENT_IDENTITY_KEYS as readonly string[]).includes(key),
    )
  ) {
    return err(
      'schema-invalid',
      'Deployment identity configuration contains missing or unknown fields.',
    )
  }
  const rawSystems = rawCandidate.opaqueIdentifierSystems
  if (
    typeof rawSystems !== 'object' ||
    rawSystems === null ||
    Array.isArray(rawSystems)
  ) {
    return err(
      'missing-required',
      'Deployment identity configuration must include its Identifier systems.',
      ['opaqueIdentifierSystems'],
    )
  }
  const candidate = rawCandidate as unknown as DeploymentIdentityInput
  const systemEntries = Object.entries(rawSystems)
  if (
    systemEntries.length !== identityKinds.length ||
    identityKinds.some((kind) => !Object.hasOwn(rawSystems, kind)) ||
    systemEntries.some(
      ([kind]) => !identityKinds.includes(kind as GroveOpaqueIdentityKind),
    ) ||
    systemEntries.some(([, system]) => !parseAbsoluteUri(system).ok) ||
    !parseAbsoluteUri(candidate.eventIdentifierSystem).ok ||
    !parseAbsoluteUri(candidate.entryNodeIdentifierSystem).ok
  ) {
    return err(
      'invalid-uri',
      'Every deployment identity system must be an absolute URI.',
      ['opaqueIdentifierSystems'],
    )
  }
  const systems = [
    ...systemEntries.map(([, system]) => system),
    candidate.eventIdentifierSystem,
    candidate.entryNodeIdentifierSystem,
  ]
  if (new Set(systems).size !== systems.length) {
    return err(
      'duplicate-identifier',
      'Each identity kind, event, and entry-node key space requires its own Identifier.system.',
      ['opaqueIdentifierSystems'],
    )
  }
  if (
    typeof candidate.keyId !== 'string' ||
    !ASCII_TOKEN.test(candidate.keyId)
  ) {
    return err(
      'invalid-identifier',
      'Identity keyId must be a nonempty ASCII token using A-Z, a-z, 0-9, dot, underscore, or hyphen.',
      ['keyId'],
    )
  }
  if (
    typeof candidate.keyEpoch !== 'string' ||
    !POSITIVE_DECIMAL.test(candidate.keyEpoch)
  ) {
    return err(
      'invalid-identifier',
      'Identity keyEpoch must be a canonical positive decimal string.',
      ['keyEpoch'],
    )
  }
  if (
    typeof candidate.producerInstance !== 'string' ||
    !CANONICAL_PRODUCER_UUID.test(candidate.producerInstance)
  ) {
    return err(
      'invalid-identifier',
      'producerInstance must be a canonical lowercase RFC 4122 UUID version 1 through 5.',
      ['producerInstance'],
    )
  }
  const secret = decodeBase64UrlWithoutPadding(candidate.secretBase64Url)
  if (secret === undefined || secret.byteLength < MINIMUM_HMAC_KEY_BYTES) {
    return err(
      'invalid-identifier',
      `Identity secret must be canonical unpadded base64url containing at least ${MINIMUM_HMAC_KEY_BYTES} bytes.`,
      ['secretBase64Url'],
    )
  }
  if (!allowPublicConformanceKey && isPublicConformanceKey(secret)) {
    return err(
      'invalid-identifier',
      'The public Grove conformance key is prohibited at public runtime boundaries.',
      ['secretBase64Url'],
    )
  }
  return ok(candidate)
}

/** Validates deployment identity material for every public production/runtime operation. */
export const validateDeploymentIdentity = (
  input: unknown,
): Result<DeploymentIdentityInput> =>
  validateDeploymentIdentityInternal(input, false)

const deriveOpaqueIdentifierInternal = <Kind extends GroveOpaqueIdentityKind>(
  deployment: DeploymentIdentityInput,
  identityKind: Kind,
  components: GroveOpaqueIdentityComponents[Kind],
  allowPublicConformanceKey: boolean,
): Result<CompleteIdentifierInput> => {
  if (
    typeof identityKind !== 'string' ||
    !Object.hasOwn(identityComponentCounts, identityKind)
  ) {
    return err(
      'invalid-code',
      'Identity kind is not part of the closed Grove v0 identity contract.',
      ['identityKind'],
    )
  }
  const validated = validateDeploymentIdentityInternal(
    deployment,
    allowPublicConformanceKey,
  )
  if (!validated.ok) return validated
  const componentSnapshot = cloneJsonValue(components)
  if (!componentSnapshot.ok) return componentSnapshot
  if (
    !Array.isArray(componentSnapshot.value) ||
    componentSnapshot.value.length !== identityComponentCounts[identityKind]
  ) {
    return err(
      'value-mismatch',
      `${identityKind} requires exactly ${identityComponentCounts[identityKind]} ordered components.`,
      ['components'],
    )
  }
  if (
    !componentSnapshot.value.every(
      (component): component is string => typeof component === 'string',
    )
  ) {
    return err(
      'invalid-identifier',
      'Opaque identity components must all be strings.',
      ['components'],
    )
  }
  const invalidComponentIndex = componentSnapshot.value.findIndex(
    (component) =>
      component.length === 0 || containsIsolatedSurrogate(component),
  )
  if (invalidComponentIndex >= 0) {
    return err(
      'invalid-identifier',
      'Opaque identity components must be nonempty Unicode-scalar strings.',
      ['components', invalidComponentIndex],
    )
  }
  const firstComponent = componentSnapshot.value[0]
  if (
    typeof firstComponent !== 'string' ||
    (PROVIDER_IDENTITY_KINDS.has(identityKind) &&
      !PROVIDER_CODES.has(firstComponent)) ||
    (GENERIC_SOURCE_IDENTITY_KINDS.has(identityKind) &&
      PROVIDER_CODES.has(firstComponent))
  ) {
    return err(
      'invalid-code',
      PROVIDER_IDENTITY_KINDS.has(identityKind) ?
        'A Provider identity kind requires one exact catalog provider code as its first component.'
      : 'Provider coordinates require the matching provider-record, provider-output, or provider-artifact identity kind.',
      ['components', 0],
    )
  }
  const preimage = encodeLengthFramedUtf8([
    groveMobileContract.identity.domain,
    identityKind,
    ...componentSnapshot.value,
  ])
  if (!preimage.ok) return preimage
  const secret = decodeBase64UrlWithoutPadding(validated.value.secretBase64Url)
  if (secret === undefined) {
    return err(
      'invalid-identifier',
      'Identity secret is not canonical base64url.',
    )
  }
  const digest = hmac(sha256, secret, preimage.value)
  return ok({
    system: validated.value.opaqueIdentifierSystems[identityKind],
    value: `v0:${validated.value.keyId}:${validated.value.keyEpoch}:${base64UrlWithoutPadding(digest)}`,
    role: identifierRoleByKind[identityKind],
  })
}

/** Derives one deployment-owned, role-typed Grove v0 HMAC Identifier. */
export const deriveOpaqueIdentifier = <Kind extends GroveOpaqueIdentityKind>(
  deployment: DeploymentIdentityInput,
  identityKind: Kind,
  components: GroveOpaqueIdentityComponents[Kind],
): Result<CompleteIdentifierInput> =>
  deriveOpaqueIdentifierInternal(deployment, identityKind, components, false)

/**
 * Internal test seam for the exact published normative vector key.
 *
 * Deliberately omitted from every package entry point; application code cannot opt into it.
 */
export const deriveConformanceVectorOpaqueIdentifier = <
  Kind extends GroveOpaqueIdentityKind,
>(
  deployment: DeploymentIdentityInput,
  identityKind: Kind,
  components: GroveOpaqueIdentityComponents[Kind],
): Result<CompleteIdentifierInput> => {
  const secret = decodeBase64UrlWithoutPadding(deployment.secretBase64Url)
  if (
    secret === undefined ||
    !isPublicConformanceKey(secret) ||
    deployment.keyId !== groveExchangeProtocol.testVectors.keyId ||
    deployment.keyEpoch !== groveExchangeProtocol.testVectors.epoch
  ) {
    return err(
      'invalid-identifier',
      'The internal conformance seam accepts only the exact published vector key.',
      ['secretBase64Url'],
    )
  }
  return deriveOpaqueIdentifierInternal(
    deployment,
    identityKind,
    components,
    true,
  )
}

/** Creates the sole event business Identifier for one immutable exchange assertion. */
export const deriveEventIdentifier = (
  deployment: DeploymentIdentityInput,
  sequence: string,
): Result<CompleteIdentifierInput> => {
  const validated = validateDeploymentIdentity(deployment)
  if (!validated.ok) return validated
  if (typeof sequence !== 'string' || !POSITIVE_DECIMAL.test(sequence)) {
    return err(
      'invalid-identifier',
      'Event sequence must be a canonical positive decimal string.',
      ['sequence'],
    )
  }
  return ok({
    system: validated.value.eventIdentifierSystem,
    value: `e0:${validated.value.producerInstance}:${sequence}`,
    role: 'event',
  })
}

/** Creates an unkeyed, event-scoped graph-node Identifier for a resource without business ID. */
export const deriveEntryNodeValue = (
  eventSystem: string,
  eventValue: string,
  role: string,
  ordinal: string,
): Result<string> => {
  if (
    typeof eventSystem !== 'string' ||
    typeof eventValue !== 'string' ||
    !parseAbsoluteUri(eventSystem).ok ||
    !EVENT_VALUE.test(eventValue)
  ) {
    return err(
      'invalid-identifier',
      'Entry-node derivation requires a complete canonical event Identifier.',
      ['event'],
    )
  }
  if (typeof role !== 'string' || !LOWERCASE_ROLE.test(role)) {
    return err(
      'invalid-code',
      'Entry-node role must be a lowercase code token.',
      ['role'],
    )
  }
  if (typeof ordinal !== 'string' || !UNSIGNED_DECIMAL.test(ordinal)) {
    return err(
      'invalid-identifier',
      'Entry-node ordinal must be a canonical unsigned decimal string.',
      ['ordinal'],
    )
  }
  const preimage = encodeLengthFramedUtf8([
    groveMobileContract.identity.entryNodeDomain,
    eventSystem,
    eventValue,
    role,
    ordinal,
  ])
  if (!preimage.ok) return preimage
  return ok(
    `n0:${role}:${ordinal}:${base64UrlWithoutPadding(sha256(preimage.value))}`,
  )
}

/** Creates an unkeyed, event-scoped graph-node Identifier for a resource without business ID. */
export const deriveEntryNodeIdentifier = (
  deployment: DeploymentIdentityInput,
  event: CompleteIdentifierInput,
  role: string,
  ordinal: string,
): Result<CompleteIdentifierInput> => {
  const validated = validateDeploymentIdentity(deployment)
  if (!validated.ok) return validated
  const eventSnapshot = cloneJsonValue(event)
  if (
    !eventSnapshot.ok ||
    typeof eventSnapshot.value !== 'object' ||
    eventSnapshot.value === null ||
    Array.isArray(eventSnapshot.value)
  ) {
    return err(
      'invalid-identifier',
      "Entry-node derivation requires this producer's complete typed event Identifier.",
      ['event'],
    )
  }
  const eventValue = eventSnapshot.value as unknown as CompleteIdentifierInput
  if (
    eventValue.system !== validated.value.eventIdentifierSystem ||
    eventValue.role !== 'event' ||
    typeof eventValue.value !== 'string' ||
    !EVENT_VALUE.test(eventValue.value) ||
    !eventValue.value.startsWith(`e0:${validated.value.producerInstance}:`)
  ) {
    return err(
      'invalid-identifier',
      "Entry-node derivation requires this producer's complete typed event Identifier.",
      ['event'],
    )
  }
  const value = deriveEntryNodeValue(
    eventValue.system,
    eventValue.value,
    role,
    ordinal,
  )
  if (!value.ok) return value
  return ok({
    system: validated.value.entryNodeIdentifierSystem,
    value: value.value,
    role: 'entry-node',
  })
}

const hasCanonicalSha256DigestSuffix = (value: string): boolean => {
  const digest = value.slice(value.lastIndexOf(':') + 1)
  return decodeBase64UrlWithoutPadding(digest)?.length === 32
}

export const isOpaqueIdentityValue = (value: string): boolean =>
  typeof value === 'string' &&
  OPAQUE_VALUE.test(value) &&
  hasCanonicalSha256DigestSuffix(value)

export const isEventIdentityValue = (value: string): boolean =>
  typeof value === 'string' && EVENT_VALUE.test(value)

export const isEntryNodeIdentityValue = (value: string): boolean =>
  typeof value === 'string' &&
  ENTRY_NODE_VALUE.test(value) &&
  hasCanonicalSha256DigestSuffix(value)

/** The UUID-v5 byte name for one identifier: length-framed UTF-8 `[system, value]`. */
export const entryIdentifierName = (
  input: CompleteIdentifierInput,
): Result<Uint8Array> => {
  const snapshot = cloneJsonValue(input)
  if (
    !snapshot.ok ||
    typeof snapshot.value !== 'object' ||
    snapshot.value === null ||
    Array.isArray(snapshot.value)
  ) {
    return err('invalid-type', 'Expected one complete Identifier.')
  }
  const identifier = snapshot.value as unknown as CompleteIdentifierInput
  if (!parseAbsoluteUri(identifier.system).ok) {
    return err('invalid-uri', 'Identifier.system must be an absolute URI.', [
      'system',
    ])
  }
  if (typeof identifier.value !== 'string' || identifier.value === '') {
    return err('invalid-identifier', 'Identifier.value must not be empty.', [
      'value',
    ])
  }
  return encodeLengthFramedUtf8([identifier.system, identifier.value])
}

/** Derives the protocol-mandated lowercase UUID-v5 Bundle entry fullUrl. */
export const deriveEntryFullUrl = (
  input: CompleteIdentifierInput,
): Result<UrnUuid> => {
  const name = entryIdentifierName(input)
  if (!name.ok) return name
  return parseUrnUuid(
    `urn:uuid:${uuidV5(name.value, groveMobileContract.identity.fullUrlNamespace)}`,
  )
}

/** Pairs a complete entry key with its deterministic exchange UUID URN. */
export const createEntryIdentity = (
  identifier: CompleteIdentifierInput,
  id?: FhirId,
): Result<IdentifiedEntryIdentityInput> => {
  if (id !== undefined && !parseFhirId(id).ok) {
    return err('invalid-identifier', 'Resource.id is not a valid FHIR id.', [
      'id',
    ])
  }
  const identifierSnapshot = cloneJsonValue(identifier)
  if (
    !identifierSnapshot.ok ||
    typeof identifierSnapshot.value !== 'object' ||
    identifierSnapshot.value === null ||
    Array.isArray(identifierSnapshot.value)
  ) {
    return err('invalid-type', 'Expected one complete entry Identifier.')
  }
  const safeIdentifier =
    identifierSnapshot.value as unknown as CompleteIdentifierInput
  const fullUrl = deriveEntryFullUrl(safeIdentifier)
  if (!fullUrl.ok) return fullUrl
  return ok(
    deepFreeze({
      fullUrl: fullUrl.value,
      identifier: {
        system: safeIdentifier.system,
        value: safeIdentifier.value,
        ...(safeIdentifier.role === undefined ?
          {}
        : { role: safeIdentifier.role }),
      },
      ...(id === undefined ? {} : { id }),
    }) as unknown as IdentifiedEntryIdentityInput,
  )
}
