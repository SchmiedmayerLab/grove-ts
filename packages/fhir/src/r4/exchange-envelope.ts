//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import type { z } from 'zod'
import {
  OPAQUE_IDENTIFIER_ROLES,
  addIssue,
  asRecord,
  completeIdentifier,
  entryKey,
  fhirLocation,
  groveIdentifierRoles,
  identifierPairEqual,
  identifierRole,
  identifiersOf,
  isLowercaseUuidV5,
  locatedGroveIdentifiers,
  locatedReferences,
  parseEntryNodeParts,
  selectedBusinessKey,
  type UnknownRecord,
  validateProfileReferenceTargets,
} from './graph-schema-utils.js'
import { validateProfiledResource } from './profile-semantics.js'
import type { R4CollectionBundle } from './types.js'
import { parseAbsoluteUri, type AbsoluteUri } from '../core/index.js'
import { groveMobileContract } from '../mobile/contract.js'
import {
  deriveEntryFullUrl,
  deriveEntryNodeValue,
  isEntryNodeIdentityValue,
  isEventIdentityValue,
  isOpaqueIdentityValue,
} from '../mobile/identity.js'

type CompleteIdentifier = Readonly<{ system: string; value: string }>

export interface ValidatedEnvelope {
  readonly entries: readonly UnknownRecord[]
  readonly event: CompleteIdentifier
  readonly fullUrls: ReadonlySet<string>
  readonly resourcesByFullUrl: ReadonlyMap<string, UnknownRecord>
}

interface EnvelopeState {
  readonly fullUrls: Set<string>
  readonly keyPairs: Set<string>
  readonly internalLogicalReferences: Set<string>
  readonly resourcesByFullUrl: Map<string, UnknownRecord>
  /** Ordinal each entry-node entry owes the graph, counted over Bundle order alone. */
  readonly entryNodeOrdinals: ReadonlyMap<number, string>
}

interface ValidatedEntryKey {
  readonly identifier: CompleteIdentifier
  readonly role: string | undefined
}

const ACTIVE_ENTRY_POLICY =
  groveMobileContract.lifecycle.activeEntryResourcePolicy
const ACTIVE_ENTRY_TYPES: ReadonlySet<string> = new Set([
  ...ACTIVE_ENTRY_POLICY.outputResourceTypes,
  ...ACTIVE_ENTRY_POLICY.supportingResourceTypes,
  ACTIVE_ENTRY_POLICY.lifecycleResourceType,
])

const identifierPairKey = (identifier: CompleteIdentifier): string =>
  `${identifier.system.length}:${identifier.system}${identifier.value.length}:${identifier.value}`

const validateEnvelopeProfile = (
  bundle: R4CollectionBundle,
  requiredProfile: string,
  context: z.core.$RefinementCtx,
): void => {
  const exchangeProfiles = new Set([
    groveMobileContract.profiles.exchangeBundle,
    groveMobileContract.profiles.retractionBundle,
  ])
  const claimed = (bundle.meta?.profile ?? []).filter(
    (profile): profile is string =>
      typeof profile === 'string' && exchangeProfiles.has(profile),
  )
  if (claimed.length !== 1 || claimed[0] !== requiredProfile) {
    addIssue(
      context,
      'mobile-exchange.profile',
      ['meta', 'profile'],
      `Bundle must declare ${requiredProfile}.`,
    )
  }
}

const validateIdentitySystemRoles = (
  bundle: R4CollectionBundle,
  context: z.core.$RefinementCtx,
): void => {
  const systemsByRole = new Map<string, string>()
  const rolesBySystem = new Map<string, string>()
  for (const located of locatedGroveIdentifiers(bundle)) {
    const priorSystem = systemsByRole.get(located.role)
    const priorRole = rolesBySystem.get(located.system)
    if (
      (priorSystem !== undefined && priorSystem !== located.system) ||
      (priorRole !== undefined && priorRole !== located.role)
    ) {
      addIssue(
        context,
        'mobile-exchange.identity-system-role',
        located.path,
        'Within one event, each Grove Identifier role must use one dedicated Identifier.system and a system must not serve multiple Grove roles.',
      )
      continue
    }
    systemsByRole.set(located.role, located.system)
    rolesBySystem.set(located.system, located.role)
  }
}

