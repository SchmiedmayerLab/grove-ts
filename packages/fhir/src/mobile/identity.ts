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
import { groveExchangeProtocol } from '../contract/measurement-catalog.generated.js'
import {
  cloneJsonValue,
  decodeCanonicalBase64,
  deepFreeze,
  encodeBase64,
  err,
  ok,
  parseAbsoluteUri,
  parseEntryNodeOrdinal,
  parseEventSequence,
  parseFhirId,
  parseIdentifierSystem,
  parseKeyEpoch,
  parsePartIndex,
  parseUrnUuid,
  type AbsoluteUri,
  type EntryNodeOrdinal,
  type EventSequence,
  type FhirId,
  type IdentifierSystem,
  type JsonValue,
  type KeyEpoch,
  type PartIndex,
  type Result,
  type UrnUuid,
} from '../core/index.js'

type OpaqueIdentityDefinition =
  (typeof groveExchangeProtocol)['opaqueIdentity']['identityKinds'][number]

/** Closed HMAC identity kinds of the Grove exchange protocol. */
export type OpaqueIdentityKind = OpaqueIdentityDefinition['kind']

/** Closed roles a deployment-owned Identifier carries in Identifier.type. */
export type GroveIdentifierRole =
  OpaqueIdentityDefinition['identifierRole'] | 'entry-node' | 'event'

/** A complete Identifier.system and Identifier.value pair; never a repository id. */
export interface BusinessIdentifier {
  readonly system: IdentifierSystem
  readonly value: string
}

export interface RoledIdentifier extends BusinessIdentifier {
  readonly role: GroveIdentifierRole
}

/** The sole business identifier of one exchange event, in the `e0:` form. */
export type ExchangeEventIdentifier = RoledIdentifier & {
  readonly role: 'event'
}

export type EntryNodeIdentifier = RoledIdentifier & {
  readonly role: 'entry-node'
}

/** The coordinates of an entry whose resource carries no business identifier. */
export interface EntryNodeKey {
  readonly event: ExchangeEventIdentifier
  readonly role: string
  readonly ordinal: EntryNodeOrdinal
}

/** One deployment-owned Identifier.system for each opaque identity kind. */
export type OpaqueIdentitySystems = Readonly<
  Record<OpaqueIdentityKind, IdentifierSystem>
>

/** All twelve deployment-owned identifier systems of one key id and epoch. */
export interface DeploymentIdentifierSystems {
  readonly opaque: OpaqueIdentitySystems
  readonly event: IdentifierSystem
  readonly entryNode: IdentifierSystem
}

/**
 * Deployment identity material before validation.
 *
 * The secret is read once by `validateOpaqueIdentityScope` and never retained in, or
 * emitted with, FHIR.
 */
export interface OpaqueIdentityScopeInput {
  readonly systems: DeploymentIdentifierSystems
  readonly keyId: string
  readonly keyEpoch: KeyEpoch
  /** Canonical unpadded base64url key material containing at least 32 bytes. */
  readonly secretBase64Url: string
  /** Canonical lowercase RFC 4122 UUID (versions 1 through 5). */
  readonly producerInstance: string
}

/** The validated handle that mints opaque identities; its key stays module-private. */
export interface OpaqueIdentityScope {
  readonly systems: DeploymentIdentifierSystems
  readonly keyId: string
  readonly keyEpoch: KeyEpoch
  readonly producerInstance: string
}

/** An entry key paired with the deterministic fullUrl derived from it. */
export interface EntryIdentity {
  readonly identifier: RoledIdentifier
  readonly fullUrl: UrnUuid
  readonly id?: FhirId
}

type StringComponentTuple<Components extends readonly string[]> = Readonly<{
  [Index in keyof Components]: string
}>

/** Exact ordered component tuples projected from the Grove FHIR protocol catalog. */
export type OpaqueIdentityComponents = Readonly<{
  [Kind in OpaqueIdentityKind]: StringComponentTuple<
    Extract<OpaqueIdentityDefinition, { readonly kind: Kind }>['components']
  >
}>

/** The coordinates of one record in an adapter's repository. */
export interface SourceRecordCoordinates {
  readonly adapterId: string
  readonly sourceType: string
  readonly repositoryScope: BusinessIdentifier
  readonly nativeRecordId: string
}

