//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

/** Append-only retraction graph and logical-target semantics. */

import type { z } from 'zod'
import {
  validateAssemblerAgent,
  validateExchangeEnvelope,
} from './active-graph-semantics.js'
import {
  ISO_LIFECYCLE_SYSTEM,
  addIssue,
  asRecord,
  codingCount,
  codingCountForSystem,
  codingExists,
  completeIdentifier,
  identifierRole,
  type UnknownRecord,
} from './graph-schema-utils.js'
import type { R4CollectionBundle } from './types.js'
import { parseAbsoluteUri } from '../core/index.js'
import { groveMobileContract } from '../mobile/contract.js'
import { isOpaqueIdentityValue } from '../mobile/identity.js'

const retractionRoleFor = (reference: unknown): string | undefined => {
  const extensions = asRecord(reference)?.extension
  if (!Array.isArray(extensions)) return undefined
  const matches = extensions.filter(
    (extension) =>
      asRecord(extension)?.url ===
      groveMobileContract.extensions.retractionTargetRole,
  )
  const code = asRecord(matches[0])?.valueCode
  return matches.length === 1 && typeof code === 'string' ? code : undefined
}

const RETRACTION_TARGET_RULES = groveMobileContract.lifecycle.retractionTargets
const RETRACTION_ROLES: ReadonlySet<string> = new Set(
  Object.keys(RETRACTION_TARGET_RULES),
)

const validateRetractionResourceSet = (
  resources: readonly unknown[],
  context: z.core.$RefinementCtx,
): void => {
  const containsClinicalCopy = resources.some(
    (resource) =>
      !['Device', 'Provenance'].includes(
        String(asRecord(resource)?.resourceType),
      ),
  )
  if (containsClinicalCopy) {
    addIssue(
      context,
      'mobile-retraction.no-clinical-copy',
      ['entry'],
      'Retraction Bundles contain Provenance and optional Device agents only.',
    )
  }
}

const selectRetractionProvenance = (
  resources: readonly unknown[],
  context: z.core.$RefinementCtx,
): UnknownRecord | undefined => {
  const provenances = resources.filter(
    (resource) => asRecord(resource)?.resourceType === 'Provenance',
  )
  const retractions = provenances.filter((resource) =>
    codingExists(
      asRecord(resource)?.activity,
      groveMobileContract.systems.lifecycleEvent,
      groveMobileContract.lifecycle.sourceRecordRetracted,
    ),
  )
  if (provenances.length !== 1 || retractions.length !== 1) {
    addIssue(
      context,
      'mobile-retraction.provenance',
      ['entry'],
      'A retraction event requires exactly one retraction Provenance and no transform Provenance.',
    )
    return undefined
  }
  return asRecord(retractions[0])
}

const validateRetractionProvenanceHeader = (
  provenance: UnknownRecord,
  envelope: import('./exchange-envelope.js').ValidatedEnvelope,
  context: z.core.$RefinementCtx,
): void => {
  const profiles = asRecord(provenance.meta)?.profile
  if (
    !Array.isArray(profiles) ||
    profiles.length !== 1 ||
    profiles[0] !== groveMobileContract.profiles.retractionProvenance
  ) {
    addIssue(
      context,
      'mobile-retraction.provenance-profile',
      ['entry'],
      'Retraction Provenance must declare the Grove Mobile retraction profile.',
    )
  }
  if (
    codingCount(
      provenance.activity,
      groveMobileContract.systems.lifecycleEvent,
      groveMobileContract.lifecycle.sourceRecordRetracted,
    ) !== 1 ||
    codingCountForSystem(
      provenance.activity,
      groveMobileContract.systems.lifecycleEvent,
    ) !== 1 ||
    codingCountForSystem(provenance.activity, ISO_LIFECYCLE_SYSTEM) !== 0
  ) {
    addIssue(
      context,
      'mobile-exchange.lifecycle-coding',
      ['entry'],
      'Retraction Provenance requires exactly one source-record-retracted coding from the Grove lifecycle system and no ISO transform lifecycle coding.',
    )
  }
  validateAssemblerAgent(provenance, envelope, context, ['entry'])
}

const validateRetractionTargetShape = (
  reference: UnknownRecord | undefined,
  targetIdentifier: unknown,
  index: number,
  context: z.core.$RefinementCtx,
): void => {
  if (
    reference?.reference !== undefined ||
    typeof reference?.type !== 'string' ||
    reference.type === '' ||
    !completeIdentifier(targetIdentifier)
  ) {
    addIssue(
      context,
      'mobile-retraction.logical-target',
      ['entry', 'resource', 'target', index],
      'A retraction target must be a typed logical Reference with no literal reference.',
    )
  }
}

const validateRetractionTargetIdentity = (
  targetIdentifier: unknown,
  expectedRole: string | undefined,
  index: number,
  context: z.core.$RefinementCtx,
): void => {
  if (
    !completeIdentifier(targetIdentifier) ||
    !parseAbsoluteUri(targetIdentifier.system).ok ||
    identifierRole(targetIdentifier) !== expectedRole ||
    !isOpaqueIdentityValue(targetIdentifier.value)
  ) {
    addIssue(
      context,
      'mobile-retraction.opaque-target',
      ['entry', 'resource', 'target', index, 'identifier'],
      'Each target requires the exact typed canonical v0 HMAC Identifier previously emitted.',
    )
  }
}

