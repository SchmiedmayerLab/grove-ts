//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import type { z } from 'zod'
import { validateMobileObservationSemantics } from './active-observation-semantics.js'
import {
  validateExchangeEnvelope,
  type ValidatedEnvelope,
} from './exchange-envelope.js'
import {
  APPLICATION_DEVICE_PROFILES,
  ISO_LIFECYCLE_SYSTEM,
  PROVENANCE_PARTICIPANT_SYSTEM,
  addIssue,
  asRecord,
  codingCount,
  codingCountForSystem,
  codingExists,
  completeIdentifier,
  identifierPairEqual,
  identifierRole,
  identifierWithRole,
  locatedReferences,
  type UnknownRecord,
} from './graph-schema-utils.js'
import type { R4CollectionBundle } from './types.js'
import {
  groveProfileClaims,
  healthConnectDataOriginApplication,
} from '../contract/measurement-catalog.generated.js'
import { parseAbsoluteUri } from '../core/index.js'
import { groveMobileContract } from '../mobile/contract.js'
import { isOpaqueIdentityValue } from '../mobile/identity.js'

export { hasAdmittedMobileObservationProfile } from './active-observation-semantics.js'
export { validateExchangeEnvelope, type ValidatedEnvelope }

const ACTIVE_ENTRY_POLICY =
  groveMobileContract.lifecycle.activeEntryResourcePolicy
const ACTIVE_OUTPUT_TYPES: ReadonlySet<string> = new Set(
  ACTIVE_ENTRY_POLICY.outputResourceTypes,
)
const ACTIVE_SUPPORTING_TYPES: ReadonlySet<string> = new Set(
  ACTIVE_ENTRY_POLICY.supportingResourceTypes,
)
const ACTIVE_ENTRY_TYPES: ReadonlySet<string> = new Set([
  ...ACTIVE_OUTPUT_TYPES,
  ...ACTIVE_SUPPORTING_TYPES,
  ACTIVE_ENTRY_POLICY.lifecycleResourceType,
])

/** Whether a top-level active event resource belongs to the protocol's closed entry set. */
export const isAdmittedActiveEntryResource = (resource: unknown): boolean => {
  const resourceType = asRecord(resource)?.resourceType
  return (
    typeof resourceType === 'string' && ACTIVE_ENTRY_TYPES.has(resourceType)
  )
}

/** Mobile event graphs prohibit the contained property, including an empty array. */
export const hasProhibitedContainedResource = (resource: unknown): boolean => {
  const record = asRecord(resource)
  return record !== undefined && 'contained' in record
}

export const validateAssemblerAgent = (
  provenance: UnknownRecord,
  envelope: ValidatedEnvelope,
  context: z.core.$RefinementCtx,
  path: ReadonlyArray<number | string>,
): void => {
  const agents = Array.isArray(provenance.agent) ? provenance.agent : []
  const assemblers = agents.filter(
    (agent) =>
      codingCount(
        asRecord(agent)?.type,
        PROVENANCE_PARTICIPANT_SYSTEM,
        'assembler',
      ) > 0,
  )
  const assembler = asRecord(assemblers[0])
  const who = asRecord(assembler?.who)
  const internal =
    typeof who?.reference === 'string' ?
      envelope.resourcesByFullUrl.get(who.reference)
    : undefined
  const internalProfiles = asRecord(internal?.meta)?.profile
  const internalApplication =
    internal?.resourceType === 'Device' &&
    Array.isArray(internalProfiles) &&
    internalProfiles.filter(
      (profile) =>
        typeof profile === 'string' && APPLICATION_DEVICE_PROFILES.has(profile),
    ).length === 1
  const logicalIdentifier = who?.identifier
  const logicalApplication =
    who?.type === 'Device' &&
    completeIdentifier(logicalIdentifier) &&
    parseAbsoluteUri(logicalIdentifier.system).ok &&
    identifierRole(logicalIdentifier) === 'device-snapshot' &&
    isOpaqueIdentityValue(logicalIdentifier.value)
  if (
    assemblers.length !== 1 ||
    codingCount(assembler?.type, PROVENANCE_PARTICIPANT_SYSTEM, 'assembler') !==
      1 ||
    codingCountForSystem(assembler?.type, PROVENANCE_PARTICIPANT_SYSTEM) !==
      1 ||
    (!internalApplication && !logicalApplication)
  ) {
    addIssue(
      context,
      'mobile-provenance.assembler',
      path,
      'Grove Provenance requires exactly one assembler linked to an application Device snapshot.',
    )
  }
}