/** The coordinates that set one output apart from the others its record yields. */
export interface OutputCoordinates {
  readonly role: string
  readonly discriminator: string
}

/** The coordinates of one part of a recording its record carries. */
export interface ArtifactCoordinates {
  readonly formatCode: string
  readonly partIndex: PartIndex
}

/**
 * The opaque identity of one source record, which its output and artifact identities extend.
 *
 * The scope and the record's coordinates stay private to it; only the identifier serializes.
 */
export interface SourceRecordIdentity {
  /** The typed `source-record` identifier. */
  readonly identifier: RoledIdentifier
  /** Mints the `source-output` identifier of one output this record yields. */
  readonly output: (coordinates: OutputCoordinates) => Result<RoledIdentifier>
  /** Mints the `source-artifact` identifier of one part of a recording this record carries. */
  readonly artifact: (
    coordinates: ArtifactCoordinates,
  ) => Result<RoledIdentifier>
}

/** The opaque identity kinds only a source- or provider-record identity mints. */
export type RecordIdentityKind =
  | 'provider-artifact'
  | 'provider-output'
  | 'provider-record'
  | 'source-artifact'
  | 'source-output'
  | 'source-record'

type RecordKind = 'provider-record' | 'source-record'
type RecordComponents = OpaqueIdentityComponents[RecordKind]

interface RecordFamily {
  readonly adapter: string
  readonly scope: string
  readonly output: RecordIdentityKind
  readonly artifact: RecordIdentityKind
}

// Each family names its adapter and scope coordinates its own way; its output and artifact kinds
// extend the record kind's components with two of their own.
const RECORD_IDENTITIES: Readonly<Record<RecordKind, RecordFamily>> = {
  'source-record': {
    adapter: 'adapterId',
    scope: 'repositoryScope',
    output: 'source-output',
    artifact: 'source-artifact',
  },
  'provider-record': {
    adapter: 'providerCode',
    scope: 'providerScope',
    output: 'provider-output',
    artifact: 'provider-artifact',
  },
}