const recordDistinctTarget = (
  targetIdentifier: unknown,
  index: number,
  keys: Set<string>,
  context: z.core.$RefinementCtx,
): void => {
  if (!completeIdentifier(targetIdentifier)) return
  const pair = `${targetIdentifier.system.length}:${targetIdentifier.system}${targetIdentifier.value.length}:${targetIdentifier.value}`
  if (keys.has(pair)) {
    addIssue(
      context,
      'mobile-retraction.distinct-target',
      ['entry', 'resource', 'target', index, 'identifier'],
      'Retraction target Identifier pairs must be unique.',
    )
  }
  keys.add(pair)
}

const validateRetractionTargetType = (
  reference: UnknownRecord | undefined,
  role: string | undefined,
  targetRule:
    | (typeof RETRACTION_TARGET_RULES)[keyof typeof RETRACTION_TARGET_RULES]
    | undefined,
  index: number,
  context: z.core.$RefinementCtx,
): void => {
  if (
    targetRule !== undefined &&
    (typeof reference?.type !== 'string' ||
      !(targetRule.resourceTypes as readonly string[]).includes(reference.type))
  ) {
    addIssue(
      context,
      'mobile-retraction.role-target-type',
      ['entry', 'resource', 'target', index, 'type'],
      `${String(role)} targets must declare one of the admitted Reference.type values: ${(targetRule.resourceTypes as readonly string[]).join(', ')}.`,
    )
  }
}

const validateRetractionTarget = (
  target: unknown,
  index: number,
  keys: Set<string>,
  context: z.core.$RefinementCtx,
): void => {
  const reference = asRecord(target)
  const role = retractionRoleFor(reference)
  const targetRule =
    role !== undefined && Object.hasOwn(RETRACTION_TARGET_RULES, role) ?
      RETRACTION_TARGET_RULES[role as keyof typeof RETRACTION_TARGET_RULES]
    : undefined
  const identifier = reference?.identifier
  validateRetractionTargetShape(reference, identifier, index, context)
  if (role === undefined || !RETRACTION_ROLES.has(role)) {
    addIssue(
      context,
      'mobile-retraction.target-role',
      ['entry', 'resource', 'target', index, 'extension'],
      'Each target requires exactly one closed Grove target role.',
    )
  }
  validateRetractionTargetIdentity(
    identifier,
    targetRule?.identifierRole,
    index,
    context,
  )
  recordDistinctTarget(identifier, index, keys, context)
  validateRetractionTargetType(reference, role, targetRule, index, context)
}

const validateRetractionTargets = (
  provenance: UnknownRecord,
  context: z.core.$RefinementCtx,
): void => {
  const targets = Array.isArray(provenance.target) ? provenance.target : []
  if (targets.length === 0) {
    addIssue(
      context,
      'mobile-retraction.target-required',
      ['entry'],
      'Retraction Provenance requires at least one exact logical target.',
    )
  }
  const keys = new Set<string>()
  for (const [index, target] of targets.entries()) {
    validateRetractionTarget(target, index, keys, context)
  }
}

const validateRetractionSource = (
  provenance: UnknownRecord,
  context: z.core.$RefinementCtx,
): void => {
  const entities = Array.isArray(provenance.entity) ? provenance.entity : []
  const sourceEntity = asRecord(entities[0])
  const sourceWhat = asRecord(sourceEntity?.what)
  const source = sourceWhat?.identifier
  if (entities.length !== 1) {
    addIssue(
      context,
      'mobile-exchange.single-source-entity',
      ['entry'],
      'Retraction Provenance must carry exactly one source entity.',
    )
  }
  if (
    sourceEntity?.role !== 'source' ||
    sourceWhat?.reference !== undefined ||
    !completeIdentifier(source) ||
    !parseAbsoluteUri(source.system).ok ||
    identifierRole(source) !== 'source-record' ||
    !isOpaqueIdentityValue(source.value)
  ) {
    addIssue(
      context,
      'mobile-exchange.logical-source-entity',
      ['entry'],
      'Retraction Provenance source must be a logical typed opaque source-record Identifier with no literal reference.',
    )
  }
}

const validateRetractionTimes = (
  provenance: UnknownRecord,
  context: z.core.$RefinementCtx,
): void => {
  if (
    (provenance.occurredDateTime === undefined &&
      provenance.occurredPeriod === undefined) ||
    provenance.recorded === undefined
  ) {
    addIssue(
      context,
      'mobile-retraction.times',
      ['entry'],
      'Retraction Provenance requires distinct occurred[x] and recorded fields.',
    )
  }
}

export const refineRetractionBundle = (
  bundle: R4CollectionBundle,
  context: z.core.$RefinementCtx,
): void => {
  const envelope = validateExchangeEnvelope(
    bundle,
    context,
    groveMobileContract.profiles.retractionBundle,
  )
  if (envelope === undefined) return
  const resources = envelope.entries.map(({ resource }) => resource)
  validateRetractionResourceSet(resources, context)
  const provenance = selectRetractionProvenance(resources, context)
  if (provenance === undefined) return
  validateRetractionProvenanceHeader(provenance, envelope, context)
  validateRetractionTargets(provenance, context)
  validateRetractionSource(provenance, context)
  validateRetractionTimes(provenance, context)
}