const CONVERSION_PROVENANCE_PROFILES: ReadonlySet<string> = new Set([
  groveMobileContract.profiles.conversionProvenance,
  ...groveProfileClaims.adapterConversionProvenanceClaims.map(
    ({ profile }) => profile,
  ),
])

/** Whether active lifecycle Provenance declares exactly one admitted direct profile. */
export const hasAdmittedActiveProvenanceProfile = (
  resource: unknown,
): boolean => {
  const record = asRecord(resource)
  const profiles = asRecord(record?.meta)?.profile
  return (
    record?.resourceType === 'Provenance' &&
    Array.isArray(profiles) &&
    profiles.length === 1 &&
    typeof profiles[0] === 'string' &&
    CONVERSION_PROVENANCE_PROFILES.has(profiles[0])
  )
}

const ADAPTER_CONVERSION_CLAIMS =
  groveProfileClaims.adapterConversionProvenanceClaims
const HEALTH_CONNECT_CONVERSION_PROVENANCE_PROFILE =
  ADAPTER_CONVERSION_CLAIMS.find(
    ({ adapter }) => adapter === 'health-connect',
  )?.profile

const validateHealthConnectDataOriginApplication = (
  provenance: UnknownRecord,
  context: z.core.$RefinementCtx,
  path: ReadonlyArray<number | string>,
) => {
  const entities = Array.isArray(provenance.entity) ? provenance.entity : []
  const agents =
    Array.isArray(asRecord(entities[0])?.agent) ?
      (asRecord(entities[0])?.agent as readonly unknown[])
    : []
  const agent = asRecord(agents[0])
  const who = asRecord(agent?.who)
  const identifier = who?.identifier
  if (
    agents.length !== 1 ||
    codingCount(agent?.type, PROVENANCE_PARTICIPANT_SYSTEM, 'enterer') !== 1 ||
    codingCountForSystem(agent?.type, PROVENANCE_PARTICIPANT_SYSTEM) !== 1 ||
    who?.reference !== undefined ||
    who?.type !== healthConnectDataOriginApplication.referenceType ||
    !completeIdentifier(identifier) ||
    identifier.system !== healthConnectDataOriginApplication.identifierSystem ||
    identifier.value.trim() === ''
  ) {
    addIssue(
      context,
      'health-connect.data-origin-application',
      [...path, 'entity', 0, 'agent'],
      'Health Connect DataOrigin.packageName must be one enterer agent with a typed identifier-only logical Device Reference in the Android package-name namespace.',
    )
  }
}

const adapterClaimsForOutput = (
  resource: unknown,
): ReadonlyArray<(typeof ADAPTER_CONVERSION_CLAIMS)[number]> => {
  const profiles = asRecord(asRecord(resource)?.meta)?.profile
  if (!Array.isArray(profiles)) return []
  const direct = new Set(
    profiles.filter((profile) => typeof profile === 'string'),
  )
  return ADAPTER_CONVERSION_CLAIMS.filter(({ targetAdapterProfiles }) =>
    targetAdapterProfiles.some((profile) => direct.has(profile)),
  )
}

interface IndexedOutputEntry {
  readonly entry: UnknownRecord
  readonly index: number
}

interface ConversionProvenance {
  readonly resource: UnknownRecord
  readonly profiles: unknown
}

const selectConversionProvenance = (
  envelope: ValidatedEnvelope,
  context: z.core.$RefinementCtx,
): ConversionProvenance | undefined => {
  const resources = envelope.entries.map(({ resource }) => resource)
  const provenances = resources.filter(
    (resource) => asRecord(resource)?.resourceType === 'Provenance',
  )
  const conversions = provenances.filter((resource) =>
    codingExists(
      asRecord(resource)?.activity,
      ISO_LIFECYCLE_SYSTEM,
      'transform',
    ),
  )
  const retractions = provenances.filter((resource) =>
    codingExists(
      asRecord(resource)?.activity,
      groveMobileContract.systems.lifecycleEvent,
      groveMobileContract.lifecycle.sourceRecordRetracted,
    ),
  )
  if (
    provenances.length !== 1 ||
    conversions.length !== 1 ||
    retractions.length !== 0
  ) {
    addIssue(
      context,
      'mobile-exchange.transform-provenance',
      ['entry'],
      'An active event requires exactly one transform Provenance and no retraction Provenance.',
    )
    return undefined
  }
  const resource = asRecord(conversions[0])
  return resource === undefined ? undefined : (
      { resource, profiles: asRecord(resource.meta)?.profile }
    )
}