const validateEntryTransport = (
  entry: UnknownRecord,
  index: number,
  state: EnvelopeState,
  context: z.core.$RefinementCtx,
): string | undefined => {
  if (
    entry.search !== undefined ||
    entry.request !== undefined ||
    entry.response !== undefined
  ) {
    addIssue(
      context,
      'mobile-exchange.collection-entry',
      ['entry', index],
      'Exchange collection entries prohibit search, request, and response metadata.',
    )
  }
  if (typeof entry.fullUrl !== 'string' || !isLowercaseUuidV5(entry.fullUrl)) {
    addIssue(
      context,
      'mobile-exchange.deterministic-full-url',
      ['entry', index, 'fullUrl'],
      'entry.fullUrl must be a lowercase RFC 4122 UUID-v5 URN.',
    )
    return undefined
  }
  if (state.fullUrls.has(entry.fullUrl)) {
    addIssue(
      context,
      'mobile-exchange.distinct-full-url',
      ['entry', index, 'fullUrl'],
      'Bundle entry fullUrls must be unique.',
    )
  }
  state.fullUrls.add(entry.fullUrl)
  return entry.fullUrl
}

// A self-consistent ordinal hides inside its own digest, so the graph counts the
// entries sharing each node role itself and never reads the ordinal it is checking.
const entryNodeOrdinals = (
  entries: readonly UnknownRecord[],
): ReadonlyMap<number, string> => {
  const counts = new Map<string, number>()
  const ordinals = new Map<number, string>()
  for (const [index, entry] of entries.entries()) {
    const key = entryKey(entry)
    if (!completeIdentifier(key) || identifierRole(key) !== 'entry-node') {
      continue
    }
    const role = parseEntryNodeParts(key.value)?.[1]
    if (role === undefined) continue
    const ordinal = counts.get(role) ?? 0
    ordinals.set(index, String(ordinal))
    counts.set(role, ordinal + 1)
  }
  return ordinals
}

const validateEntryNodeOrdinal = (
  key: CompleteIdentifier,
  expected: string | undefined,
  index: number,
  context: z.core.$RefinementCtx,
): void => {
  const written = parseEntryNodeParts(key.value)?.[2]
  if (written === undefined || expected === undefined || written === expected) {
    return
  }
  addIssue(
    context,
    'mobile-exchange.entry-node-ordinal',
    ['entry', index, 'extension'],
    `This entry is number ${expected} among the entries sharing its node role, so its entry-node ordinal cannot be ${written}.`,
  )
}

const validateEntryNodeDigest = (
  key: CompleteIdentifier,
  event: CompleteIdentifier,
  index: number,
  context: z.core.$RefinementCtx,
): void => {
  const parts = parseEntryNodeParts(key.value)
  const expected =
    parts === null ? undefined : (
      deriveEntryNodeValue(
        event.system,
        event.value,
        parts[1] ?? '',
        parts[2] ?? '',
      )
    )
  if (
    !isEntryNodeIdentityValue(key.value) ||
    !expected?.ok ||
    expected.value !== key.value
  ) {
    addIssue(
      context,
      'mobile-exchange.entry-node-digest',
      ['entry', index, 'extension'],
      'An entry-node digest must be derived from this event, role, and ordinal.',
    )
  }
}