const ASCII_TOKEN = /^[A-Za-z\d._-]+$/u
const LOWERCASE_ROLE = /^[a-z][a-z\d-]*$/u
const CANONICAL_PRODUCER_UUID =
  /^[\da-f]{8}-[\da-f]{4}-[1-5][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/u
const MINIMUM_HMAC_KEY_BYTES = 32

// Each identity value form opens with its revision token, so the contract owns every
// persisted prefix and a renumbered revision reaches this package by regeneration alone.
const valuePrefix = (valueForm: string): string =>
  valueForm.slice(0, valueForm.indexOf(':') + 1)
const OPAQUE_PREFIX = valuePrefix(
  groveExchangeProtocol.opaqueIdentity.valueForm,
)
const EVENT_PREFIX = valuePrefix(
  groveExchangeProtocol.event.bundleIdentifier.valueForm,
)
const ENTRY_NODE_PREFIX = valuePrefix(
  groveExchangeProtocol.entryIdentity.entryNode.valueForm,
)
/** The revision tokens every persisted identity value opens with. */
export const identityValuePrefixes: Readonly<{
  opaque: string
  event: string
  entryNode: string
}> = Object.freeze({
  opaque: OPAQUE_PREFIX,
  event: EVENT_PREFIX,
  entryNode: ENTRY_NODE_PREFIX,
})
const OPAQUE_VALUE = new RegExp(
  `^${OPAQUE_PREFIX}[A-Za-z\\d._-]+:[1-9]\\d*:[A-Za-z\\d_-]{43}$`,
  'u',
)
const EVENT_VALUE = new RegExp(
  `^${EVENT_PREFIX}[\\da-f]{8}-[\\da-f]{4}-[1-5][\\da-f]{3}-[89ab][\\da-f]{3}-[\\da-f]{12}:[1-9]\\d*$`,
  'u',
)
const ENTRY_NODE_VALUE = new RegExp(
  `^${ENTRY_NODE_PREFIX}[a-z][a-z\\d-]*:(?:0|[1-9]\\d*):[A-Za-z\\d_-]{43}$`,
  'u',
)

const identityKinds = groveExchangeProtocol.opaqueIdentity.identityKinds.map(
  ({ kind }) => kind,
) as readonly OpaqueIdentityKind[]

const identityComponentNames = Object.fromEntries(
  groveExchangeProtocol.opaqueIdentity.identityKinds.map(
    ({ kind, components }): [string, readonly string[]] => [kind, components],
  ),
) as Readonly<Record<OpaqueIdentityKind, readonly string[]>>

const UNSIGNED_DECIMAL_COMPONENTS: ReadonlySet<string> = new Set(
  groveExchangeProtocol.opaqueIdentity.componentRequirements.unsignedDecimal,
)

const identifierRoleByKind = Object.fromEntries(
  groveExchangeProtocol.opaqueIdentity.identityKinds.map(
    ({ kind, identifierRole }) => [kind, identifierRole],
  ),
) as Readonly<
  Record<OpaqueIdentityKind, OpaqueIdentityDefinition['identifierRole']>
>

const IDENTIFIER_ROLES: ReadonlySet<string> = new Set([
  ...Object.values(identifierRoleByKind),
  'entry-node',
  'event',
])

const RECORD_IDENTITY_KINDS: ReadonlySet<unknown> = new Set(
  Object.entries(RECORD_IDENTITIES).flatMap(([kind, { output, artifact }]) => [
    kind,
    output,
    artifact,
  ]),
)

export const isGroveIdentifierRole = (
  value: unknown,
): value is GroveIdentifierRole =>
  typeof value === 'string' && IDENTIFIER_ROLES.has(value)

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

const base64UrlWithoutPadding = (bytes: Uint8Array): string =>
  encodeBase64(bytes, { urlSafe: true })

const decodeBase64UrlWithoutPadding = (value: string): Uint8Array | undefined =>
  decodeCanonicalBase64(value, { urlSafe: true })

const isPublicConformanceKey = (key: Uint8Array): boolean =>
  key.length === 32 && key.every((value, index) => value === index)

const SYSTEM_FORM_PLACEHOLDER = /<([a-z-]+)>/gu

const renderSystemForm = (
  form: string,
  values: Readonly<Record<string, string>>,
): string =>
  form.replaceAll(
    SYSTEM_FORM_PLACEHOLDER,
    (placeholder: string, name: string) => values[name] ?? placeholder,
  )

/**
 * Names all twelve deployment identifier systems by the catalog's recommended form.
 *
 * The root is the deployment's own absolute URI; a deployment that already governs its
 * own namespaces supplies them to `validateOpaqueIdentityScope` directly instead.
 */
export const deriveOpaqueIdentitySystems = (
  root: AbsoluteUri,
  keyId: string,
  epoch: KeyEpoch,
): Result<DeploymentIdentifierSystems> => {
  const parsedRoot = parseAbsoluteUri(root)
  if (!parsedRoot.ok) return parsedRoot
  if (/[#?]/u.test(root) || root.endsWith('/')) {
    return err(
      'invalid-uri',
      'A deployment root names a path without a trailing slash, query, or fragment.',
      ['root'],
    )
  }
  if (typeof keyId !== 'string' || !ASCII_TOKEN.test(keyId)) {
    return err(
      'invalid-identifier',
      'Identity keyId must be a nonempty ASCII token using A-Z, a-z, 0-9, dot, underscore, or hyphen.',
      ['keyId'],
    )
  }
  const parsedEpoch = parseKeyEpoch(epoch)
  if (!parsedEpoch.ok) return parsedEpoch

  const opaque: Partial<Record<OpaqueIdentityKind, IdentifierSystem>> = {}
  for (const kind of identityKinds) {
    const system = parseIdentifierSystem(
      renderSystemForm(
        groveExchangeProtocol.opaqueIdentity.recommendedSystemForm,
        {
          'deployment-root': root,
          'identity-kind': kind,
          'key-id': keyId,
          epoch,
        },
      ),
    )
    if (!system.ok) return system
    opaque[kind] = system.value
  }
  const event = parseIdentifierSystem(
    renderSystemForm(
      groveExchangeProtocol.event.bundleIdentifier.recommendedSystemForm,
      { 'deployment-root': root },
    ),
  )
  if (!event.ok) return event
  const entryNode = parseIdentifierSystem(
    renderSystemForm(
      groveExchangeProtocol.entryIdentity.entryNode.recommendedSystemForm,
      { 'deployment-root': root },
    ),
  )
  if (!entryNode.ok) return entryNode
  return ok(
    deepFreeze({
      opaque: opaque as OpaqueIdentitySystems,
      event: event.value,
      entryNode: entryNode.value,
    }),
  )
}

interface ResolvedScope {
  readonly scope: OpaqueIdentityScope
  readonly secret: Uint8Array
}

// Membership is the proof, and only frozen material is admitted: a handle a caller holds
// can be neither forged nor edited afterwards, so reuse cannot smuggle in new material.
const validatedScopes = new WeakSet<OpaqueIdentityScope>()
const scopeSecrets = new WeakMap<OpaqueIdentityScope, Uint8Array>()

export const isOpaqueIdentityScope = (
  value: unknown,
): value is OpaqueIdentityScope =>
  typeof value === 'object' &&
  value !== null &&
  validatedScopes.has(value as OpaqueIdentityScope)

const SCOPE_INPUT_KEYS = [
  'keyEpoch',
  'keyId',
  'producerInstance',
  'secretBase64Url',
  'systems',
] as const
const SYSTEM_KEYS = ['entryNode', 'event', 'opaque'] as const

const hasExactKeys = (
  record: Readonly<Record<string, JsonValue>>,
  keys: readonly string[],
): boolean => {
  const present = Object.keys(record)
  return (
    present.length === keys.length && present.every((key) => keys.includes(key))
  )
}

const asJsonObject = (
  value: JsonValue | undefined,
): Readonly<Record<string, JsonValue>> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ?
    (value as Readonly<Record<string, JsonValue>>)
  : undefined

const validateSystems = (
  value: JsonValue | undefined,
): Result<DeploymentIdentifierSystems> => {
  const systems = asJsonObject(value)
  const opaque = asJsonObject(systems?.opaque)
  if (
    systems === undefined ||
    opaque === undefined ||
    !hasExactKeys(systems, SYSTEM_KEYS)
  ) {
    return err(
      'missing-required',
      'Deployment identifier systems name the opaque, event, and entry-node systems and nothing else.',
      ['systems'],
    )
  }
  const opaqueEntries = Object.entries(opaque)
  if (
    !hasExactKeys(opaque, identityKinds) ||
    opaqueEntries.some(([, system]) => !parseIdentifierSystem(system).ok) ||
    !parseIdentifierSystem(systems.event).ok ||
    !parseIdentifierSystem(systems.entryNode).ok
  ) {
    return err(
      'invalid-uri',
      'Every deployment identifier system must be an absolute URI, one for each identity kind.',
      ['systems'],
    )
  }
  const all = [
    ...opaqueEntries.map(([, system]) => system),
    systems.event,
    systems.entryNode,
  ]
  if (new Set(all).size !== all.length) {
    return err(
      'duplicate-identifier',
      'Each identity kind, event, and entry-node key space requires its own Identifier.system.',
      ['systems'],
    )
  }
  return ok(systems as unknown as DeploymentIdentifierSystems)
}

const validateScopeInternal = (
  input: unknown,
  allowPublicConformanceKey: boolean,
): Result<ResolvedScope> => {
  const snapshot = cloneJsonValue(input)
  if (!snapshot.ok) return snapshot
  const candidate = asJsonObject(snapshot.value)
  if (candidate === undefined || !hasExactKeys(candidate, SCOPE_INPUT_KEYS)) {
    return err(
      'schema-invalid',
      'Identity scope input contains missing or unknown fields.',
    )
  }
  const systems = validateSystems(candidate.systems)
  if (!systems.ok) return systems
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
  const keyEpoch = parseKeyEpoch(candidate.keyEpoch)
  if (!keyEpoch.ok) return keyEpoch
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
  const secret =
    typeof candidate.secretBase64Url === 'string' ?
      decodeBase64UrlWithoutPadding(candidate.secretBase64Url)
    : undefined
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
  const scope: OpaqueIdentityScope = deepFreeze({
    systems: systems.value,
    keyId: candidate.keyId,
    keyEpoch: keyEpoch.value,
    producerInstance: candidate.producerInstance,
  })
  scopeSecrets.set(scope, secret)
  // Only publicly validated material is reusable; the conformance seam revalidates.
  if (!allowPublicConformanceKey) validatedScopes.add(scope)
  return ok({ scope, secret })
}

/** Validates deployment identity material once; every minting method takes the handle. */
export const validateOpaqueIdentityScope = (
  input: OpaqueIdentityScopeInput,
): Result<OpaqueIdentityScope> => {
  const resolved = validateScopeInternal(input, false)
  return resolved.ok ? ok(resolved.value.scope) : resolved
}

const resolveScope = (scope: unknown): Result<ResolvedScope> => {
  const secret =
    isOpaqueIdentityScope(scope) ? scopeSecrets.get(scope) : undefined
  if (!isOpaqueIdentityScope(scope) || secret === undefined) {
    return err(
      'invalid-identifier',
      'Expected the handle validateOpaqueIdentityScope returned.',
      ['scope'],
    )
  }
  return ok({ scope, secret })
}

/** Whether an event identifier was minted by this scope's producer instance. */
export const isEventOfScope = (
  scope: OpaqueIdentityScope,
  event: unknown,
): event is ExchangeEventIdentifier => {
  const candidate = asJsonObject(
    typeof event === 'object' && event !== null ? (event as JsonValue) : null,
  )
  return (
    candidate?.role === 'event' &&
    candidate.system === scope.systems.event &&
    typeof candidate.value === 'string' &&
    EVENT_VALUE.test(candidate.value) &&
    candidate.value.startsWith(`${EVENT_PREFIX}${scope.producerInstance}:`)
  )
}

const deriveOpaqueIdentifierWith = <Kind extends OpaqueIdentityKind>(
  resolved: ResolvedScope,
  identityKind: Kind,
  components: OpaqueIdentityComponents[Kind],
): Result<RoledIdentifier> => {
  if (
    typeof identityKind !== 'string' ||
    !Object.hasOwn(identityComponentNames, identityKind)
  ) {
    return err(
      'invalid-code',
      'Identity kind is not part of the closed Grove identity contract.',
      ['identityKind'],
    )
  }
  const componentSnapshot = cloneJsonValue(components)
  if (!componentSnapshot.ok) return componentSnapshot
  const componentNames = identityComponentNames[identityKind]
  if (
    !Array.isArray(componentSnapshot.value) ||
    componentSnapshot.value.length !== componentNames.length
  ) {
    return err(
      'value-mismatch',
      `${identityKind} requires exactly ${componentNames.length} ordered components.`,
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
  const nonCanonicalIndex = componentSnapshot.value.findIndex(
    (component, index) =>
      UNSIGNED_DECIMAL_COMPONENTS.has(componentNames[index] ?? '') &&
      !parsePartIndex(component).ok,
  )
  if (nonCanonicalIndex >= 0) {
    return err(
      'invalid-identifier',
      `${identityKind}.${componentNames[nonCanonicalIndex]} must be a canonical unsigned decimal.`,
      ['components', nonCanonicalIndex],
    )
  }
  const preimage = encodeLengthFramedUtf8([
    groveExchangeProtocol.opaqueIdentity.domain,
    identityKind,
    ...componentSnapshot.value,
  ])
  if (!preimage.ok) return preimage
  const { scope, secret } = resolved
  const digest = hmac(sha256, secret, preimage.value)
  return ok(
    deepFreeze({
      system: scope.systems.opaque[identityKind],
      value: `${OPAQUE_PREFIX}${scope.keyId}:${scope.keyEpoch}:${base64UrlWithoutPadding(digest)}`,
      role: identifierRoleByKind[identityKind],
    }),
  )
}

/** Mints one deployment-owned, role-typed opaque identifier of a kind no record identity mints. */
export const deriveOpaqueIdentifier = <
  Kind extends Exclude<OpaqueIdentityKind, RecordIdentityKind>,
>(
  scope: OpaqueIdentityScope,
  identityKind: Kind,
  components: OpaqueIdentityComponents[Kind],
): Result<RoledIdentifier> => {
  const resolved = resolveScope(scope)
  if (!resolved.ok) return resolved
  if (RECORD_IDENTITY_KINDS.has(identityKind)) {
    return err(
      'invalid-code',
      `${identityKind} is minted only through its record identity.`,
      ['identityKind'],
    )
  }
  return deriveOpaqueIdentifierWith(resolved.value, identityKind, components)
}

const isComponent = (value: JsonValue | undefined): value is string =>
  typeof value === 'string' && value !== '' && !containsIsolatedSurrogate(value)

const COMPONENT_MESSAGE =
  'Opaque identity components must be nonempty Unicode-scalar strings.'

// A snapshot of exactly the named fields, so a later edit of the caller's object never reaches
// an identity derived from it.
const closedCoordinates = (
  input: unknown,
  fields: readonly string[],
): Result<Readonly<Record<string, JsonValue>>> => {
  const snapshot = cloneJsonValue(input)
  if (!snapshot.ok) return snapshot
  const candidate = asJsonObject(snapshot.value)
  if (candidate === undefined || !hasExactKeys(candidate, fields)) {
    return err(
      'schema-invalid',
      `Identity coordinates name exactly ${fields.join(', ')}.`,
    )
  }
  return ok(candidate)
}

/** Internal: the ordered components of one record's coordinates under its family's names. */
export const parseRecordCoordinates = (
  kind: RecordKind,
  record: unknown,
): Result<RecordComponents> => {
  const { adapter, scope } = RECORD_IDENTITIES[kind]
  const candidate = closedCoordinates(record, [
    adapter,
    'sourceType',
    scope,
    'nativeRecordId',
  ])
  if (!candidate.ok) return candidate
  const recordScope = asJsonObject(candidate.value[scope])
  const components = [
    [candidate.value[adapter], [adapter]],
    [candidate.value.sourceType, ['sourceType']],
    [recordScope?.system, [scope, 'system']],
    [recordScope?.value, [scope, 'value']],
    [candidate.value.nativeRecordId, ['nativeRecordId']],
  ] as const
  const invalid = components.find(([value]) => !isComponent(value))
  if (invalid !== undefined) {
    return err('invalid-identifier', COMPONENT_MESSAGE, invalid[1])
  }
  if (!parseIdentifierSystem(recordScope?.system).ok) {
    return err('invalid-uri', `${scope}.system must be an absolute URI.`, [
      scope,
      'system',
    ])
  }
  return ok(components.map(([value]) => value) as unknown as RecordComponents)
}

const recordIdentityWith = (
  resolved: ResolvedScope,
  kind: RecordKind,
  components: RecordComponents,
): Result<SourceRecordIdentity> => {
  const identifier = deriveOpaqueIdentifierWith(resolved, kind, components)
  if (!identifier.ok) return identifier
  const { output, artifact } = RECORD_IDENTITIES[kind]
  return ok(
    deepFreeze({
      identifier: identifier.value,
      output: (coordinates: OutputCoordinates) => {
        const fields = closedCoordinates(coordinates, ['role', 'discriminator'])
        if (!fields.ok) return fields
        const { role, discriminator } = fields.value
        if (!isComponent(role)) {
          return err('invalid-identifier', COMPONENT_MESSAGE, ['role'])
        }
        if (!isComponent(discriminator)) {
          return err('invalid-identifier', COMPONENT_MESSAGE, ['discriminator'])
        }
        return deriveOpaqueIdentifierWith(resolved, output, [
          ...components,
          role,
          discriminator,
        ])
      },
      artifact: (coordinates: ArtifactCoordinates) => {
        const fields = closedCoordinates(coordinates, [
          'formatCode',
          'partIndex',
        ])
        if (!fields.ok) return fields
        const { formatCode } = fields.value
        if (!isComponent(formatCode)) {
          return err('invalid-identifier', COMPONENT_MESSAGE, ['formatCode'])
        }
        const partIndex = parsePartIndex(fields.value.partIndex)
        if (!partIndex.ok) {
          return err(
            'invalid-identifier',
            'A part index is a canonical unsigned decimal.',
            ['partIndex'],
          )
        }
        return deriveOpaqueIdentifierWith(resolved, artifact, [
          ...components,
          formatCode,
          partIndex.value,
        ])
      },
    }),
  )
}

/** Internal: the identity of one record whose coordinates `parseRecordCoordinates` validated. */
export const deriveRecordIdentity = (
  scope: OpaqueIdentityScope,
  kind: RecordKind,
  components: RecordComponents,
): Result<SourceRecordIdentity> => {
  const resolved = resolveScope(scope)
  if (!resolved.ok) return resolved
  return recordIdentityWith(resolved.value, kind, components)
}

/** Derives the identity of one source record; its outputs and artifacts mint through it. */
export const deriveSourceRecordIdentity = (
  scope: OpaqueIdentityScope,
  record: SourceRecordCoordinates,
): Result<SourceRecordIdentity> => {
  const components = parseRecordCoordinates('source-record', record)
  if (!components.ok) return components
  return deriveRecordIdentity(scope, 'source-record', components.value)
}

const resolveConformanceVectorScope = (
  input: OpaqueIdentityScopeInput,
): Result<ResolvedScope> => {
  const secret = decodeBase64UrlWithoutPadding(input.secretBase64Url)
  if (
    secret === undefined ||
    !isPublicConformanceKey(secret) ||
    input.keyId !== groveExchangeProtocol.testVectors.keyId ||
    input.keyEpoch !== groveExchangeProtocol.testVectors.epoch
  ) {
    return err(
      'invalid-identifier',
      'The internal conformance seam accepts only the exact published vector key.',
      ['secretBase64Url'],
    )
  }
  return validateScopeInternal(input, true)
}

/**
 * Internal test seams for the exact published normative vector key.
 *
 * Deliberately omitted from every package entry point; application code cannot opt into them.
 */
export const deriveConformanceVectorOpaqueIdentifier = <
  Kind extends Exclude<OpaqueIdentityKind, RecordIdentityKind>,
>(
  input: OpaqueIdentityScopeInput,
  identityKind: Kind,
  components: OpaqueIdentityComponents[Kind],
): Result<RoledIdentifier> => {
  const resolved = resolveConformanceVectorScope(input)
  if (!resolved.ok) return resolved
  return deriveOpaqueIdentifierWith(resolved.value, identityKind, components)
}

export const deriveConformanceVectorRecordIdentity = (
  input: OpaqueIdentityScopeInput,
  kind: RecordKind,
  record: unknown,
): Result<SourceRecordIdentity> => {
  const resolved = resolveConformanceVectorScope(input)
  if (!resolved.ok) return resolved
  const components = parseRecordCoordinates(kind, record)
  if (!components.ok) return components
  return recordIdentityWith(resolved.value, kind, components.value)
}

/** Mints the sole event business identifier for one immutable exchange assertion. */
export const deriveEventIdentifier = (
  scope: OpaqueIdentityScope,
  sequence: EventSequence,
): Result<ExchangeEventIdentifier> => {
  const resolved = resolveScope(scope)
  if (!resolved.ok) return resolved
  const parsed = parseEventSequence(sequence)
  if (!parsed.ok) return parsed
  return ok(
    deepFreeze({
      system: resolved.value.scope.systems.event,
      value: `${EVENT_PREFIX}${resolved.value.scope.producerInstance}:${parsed.value}`,
      role: 'event' as const,
    }),
  )
}

const validateEntryNodeKey = (key: unknown): Result<EntryNodeKey> => {
  const snapshot = cloneJsonValue(key)
  if (!snapshot.ok) return snapshot
  const candidate = asJsonObject(snapshot.value)
  const event = asJsonObject(candidate?.event)
  if (
    candidate === undefined ||
    event?.role !== 'event' ||
    !parseIdentifierSystem(event.system).ok ||
    typeof event.value !== 'string' ||
    !EVENT_VALUE.test(event.value)
  ) {
    return err(
      'invalid-identifier',
      'Entry-node derivation requires a complete canonical event Identifier.',
      ['event'],
    )
  }
  if (
    typeof candidate.role !== 'string' ||
    !LOWERCASE_ROLE.test(candidate.role)
  ) {
    return err(
      'invalid-code',
      'Entry-node role must be a lowercase code token.',
      ['role'],
    )
  }
  const ordinal = parseEntryNodeOrdinal(candidate.ordinal)
  if (!ordinal.ok) return ordinal
  return ok({
    event: event as unknown as ExchangeEventIdentifier,
    role: candidate.role,
    ordinal: ordinal.value,
  })
}

/** Derives the event-scoped node value a resource without a business identifier is keyed by. */
export const deriveEntryNodeValue = (key: EntryNodeKey): Result<string> => {
  const validated = validateEntryNodeKey(key)
  if (!validated.ok) return validated
  const { event, role, ordinal } = validated.value
  const preimage = encodeLengthFramedUtf8([
    groveExchangeProtocol.entryIdentity.entryNode.domain,
    event.system,
    event.value,
    role,
    ordinal,
  ])
  if (!preimage.ok) return preimage
  return ok(
    `${ENTRY_NODE_PREFIX}${role}:${ordinal}:${base64UrlWithoutPadding(sha256(preimage.value))}`,
  )
}

/** Mints the entry-node identifier of one of this producer's own events. */
export const deriveEntryNodeIdentifier = (
  scope: OpaqueIdentityScope,
  key: EntryNodeKey,
): Result<EntryNodeIdentifier> => {
  const resolved = resolveScope(scope)
  if (!resolved.ok) return resolved
  const validated = validateEntryNodeKey(key)
  if (!validated.ok) return validated
  if (!isEventOfScope(resolved.value.scope, validated.value.event)) {
    return err(
      'invalid-identifier',
      "Entry-node derivation requires this producer's complete typed event Identifier.",
      ['event'],
    )
  }
  const value = deriveEntryNodeValue(validated.value)
  if (!value.ok) return value
  return ok(
    deepFreeze({
      system: resolved.value.scope.systems.entryNode,
      value: value.value,
      role: 'entry-node' as const,
    }),
  )
}

const hasCanonicalSha256DigestSuffix = (value: string): boolean => {
  const digest = value.slice(value.lastIndexOf(':') + 1)
  return decodeBase64UrlWithoutPadding(digest)?.length === 32
}

export const isOpaqueIdentityValue = (value: unknown): boolean =>
  typeof value === 'string' &&
  OPAQUE_VALUE.test(value) &&
  hasCanonicalSha256DigestSuffix(value)

export const isEventIdentityValue = (value: unknown): boolean =>
  typeof value === 'string' && EVENT_VALUE.test(value)

export const isEntryNodeIdentityValue = (value: unknown): boolean =>
  typeof value === 'string' &&
  ENTRY_NODE_VALUE.test(value) &&
  hasCanonicalSha256DigestSuffix(value)

/** The UUID-v5 byte name for one identifier: length-framed UTF-8 `[system, value]`. */
export const entryIdentifierName = (
  input: BusinessIdentifier,
): Result<Uint8Array> => {
  const snapshot = cloneJsonValue(input)
  if (!snapshot.ok) return snapshot
  const identifier = asJsonObject(snapshot.value)
  if (identifier === undefined) {
    return err('invalid-type', 'Expected one complete Identifier.')
  }
  if (!parseIdentifierSystem(identifier.system).ok) {
    return err('invalid-uri', 'Identifier.system must be an absolute URI.', [
      'system',
    ])
  }
  if (typeof identifier.value !== 'string' || identifier.value === '') {
    return err('invalid-identifier', 'Identifier.value must not be empty.', [
      'value',
    ])
  }
  return encodeLengthFramedUtf8([identifier.system as string, identifier.value])
}

/** Derives the protocol-mandated lowercase UUID-v5 Bundle entry fullUrl. */
export const deriveEntryFullUrl = (
  input: BusinessIdentifier,
): Result<UrnUuid> => {
  const name = entryIdentifierName(input)
  if (!name.ok) return name
  return parseUrnUuid(
    `urn:uuid:${uuidV5(name.value, groveExchangeProtocol.entryIdentity.fullUrl.namespace)}`,
  )
}

/** Pairs a complete entry key with its deterministic exchange UUID URN. */
export const createEntryIdentity = (
  identifier: RoledIdentifier,
  id?: FhirId,
): Result<EntryIdentity> => {
  if (id !== undefined && !parseFhirId(id).ok) {
    return err('invalid-identifier', 'Resource.id is not a valid FHIR id.', [
      'id',
    ])
  }
  const snapshot = cloneJsonValue(identifier)
  if (!snapshot.ok) return snapshot
  const candidate = asJsonObject(snapshot.value)
  if (candidate === undefined || !isGroveIdentifierRole(candidate.role)) {
    return err(
      'invalid-identifier',
      'An entry key requires one complete Identifier with a Grove identifier role.',
      ['role'],
    )
  }
  const key = candidate as unknown as RoledIdentifier
  const fullUrl = deriveEntryFullUrl(key)
  if (!fullUrl.ok) return fullUrl
  return ok(
    deepFreeze({
      fullUrl: fullUrl.value,
      identifier: { system: key.system, value: key.value, role: key.role },
      ...(id === undefined ? {} : { id }),
    }),
  )
}