const directConversionProfile = (profiles: unknown): string | undefined =>
  Array.isArray(profiles) && typeof profiles[0] === 'string' ?
    profiles[0]
  : undefined

const validateConversionProvenanceHeader = (
  conversion: ConversionProvenance,
  envelope: ValidatedEnvelope,
  context: z.core.$RefinementCtx,
): string | undefined => {
  const { resource: provenance, profiles } = conversion
  if (
    !Array.isArray(profiles) ||
    profiles.length !== 1 ||
    typeof profiles[0] !== 'string' ||
    !CONVERSION_PROVENANCE_PROFILES.has(profiles[0])
  ) {
    addIssue(
      context,
      'mobile-exchange.provenance-profile',
      ['entry'],
      'Conversion Provenance must directly declare exactly its admitted Mobile or adapter conversion profile.',
    )
  }
  if (
    codingCount(provenance.activity, ISO_LIFECYCLE_SYSTEM, 'transform') !== 1 ||
    codingCountForSystem(provenance.activity, ISO_LIFECYCLE_SYSTEM) !== 1 ||
    codingCountForSystem(
      provenance.activity,
      groveMobileContract.systems.lifecycleEvent,
    ) !== 0
  ) {
    addIssue(
      context,
      'mobile-exchange.lifecycle-coding',
      ['entry'],
      'Conversion Provenance requires exactly one transform coding from the ISO lifecycle system and no Grove retraction lifecycle coding.',
    )
  }
  validateAssemblerAgent(provenance, envelope, context, ['entry'])
  if (
    provenance.occurredDateTime === undefined &&
    provenance.occurredPeriod === undefined
  ) {
    addIssue(
      context,
      'mobile-exchange.occurred-time',
      ['entry'],
      'Conversion Provenance requires occurred[x].',
    )
  }
  if (provenance.recorded === undefined) {
    addIssue(
      context,
      'mobile-exchange.recorded-time',
      ['entry'],
      'Conversion Provenance requires recorded.',
    )
  }
  return directConversionProfile(profiles)
}

const conversionSourceIdentifier = (
  provenance: UnknownRecord,
  context: z.core.$RefinementCtx,
): unknown => {
  const entities = Array.isArray(provenance.entity) ? provenance.entity : []
  const sourceEntity = asRecord(entities[0])
  const sourceWhat = asRecord(sourceEntity?.what)
  const identifier = sourceWhat?.identifier
  if (entities.length !== 1) {
    addIssue(
      context,
      'mobile-exchange.single-source-entity',
      ['entry'],
      'Conversion Provenance must carry exactly one source entity.',
    )
  }
  if (
    sourceEntity?.role !== 'source' ||
    sourceWhat?.reference !== undefined ||
    !completeIdentifier(identifier) ||
    !parseAbsoluteUri(identifier.system).ok ||
    identifierRole(identifier) !== 'source-record' ||
    !isOpaqueIdentityValue(identifier.value)
  ) {
    addIssue(
      context,
      'mobile-exchange.logical-source-entity',
      ['entry'],
      'Conversion Provenance source must be a logical typed opaque source-record Identifier with no literal reference.',
    )
  }
  return identifier
}

const collectOutputEntries = (
  envelope: ValidatedEnvelope,
  context: z.core.$RefinementCtx,
): readonly IndexedOutputEntry[] => {
  const outputs = envelope.entries.flatMap((entry, index) =>
    ACTIVE_OUTPUT_TYPES.has(String(asRecord(entry.resource)?.resourceType)) ?
      [{ entry, index }]
    : [],
  )
  if (outputs.length === 0) {
    addIssue(
      context,
      'mobile-exchange.output-required',
      ['entry'],
      'An active exchange event requires at least one clinical or source-artifact output.',
    )
  }
  return outputs
}

