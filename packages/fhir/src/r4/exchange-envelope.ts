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
import { groveExchangeProtocol } from '../contract/measurement-catalog.generated.js'
import {
  parseAbsoluteUri,
  type AbsoluteUri,
  type EntryNodeOrdinal,
} from '../core/index.js'
import {
  deriveEntryFullUrl,
  deriveEntryNodeValue,
  isEntryNodeIdentityValue,
  isEventIdentityValue,
  isOpaqueIdentityValue,
  type ExchangeEventIdentifier,
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
  groveExchangeProtocol.lifecycle.active.entryResourcePolicy
const EXCHANGE_BUNDLE_PROFILE = groveExchangeProtocol.profiles.activeBundle
const RETRACTION_BUNDLE_PROFILE =
  groveExchangeProtocol.profiles.retractionBundle
// Resources a bundled study context keys by these catalog roles, and the lifecycle Provenance.
const ENTRY_NODE_ROLE_BY_RESOURCE_TYPE: ReadonlyMap<string, string> = new Map([
  ['Patient', 'patient'],
  ['ResearchStudy', 'research-study'],
  ['ResearchSubject', 'research-subject'],
  ['PlanDefinition', 'plan-definition'],
])
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
  const exchangeProfiles = new Set<string>([
    EXCHANGE_BUNDLE_PROFILE,
    RETRACTION_BUNDLE_PROFILE,
  ])
  const claimed = (bundle.meta?.profile ?? []).filter(
    (profile): profile is string =>
      typeof profile === 'string' && exchangeProfiles.has(profile),
  )
  if (claimed.length !== 1 || claimed[0] !== requiredProfile) {
    addIssue(context, 'mobile-exchange.bundle-profile', ['meta', 'profile'])
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
      addIssue(context, 'mobile-exchange.identity-system-role', located.path)
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
    addIssue(context, 'mobile-exchange.collection-entry-operation', [
      'entry',
      index,
    ])
  }
  if (typeof entry.fullUrl !== 'string' || !isLowercaseUuidV5(entry.fullUrl)) {
    addIssue(context, 'mobile-exchange.deterministic-full-url', [
      'entry',
      index,
      'fullUrl',
    ])
    return undefined
  }
  if (state.fullUrls.has(entry.fullUrl)) {
    addIssue(context, 'mobile-exchange.deterministic-full-url', [
      'entry',
      index,
      'fullUrl',
    ])
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
  addIssue(context, 'mobile-exchange.entry-node-ordinal', [
    'entry',
    index,
    'extension',
  ])
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
      deriveEntryNodeValue({
        event: {
          system: event.system,
          value: event.value,
          role: 'event',
        } as ExchangeEventIdentifier,
        role: parts[1] ?? '',
        ordinal: (parts[2] ?? '') as EntryNodeOrdinal,
      })
    )
  if (!expected?.ok || expected.value !== key.value) {
    addIssue(context, 'mobile-exchange.entry-node-digest', [
      'entry',
      index,
      'extension',
    ])
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
  if (role === 'entry-node') {
    // A key typed entry-node that is not in the n0 form selects nothing.
    if (!isEntryNodeIdentityValue(key.value)) {
      addIssue(context, 'mobile-exchange.entry-key-selection', [
        'entry',
        index,
        'extension',
      ])
      return
    }
    validateEntryNodeDigest(key, event, index, context)
    validateEntryNodeOrdinal(
      key,
      state.entryNodeOrdinals.get(index),
      index,
      context,
    )
  } else if (
    role === undefined ||
    !OPAQUE_IDENTIFIER_ROLES.has(role) ||
    !isOpaqueIdentityValue(key.value)
  ) {
    addIssue(context, 'mobile-exchange.entry-node-key', [
      'entry',
      index,
      'extension',
    ])
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
    addIssue(context, 'mobile-exchange.entry-node-key', [
      'entry',
      index,
      'extension',
    ])
    return undefined
  }
  const pair = identifierPairKey(key)
  if (state.keyPairs.has(pair)) {
    addIssue(context, 'mobile-exchange.distinct-entry-key', [
      'entry',
      index,
      'extension',
    ])
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
    addIssue(context, 'mobile-exchange.entry-resource-type', [
      'entry',
      index,
      'resource',
      'resourceType',
    ])
  }
  if ('contained' in resource) {
    addIssue(context, 'mobile-exchange.contained-resource-prohibited', [
      'entry',
      index,
      'resource',
      'contained',
    ])
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
  const declaredType = asRecord(resource)?.resourceType
  const resourceType =
    typeof declaredType === 'string' ? declaredType : 'Resource'
  for (const [position, candidate] of identifiersOf(resource).entries()) {
    const groveRoles = groveIdentifierRoles(candidate)
    if (groveRoles.length === 0) continue
    const path = ['entry', index, 'resource', 'identifier', position]
    const location = `${resourceType}.identifier[${String(position)}]`
    const role = identifierRole(candidate)
    if (role === undefined || !OPAQUE_IDENTIFIER_ROLES.has(role)) {
      addIssue(context, 'mobile-exchange.identifier-role', path, { location })
      continue
    }
    const count = (roleCounts.get(role) ?? 0) + 1
    roleCounts.set(role, count)
    if (count > 1) {
      addIssue(
        context,
        'mobile-exchange.distinct-resource-identity-role',
        path,
        {
          location,
        },
      )
    }
    if (
      !completeIdentifier(candidate) ||
      !parseAbsoluteUri(candidate.system).ok ||
      !isOpaqueIdentityValue(candidate.value)
    ) {
      addIssue(context, 'mobile-exchange.opaque-resource-identity', path, {
        location,
      })
    }
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
    addIssue(context, 'mobile-exchange.entry-key-selection', [
      'entry',
      index,
      'extension',
    ])
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
    requiredProfile === RETRACTION_BUNDLE_PROFILE ?
      'retraction-provenance'
    : 'conversion-provenance'
  if (parts?.[1] !== expectedRole || parts[2] !== '0') {
    addIssue(context, 'mobile-exchange.entry-node-ordinal', [
      'entry',
      index,
      'extension',
    ])
  }
}

// A study context keys its supporting entries by the catalog's closed node roles, so a
// receiver reads which resource an entry-node key stands for from the key alone.
const validateStudyContextEntryNode = (
  resource: UnknownRecord,
  key: CompleteIdentifier,
  role: string | undefined,
  index: number,
  context: z.core.$RefinementCtx,
): void => {
  const expectedRole = ENTRY_NODE_ROLE_BY_RESOURCE_TYPE.get(
    String(resource.resourceType),
  )
  if (
    expectedRole === undefined ||
    role !== 'entry-node' ||
    parseEntryNodeParts(key.value)?.[1] === expectedRole
  ) {
    return
  }
  addIssue(
    context,
    'mobile-support.study-context',
    ['entry', index, 'extension'],
    { location: `Bundle.entry[${String(index)}].extension.valueIdentifier` },
  )
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
    addIssue(context, 'mobile-exchange.entry-resource-type', [
      'entry',
      index,
      'resource',
    ])
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
  validateStudyContextEntryNode(
    resource,
    key.identifier,
    key.role,
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
    addIssue(context, 'mobile-exchange.deterministic-full-url', [
      'entry',
      index,
      'fullUrl',
    ])
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
      { location: `${bundleLocation}.reference` },
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
        { location: `${resourceLocation}.type` },
      )
    }
  }
  if (state.internalLogicalReferences.has(located.reference)) {
    addIssue(
      context,
      'mobile-exchange.reference-shape',
      ['entry', entryIndex, 'resource', ...located.path],
      { location: bundleLocation },
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
  if (groveIdentifierRoles(bundle.identifier).length !== 1) {
    addIssue(context, 'mobile-exchange.identifier-role', ['identifier'])
  }
  if (
    !completeIdentifier(bundle.identifier) ||
    !parseAbsoluteUri(bundle.identifier.system).ok ||
    identifierRole(bundle.identifier) !== 'event' ||
    !isEventIdentityValue(bundle.identifier.value)
  ) {
    addIssue(context, 'mobile-exchange.event-identity', ['identifier'])
    return undefined
  }
  if (bundle.timestamp === undefined) {
    addIssue(context, 'mobile-exchange.event-times', ['timestamp'])
  }
  if (bundle.entry === undefined || bundle.entry.length === 0) {
    addIssue(context, 'mobile-exchange.entry-required', ['entry'])
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
  const active = requiredProfile === EXCHANGE_BUNDLE_PROFILE
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