const validateEntryKeyValue = (
  key: CompleteIdentifier,
  role: string | undefined,
  event: CompleteIdentifier,
  index: number,
  state: EnvelopeState,
  context: z.core.$RefinementCtx,
): void => {
  if (role === undefined) {
    addIssue(
      context,
      'mobile-exchange.entry-key-role',
      ['entry', index, 'extension'],
      'The entry key requires one Grove Identifier role.',
    )
  } else if (role === 'entry-node') {
    validateEntryNodeDigest(key, event, index, context)
    validateEntryNodeOrdinal(
      key,
      state.entryNodeOrdinals.get(index),
      index,
      context,
    )
  } else if (
    !OPAQUE_IDENTIFIER_ROLES.has(role) ||
    !isOpaqueIdentityValue(key.value)
  ) {
    addIssue(
      context,
      'mobile-exchange.opaque-entry-key',
      ['entry', index, 'extension'],
      'Business entry keys require a closed role and canonical Grove HMAC value.',
    )
  }
}

const validateEntryKey = (
  entry: UnknownRecord,
  event: CompleteIdentifier,
  index: number,
  state: EnvelopeState,
  context: z.core.$RefinementCtx,
): ValidatedEntryKey | undefined => {
  const key = entryKey(entry)
  if (!completeIdentifier(key)) {
    addIssue(
      context,
      'mobile-exchange.entry-node-key',
      ['entry', index, 'extension'],
      'Every entry requires exactly one complete Grove entry-node-key Identifier.',
    )
    return undefined
  }
  const pair = identifierPairKey(key)
  if (state.keyPairs.has(pair)) {
    addIssue(
      context,
      'mobile-exchange.distinct-entry-key',
      ['entry', index, 'extension'],
      'Entry node-key Identifier pairs must be distinct.',
    )
  }
  state.keyPairs.add(pair)
  const role = identifierRole(key)
  validateEntryKeyValue(key, role, event, index, state, context)
  return { identifier: key, role }
}

const validateResourceShape = (
  resource: UnknownRecord,
  active: boolean,
  index: number,
  state: EnvelopeState,
  context: z.core.$RefinementCtx,
): void => {
  const resourceType = resource.resourceType
  if (
    active &&
    (typeof resourceType !== 'string' || !ACTIVE_ENTRY_TYPES.has(resourceType))
  ) {
    addIssue(
      context,
      'mobile-exchange.entry-resource-type',
      ['entry', index, 'resource', 'resourceType'],
      'An active event admits only its catalog-closed output, supporting, and lifecycle resource types.',
    )
  }
  if ('contained' in resource) {
    addIssue(
      context,
      'mobile-exchange.contained-resource-prohibited',
      ['entry', index, 'resource', 'contained'],
      'Mobile exchange event graphs prohibit contained resources.',
    )
  }
  if (typeof resourceType === 'string' && typeof resource.id === 'string') {
    state.internalLogicalReferences.add(`${resourceType}/${resource.id}`)
  }
}

const resourceIdentityRoleCounts = (
  resource: unknown,
  index: number,
  context: z.core.$RefinementCtx,
): ReadonlyMap<string, number> => {
  const roleCounts = new Map<string, number>()
  for (const candidate of identifiersOf(resource)) {
    const groveRoles = groveIdentifierRoles(candidate)
    const role = identifierRole(candidate)
    if (groveRoles.length === 0) continue
    if (role === undefined || !OPAQUE_IDENTIFIER_ROLES.has(role)) {
      addIssue(
        context,
        'mobile-exchange.identifier-role',
        ['entry', index, 'resource', 'identifier'],
        'A Grove-typed resource Identifier requires exactly one closed opaque identity role.',
      )
      continue
    }
    roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1)
    if (
      !completeIdentifier(candidate) ||
      !parseAbsoluteUri(candidate.system).ok ||
      !isOpaqueIdentityValue(candidate.value)
    ) {
      addIssue(
        context,
        'mobile-exchange.opaque-resource-identity',
        ['entry', index, 'resource', 'identifier'],
        'A typed resource identity must be one complete canonical Grove HMAC Identifier.',
      )
    }
  }
  if ([...roleCounts.values()].some((count) => count > 1)) {
    addIssue(
      context,
      'mobile-exchange.distinct-resource-identity-role',
      ['entry', index, 'resource', 'identifier'],
      'A resource may carry at most one Identifier for each Grove identity role.',
    )
  }
  return roleCounts
}