const validateOutputAdapterClaim = (
  output: IndexedOutputEntry,
  provenanceAdapterClaim:
    (typeof ADAPTER_CONVERSION_CLAIMS)[number] | undefined,
  context: z.core.$RefinementCtx,
): void => {
  const claims = adapterClaimsForOutput(output.entry.resource)
  const matches =
    provenanceAdapterClaim === undefined ?
      claims.length === 0
    : claims.length === 1 &&
      claims[0]?.profile === provenanceAdapterClaim.profile
  if (claims.length > 1 || !matches) {
    addIssue(
      context,
      'mobile-exchange.adapter-provenance-graph',
      ['entry', output.index, 'resource', 'meta', 'profile'],
      "Every adapter output must claim exactly the adapter profile governed by this event's conversion Provenance, and source-neutral events must not claim adapter outputs.",
    )
  }
}

const validateOutputIdentities = (
  outputEntry: IndexedOutputEntry,
  sourceIdentifier: unknown,
  context: z.core.$RefinementCtx,
): void => {
  const { entry, index } = outputEntry
  const source = identifierWithRole(entry.resource, 'source-record')
  const output = identifierWithRole(entry.resource, 'source-output')
  if (
    !completeIdentifier(source) ||
    !parseAbsoluteUri(source.system).ok ||
    !isOpaqueIdentityValue(source.value) ||
    !identifierPairEqual(source, sourceIdentifier) ||
    !completeIdentifier(output) ||
    !parseAbsoluteUri(output.system).ok ||
    !isOpaqueIdentityValue(output.value)
  ) {
    addIssue(
      context,
      'mobile-output.source-output-required',
      ['entry', index, 'resource', 'identifier'],
      'Every active output requires matching source-record and exact typed output identities.',
    )
  }
}

const validateActiveOutputs = (
  outputs: readonly IndexedOutputEntry[],
  sourceIdentifier: unknown,
  provenanceProfile: string | undefined,
  context: z.core.$RefinementCtx,
): void => {
  const provenanceAdapterClaim = ADAPTER_CONVERSION_CLAIMS.find(
    ({ profile }) => profile === provenanceProfile,
  )
  for (const output of outputs) {
    validateMobileObservationSemantics(output.entry.resource, context, [
      'entry',
      output.index,
      'resource',
    ])
    validateOutputAdapterClaim(output, provenanceAdapterClaim, context)
    validateOutputIdentities(output, sourceIdentifier, context)
  }
}

const isHybridObservation = (entry: UnknownRecord): boolean => {
  const claim = groveProfileClaims.sensorKitHybridObservationClaims
  const resource = asRecord(entry.resource)
  const profiles = asRecord(resource?.meta)?.profile
  const admittedProfiles: ReadonlySet<string> = new Set(claim.profiles)
  return (
    resource?.resourceType === 'Observation' &&
    Array.isArray(profiles) &&
    profiles.length === claim.cardinality &&
    profiles.every(
      (profile) => typeof profile === 'string' && admittedProfiles.has(profile),
    )
  )
}

const hasHybridDocumentCompanion = (
  source: unknown,
  outputs: readonly IndexedOutputEntry[],
): boolean => {
  const requiredProfile =
    groveProfileClaims.sensorKitHybridObservationClaims.requiredCompanionProfile
  return outputs.some(({ entry }) => {
    const resource = asRecord(entry.resource)
    const profiles = asRecord(resource?.meta)?.profile
    return (
      resource?.resourceType === 'DocumentReference' &&
      Array.isArray(profiles) &&
      profiles.length === 1 &&
      profiles[0] === requiredProfile &&
      identifierPairEqual(identifierWithRole(resource, 'source-record'), source)
    )
  })
}

const validateHybridCompanions = (
  outputs: readonly IndexedOutputEntry[],
  context: z.core.$RefinementCtx,
): void => {
  for (const output of outputs.filter(({ entry }) =>
    isHybridObservation(entry),
  )) {
    const source = identifierWithRole(output.entry.resource, 'source-record')
    if (!hasHybridDocumentCompanion(source, outputs)) {
      addIssue(
        context,
        'mobile-output.hybrid-companion',
        ['entry', output.index, 'resource', 'meta', 'profile'],
        'A SensorKit ECG Observation requires one exact native Recording Document companion in the same event with the same source-record Identifier.',
      )
    }
  }
}

