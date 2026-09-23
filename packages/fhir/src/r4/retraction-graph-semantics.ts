//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

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
  groveIdentifierRoles,
  identifierRole,
  type UnknownRecord,
} from './graph-schema-utils.js'
import type { R4CollectionBundle } from './types.js'
import { groveExchangeProtocol } from '../contract/measurement-catalog.generated.js'
import { parseIdentifierSystem } from '../core/index.js'
import { isOpaqueIdentityValue } from '../mobile/identity.js'

const RETRACTION = groveExchangeProtocol.lifecycle.retraction
const LIFECYCLE_EVENT_SYSTEM = groveExchangeProtocol.codeSystems.lifecycleEvent

const retractionRoleFor = (reference: unknown): string | undefined => {
  const extensions = asRecord(reference)?.extension
  if (!Array.isArray(extensions)) return undefined
  const matches = extensions.filter(
    (extension) =>
      asRecord(extension)?.url ===
      groveExchangeProtocol.extensions.retractionTargetRole,
  )
  const code = asRecord(matches[0])?.valueCode
  return matches.length === 1 && typeof code === 'string' ? code : undefined
}

const RETRACTION_TARGET_RULES = RETRACTION.targetRoles
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
    addIssue(context, 'mobile-retraction.no-clinical-copy', ['entry'])
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
      LIFECYCLE_EVENT_SYSTEM,
      RETRACTION.activityCode,
    ),
  )
  if (provenances.length !== 1 || retractions.length !== 1) {
    addIssue(context, 'mobile-retraction.provenance', ['entry'])
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
    profiles[0] !== groveExchangeProtocol.profiles.retractionProvenance
  ) {
    addIssue(context, 'mobile-exchange.provenance-profile', ['entry'])
  }
  if (
    codingCount(
      provenance.activity,
      LIFECYCLE_EVENT_SYSTEM,
      RETRACTION.activityCode,
    ) !== 1 ||
    codingCountForSystem(provenance.activity, LIFECYCLE_EVENT_SYSTEM) !== 1 ||
    codingCountForSystem(provenance.activity, ISO_LIFECYCLE_SYSTEM) !== 0
  ) {
    addIssue(context, 'mobile-exchange.lifecycle-coding', ['entry'])
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
    addIssue(context, 'mobile-retraction.logical-target', [
      'entry',
      'resource',
      'target',
      index,
    ])
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
    !parseIdentifierSystem(targetIdentifier.system).ok ||
    identifierRole(targetIdentifier) !== expectedRole ||
    !isOpaqueIdentityValue(targetIdentifier.value)
  ) {
    addIssue(context, 'mobile-retraction.opaque-target', [
      'entry',
      'resource',
      'target',
      index,
      'identifier',
    ])
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
    addIssue(context, 'mobile-retraction.distinct-target', [
      'entry',
      'resource',
      'target',
      index,
      'identifier',
    ])
  }
  keys.add(pair)
}

// The native key space belongs to the adapter, so Grove proves only that it is complete,
// absolute, singular, and never dressed up as one of Grove's own identity roles.
const validateRetractionTargetNativeIdentifier = (
  reference: UnknownRecord | undefined,
  index: number,
  context: z.core.$RefinementCtx,
): void => {
  const extensions =
    Array.isArray(reference?.extension) ? reference.extension : []
  const matches = extensions.filter(
    (extension) =>
      asRecord(extension)?.url ===
      groveExchangeProtocol.extensions.retractionTargetNativeIdentifier,
  )
  if (matches.length === 0) return
  const native = asRecord(matches[0])?.valueIdentifier
  if (
    matches.length !== 1 ||
    !completeIdentifier(native) ||
    !parseIdentifierSystem(native.system).ok ||
    groveIdentifierRoles(native).length > 0
  ) {
    addIssue(context, 'mobile-retraction.native-record-identifier', [
      'entry',
      'resource',
      'target',
      index,
      'extension',
    ])
  }
}

const validateRetractionTargetType = (
  reference: UnknownRecord | undefined,
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
    addIssue(context, 'mobile-retraction.role-target-type', [
      'entry',
      'resource',
      'target',
      index,
      'type',
    ])
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
    addIssue(context, 'mobile-retraction.target-role', [
      'entry',
      'resource',
      'target',
      index,
      'extension',
    ])
  }
  validateRetractionTargetIdentity(
    identifier,
    targetRule?.identifierRole,
    index,
    context,
  )
  recordDistinctTarget(identifier, index, keys, context)
  validateRetractionTargetType(reference, targetRule, index, context)
  validateRetractionTargetNativeIdentifier(reference, index, context)
}

const validateRetractionTargets = (
  provenance: UnknownRecord,
  context: z.core.$RefinementCtx,
): void => {
  const targets = Array.isArray(provenance.target) ? provenance.target : []
  if (targets.length === 0) {
    addIssue(context, 'mobile-retraction.target-required', ['entry'])
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
    addIssue(context, 'mobile-exchange.single-source-entity', ['entry'])
  }
  if (
    sourceEntity?.role !== 'source' ||
    sourceWhat?.reference !== undefined ||
    !completeIdentifier(source) ||
    !parseIdentifierSystem(source.system).ok ||
    identifierRole(source) !== 'source-record' ||
    !isOpaqueIdentityValue(source.value)
  ) {
    addIssue(context, 'mobile-exchange.logical-source-entity', ['entry'])
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
    addIssue(context, 'mobile-exchange.event-times', ['entry'], {
      location: 'Provenance.occurred[x]',
    })
  }
}

export const refineRetractionBundle = (
  bundle: R4CollectionBundle,
  context: z.core.$RefinementCtx,
): void => {
  const envelope = validateExchangeEnvelope(
    bundle,
    context,
    groveExchangeProtocol.profiles.retractionBundle,
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