const validateSelectedEntryKey = (
  resource: unknown,
  key: CompleteIdentifier,
  role: string | undefined,
  index: number,
  context: z.core.$RefinementCtx,
): void => {
  const selected = selectedBusinessKey(resource)
  if (
    (selected === undefined && role !== 'entry-node') ||
    (selected !== undefined && !identifierPairEqual(selected, key))
  ) {
    addIssue(
      context,
      'mobile-exchange.entry-key-selection',
      ['entry', index, 'extension'],
      'The entry key must be the highest-priority typed business Identifier, or entry-node when none exists.',
    )
  }
}

const validateProvenanceEntryNode = (
  resource: UnknownRecord,
  key: CompleteIdentifier,
  role: string | undefined,
  requiredProfile: string,
  index: number,
  context: z.core.$RefinementCtx,
): void => {
  if (resource.resourceType !== 'Provenance' || role !== 'entry-node') return
  const parts = parseEntryNodeParts(key.value)
  const expectedRole =
    requiredProfile === groveMobileContract.profiles.retractionBundle ?
      'retraction-provenance'
    : 'conversion-provenance'
  if (parts?.[1] !== expectedRole || parts[2] !== '0') {
    addIssue(
      context,
      'mobile-exchange.provenance-node-key',
      ['entry', index, 'extension'],
      `Provenance requires the ${expectedRole} entry-node at ordinal zero.`,
    )
  }
}

const validateEntryResource = (
  entry: UnknownRecord,
  fullUrl: string,
  key: ValidatedEntryKey,
  requiredProfile: string,
  active: boolean,
  index: number,
  state: EnvelopeState,
  context: z.core.$RefinementCtx,
): void => {
  if (entry.resource === undefined) {
    addIssue(
      context,
      'mobile-exchange.resource-required',
      ['entry', index, 'resource'],
      'Every exchange entry requires a resource.',
    )
    return
  }
  const resource = asRecord(entry.resource) ?? {}
  validateResourceShape(resource, active, index, state, context)
  state.resourcesByFullUrl.set(fullUrl, resource)
  const roleCounts = resourceIdentityRoleCounts(entry.resource, index, context)
  validateProfiledResource(entry.resource, roleCounts, context, [
    'entry',
    index,
    'resource',
  ])
  validateSelectedEntryKey(
    entry.resource,
    key.identifier,
    key.role,
    index,
    context,
  )
  validateProvenanceEntryNode(
    resource,
    key.identifier,
    key.role,
    requiredProfile,
    index,
    context,
  )
}

const validateDerivedFullUrl = (
  fullUrl: string,
  key: CompleteIdentifier,
  index: number,
  context: z.core.$RefinementCtx,
): void => {
  const derived = deriveEntryFullUrl({
    system: key.system as AbsoluteUri,
    value: key.value,
  })
  if (!derived.ok || derived.value !== fullUrl) {
    addIssue(
      context,
      'mobile-exchange.deterministic-full-url',
      ['entry', index, 'fullUrl'],
      'entry.fullUrl must be UUID-v5 over the length-framed entry key pair.',
    )
  }
}

const validateEntry = (
  entry: UnknownRecord,
  event: CompleteIdentifier,
  requiredProfile: string,
  active: boolean,
  index: number,
  state: EnvelopeState,
  context: z.core.$RefinementCtx,
): void => {
  const fullUrl = validateEntryTransport(entry, index, state, context)
  if (fullUrl === undefined) return
  const key = validateEntryKey(entry, event, index, state, context)
  if (key === undefined) return
  validateEntryResource(
    entry,
    fullUrl,
    key,
    requiredProfile,
    active,
    index,
    state,
    context,
  )
  validateDerivedFullUrl(fullUrl, key.identifier, index, context)
}