const validateProvenanceTargets = (
  provenance: UnknownRecord,
  outputs: readonly IndexedOutputEntry[],
  context: z.core.$RefinementCtx,
): void => {
  const expected = new Set(
    outputs.flatMap(({ entry }) =>
      typeof entry.fullUrl === 'string' ? [entry.fullUrl] : [],
    ),
  )
  const actual =
    Array.isArray(provenance.target) ?
      provenance.target.flatMap((target) => {
        const reference = asRecord(target)?.reference
        return typeof reference === 'string' ? [reference] : []
      })
    : []
  if (
    actual.length !== expected.size ||
    new Set(actual).size !== actual.length ||
    actual.some((reference) => !expected.has(reference))
  ) {
    addIssue(
      context,
      'mobile-exchange.provenance-targets',
      ['entry'],
      'Conversion Provenance must target every and only active clinical output.',
    )
  }
}

const referenceAdjacency = (
  resources: ReadonlyMap<string, UnknownRecord>,
): ReadonlyMap<string, ReadonlySet<string>> => {
  const adjacency = new Map<string, Set<string>>(
    [...resources.keys()].map((fullUrl) => [fullUrl, new Set<string>()]),
  )
  for (const [sourceUrl, resource] of resources) {
    for (const { reference } of locatedReferences(resource)) {
      if (!resources.has(reference)) continue
      adjacency.get(sourceUrl)?.add(reference)
      adjacency.get(reference)?.add(sourceUrl)
    }
  }
  return adjacency
}

const connectedGraphNodes = (
  envelope: ValidatedEnvelope,
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
): ReadonlySet<string> => {
  const reachable = new Set(
    [...envelope.resourcesByFullUrl].flatMap(([fullUrl, resource]) =>
      (
        ACTIVE_OUTPUT_TYPES.has(String(resource.resourceType)) ||
        resource.resourceType === ACTIVE_ENTRY_POLICY.lifecycleResourceType
      ) ?
        [fullUrl]
      : [],
    ),
  )
  const pending = [...reachable]
  for (const current of pending) {
    for (const connected of adjacency.get(current) ?? []) {
      if (reachable.has(connected)) continue
      reachable.add(connected)
      pending.push(connected)
    }
  }
  return reachable
}

const validateSupportingResourceConnectivity = (
  envelope: ValidatedEnvelope,
  context: z.core.$RefinementCtx,
): void => {
  const reachable = connectedGraphNodes(
    envelope,
    referenceAdjacency(envelope.resourcesByFullUrl),
  )
  const disconnected = [...envelope.resourcesByFullUrl].some(
    ([fullUrl, resource]) =>
      ACTIVE_SUPPORTING_TYPES.has(String(resource.resourceType)) &&
      !reachable.has(fullUrl),
  )
  if (disconnected) {
    addIssue(
      context,
      'mobile-support.connected',
      ['entry'],
      'Every supporting resource must be connected by literal Bundle references to an output or the lifecycle Provenance.',
    )
  }
}

export const refineActiveBundle = (
  bundle: R4CollectionBundle,
  context: z.core.$RefinementCtx,
): void => {
  const envelope = validateExchangeEnvelope(
    bundle,
    context,
    groveMobileContract.profiles.exchangeBundle,
  )
  if (envelope === undefined) return
  const conversion = selectConversionProvenance(envelope, context)
  if (conversion === undefined) return
  const provenanceProfile = validateConversionProvenanceHeader(
    conversion,
    envelope,
    context,
  )
  const sourceIdentifier = conversionSourceIdentifier(
    conversion.resource,
    context,
  )
  if (provenanceProfile === HEALTH_CONNECT_CONVERSION_PROVENANCE_PROFILE) {
    validateHealthConnectDataOriginApplication(conversion.resource, context, [
      'entry',
      'resource',
    ])
  }
  const outputs = collectOutputEntries(envelope, context)
  validateActiveOutputs(outputs, sourceIdentifier, provenanceProfile, context)
  validateHybridCompanions(outputs, context)
  validateProvenanceTargets(conversion.resource, outputs, context)
  validateSupportingResourceConnectivity(envelope, context)
}