const validateLocatedReference = (
  located: ReturnType<typeof locatedReferences>[number],
  resource: UnknownRecord | undefined,
  entryIndex: number,
  state: EnvelopeState,
  context: z.core.$RefinementCtx,
): void => {
  const bundleLocation = fhirLocation('Bundle', [
    'entry',
    entryIndex,
    'resource',
    ...located.path,
  ])
  const resourceLocation = fhirLocation(
    typeof resource?.resourceType === 'string' ?
      resource.resourceType
    : 'Resource',
    located.path,
  )
  if (!state.fullUrls.has(located.reference)) {
    addIssue(
      context,
      'mobile-exchange.resolved-reference',
      ['entry', entryIndex, 'resource', ...located.path],
      `Literal reference ${located.reference} does not resolve to one Bundle entry fullUrl.`,
      `${bundleLocation}.reference`,
    )
  } else {
    const targetType = state.resourcesByFullUrl.get(
      located.reference,
    )?.resourceType
    if (
      located.type !== undefined &&
      (typeof targetType !== 'string' || located.type !== targetType)
    ) {
      addIssue(
        context,
        'mobile-exchange.reference-declared-type',
        ['entry', entryIndex, 'resource', ...located.path, 'type'],
        'Reference.type must agree with the resolved internal resource type.',
        `${resourceLocation}.type`,
      )
    }
  }
  if (state.internalLogicalReferences.has(located.reference)) {
    addIssue(
      context,
      'mobile-exchange.internal-reference-full-url',
      ['entry', entryIndex, 'resource', ...located.path],
      `Reference ${located.reference} targets a Bundle entry and must use that entry's UUID fullUrl.`,
    )
  }
}

const validateEnvelopeReferences = (
  entries: readonly UnknownRecord[],
  state: EnvelopeState,
  context: z.core.$RefinementCtx,
): void => {
  for (const [index, entry] of entries.entries()) {
    const resource = asRecord(entry.resource)
    for (const located of locatedReferences(entry.resource)) {
      validateLocatedReference(located, resource, index, state, context)
    }
    if (resource !== undefined) {
      validateProfileReferenceTargets(
        resource,
        state.resourcesByFullUrl,
        context,
        ['entry', index, 'resource'],
      )
    }
  }
}

export const validateExchangeEnvelope = (
  bundle: R4CollectionBundle,
  context: z.core.$RefinementCtx,
  requiredProfile: string,
): ValidatedEnvelope | undefined => {
  validateEnvelopeProfile(bundle, requiredProfile, context)
  if (
    !completeIdentifier(bundle.identifier) ||
    !parseAbsoluteUri(bundle.identifier.system).ok ||
    identifierRole(bundle.identifier) !== 'event' ||
    !isEventIdentityValue(bundle.identifier.value)
  ) {
    addIssue(
      context,
      'mobile-exchange.event-identity',
      ['identifier'],
      'Bundle.identifier must be one complete typed canonical e0 event Identifier.',
    )
    return undefined
  }
  if (bundle.timestamp === undefined) {
    addIssue(
      context,
      'mobile-exchange.assembled-time',
      ['timestamp'],
      'Bundle.timestamp is the mandatory graph assembly time.',
    )
  }
  if (bundle.entry === undefined || bundle.entry.length === 0) {
    addIssue(
      context,
      'mobile-exchange.entry-required',
      ['entry'],
      'An exchange event requires at least one entry.',
    )
    return undefined
  }

  validateIdentitySystemRoles(bundle, context)
  const entries = bundle.entry.map((entry) => entry as UnknownRecord)
  const state: EnvelopeState = {
    fullUrls: new Set(),
    keyPairs: new Set(),
    internalLogicalReferences: new Set(),
    resourcesByFullUrl: new Map(),
    entryNodeOrdinals: entryNodeOrdinals(entries),
  }
  const active = requiredProfile === groveMobileContract.profiles.exchangeBundle
  for (const [index, entry] of entries.entries()) {
    validateEntry(
      entry,
      bundle.identifier,
      requiredProfile,
      active,
      index,
      state,
      context,
    )
  }
  validateEnvelopeReferences(entries, state, context)
  return {
    entries,
    event: bundle.identifier,
    fullUrls: state.fullUrls,
    resourcesByFullUrl: state.resourcesByFullUrl,
  }
}
