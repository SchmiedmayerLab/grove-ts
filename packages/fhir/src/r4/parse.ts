//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'
import { refineActiveBundle } from './active-graph-semantics.js'
import {
  groveRuleIssue,
  groveRuleIssueFromParameters,
  isProducerDiagnosticCode,
  type ProducerDiagnosticCode,
} from './diagnostics.js'
import { asRecord } from './graph-schema-utils.js'
import { refineRetractionBundle } from './retraction-graph-semantics.js'
import {
  exchangeGraphSchema,
  hasAdmittedActiveDeviceProfile,
  hasAdmittedActiveDocumentReferenceProfile,
  hasAdmittedActiveProvenanceProfile,
  hasAdmittedAdapterOnlyOutputProfile,
  hasAdmittedMobileObservationProfile,
  hasProhibitedContainedResource,
  isAdmittedActiveEntryResource,
  r4CollectionBundleSchema,
  deviceSchema,
  documentReferenceSchema,
  observationSchema,
  provenanceSchema,
  retractionEventSchema,
  specimenSchema,
  supportedR4ResourceSchema,
} from './schemas.js'
import type {
  Device,
  DocumentReference,
  ExchangeGraph,
  Observation,
  Provenance,
  RetractionEvent,
  Specimen,
  SupportedR4Resource,
  R4CollectionBundle,
} from './types.js'
import {
  cloneJsonValue,
  deepFreeze,
  issues,
  ok,
  zodIssuePath,
  zodIssueToIssue,
  type Issue,
  type Result,
} from '../core/index.js'

const normalizeIssue = (entry: z.core.$ZodIssue): Issue =>
  groveRuleIssueFromParameters(
    entry.code === 'custom' ? entry.params : undefined,
    zodIssuePath(entry),
  ) ?? zodIssueToIssue(entry)

// The schema decides the parsed type; a caller-chosen T would make the cast below a lie.
const parseSnapshotWith = <T>(
  schema: z.ZodType<T>,
  snapshot: unknown,
): Result<T> => {
  const result = schema.safeParse(snapshot)
  return result.success ?
      ok(deepFreeze(result.data) as T)
    : issues(result.error.issues.map(normalizeIssue))
}

const parseWith = <T>(schema: z.ZodType<T>, input: unknown): Result<T> => {
  const snapshot = cloneJsonValue(input)
  return snapshot.ok ? parseSnapshotWith(schema, snapshot.value) : snapshot
}

export const parseObservation = (input: unknown): Result<Observation> =>
  parseWith(observationSchema, input)

export const parseDevice = (input: unknown): Result<Device> =>
  parseWith(deviceSchema, input)

export const parseDocumentReference = (
  input: unknown,
): Result<DocumentReference> => parseWith(documentReferenceSchema, input)

export const parseProvenance = (input: unknown): Result<Provenance> =>
  parseWith(provenanceSchema, input)

export const parseSpecimen = (input: unknown): Result<Specimen> =>
  parseWith(specimenSchema, input)

export const parseR4CollectionBundle = (
  input: unknown,
): Result<R4CollectionBundle> => parseWith(r4CollectionBundleSchema, input)

const entryResource = (entry: unknown): unknown => asRecord(entry)?.resource

const ofType =
  (resourceType: string, rejects: (resource: unknown) => boolean) =>
  (resource: unknown): boolean =>
    asRecord(resource)?.resourceType === resourceType && rejects(resource)

interface EntryRulePrecheck {
  readonly code: ProducerDiagnosticCode
  readonly path: readonly string[]
  readonly rejects: (resource: unknown) => boolean
}

// The base R4 union rejects an unadmitted entry before the graph refinements run, so
// these rules report first to keep their exact corpus diagnostic.
const ACTIVE_ENTRY_PRECHECKS: readonly EntryRulePrecheck[] = [
  {
    code: 'mobile-exchange.entry-resource-type',
    path: ['resource', 'resourceType'],
    rejects: (resource) => !isAdmittedActiveEntryResource(resource),
  },
  {
    code: 'mobile-exchange.contained-resource-prohibited',
    path: ['resource', 'contained'],
    rejects: hasProhibitedContainedResource,
  },
  {
    code: 'mobile-output.semantic-profile',
    path: ['resource', 'meta', 'profile'],
    rejects: ofType(
      'Observation',
      (resource) => !hasAdmittedMobileObservationProfile(resource),
    ),
  },
  {
    code: 'mobile-output.adapter-only-profile',
    path: ['resource', 'meta', 'profile'],
    rejects: (resource) => !hasAdmittedAdapterOnlyOutputProfile(resource),
  },
  {
    code: 'mobile-output.document-profile',
    path: ['resource', 'meta', 'profile'],
    rejects: ofType(
      'DocumentReference',
      (resource) => !hasAdmittedActiveDocumentReferenceProfile(resource),
    ),
  },
  {
    code: 'mobile-support.device-profile',
    path: ['resource', 'meta', 'profile'],
    rejects: ofType(
      'Device',
      (resource) => !hasAdmittedActiveDeviceProfile(resource),
    ),
  },
  {
    code: 'mobile-exchange.provenance-profile',
    path: ['resource', 'meta', 'profile'],
    rejects: ofType(
      'Provenance',
      (resource) => !hasAdmittedActiveProvenanceProfile(resource),
    ),
  },
]

const RETRACTION_ENTRY_PRECHECKS: readonly EntryRulePrecheck[] = [
  {
    code: 'mobile-retraction.no-clinical-copy',
    path: ['resource'],
    rejects: (resource) => {
      const resourceType = asRecord(resource)?.resourceType
      return (
        typeof resourceType === 'string' &&
        !['Device', 'Provenance'].includes(resourceType)
      )
    },
  },
  {
    code: 'mobile-exchange.contained-resource-prohibited',
    path: ['resource', 'contained'],
    rejects: hasProhibitedContainedResource,
  },
]

const entryRuleIssue = (
  snapshot: unknown,
  prechecks: readonly EntryRulePrecheck[],
): Issue | undefined => {
  const entries = asRecord(snapshot)?.entry
  if (!Array.isArray(entries)) return undefined
  for (const { code, path, rejects } of prechecks) {
    const index = entries.findIndex((entry) => rejects(entryResource(entry)))
    if (index !== -1) return groveRuleIssue(code, ['entry', index, ...path])
  }
  return undefined
}

type GraphRefinement = (
  bundle: R4CollectionBundle,
  context: z.core.$RefinementCtx,
) => void

// The base R4 schema rejects a Bundle before its graph refinements run, yet the graph
// rule is the more specific diagnostic. The refinements read defensively, so they are
// tried on the snapshot itself; anything they cannot read falls back to the schema issues.
const graphRuleIssues = (
  snapshot: unknown,
  refine: GraphRefinement,
): readonly Issue[] | undefined => {
  try {
    const result = z
      .unknown()
      .superRefine((value, context) => {
        refine(value as R4CollectionBundle, context)
      })
      .safeParse(snapshot)
    if (result.success) return undefined
    const rules = result.error.issues
      .map(normalizeIssue)
      .filter((issue) => isProducerDiagnosticCode(issue.code))
    return rules.length === 0 ? undefined : rules
  } catch {
    return undefined
  }
}

const parseGraphBundle = <T>(
  schema: z.ZodType<T>,
  refine: GraphRefinement,
  prechecks: readonly EntryRulePrecheck[],
  input: unknown,
): Result<T> => {
  const snapshot = cloneJsonValue(input)
  if (!snapshot.ok) return snapshot
  const early = entryRuleIssue(snapshot.value, prechecks)
  if (early !== undefined) return issues([early])
  const result = schema.safeParse(snapshot.value)
  if (result.success) return ok(deepFreeze(result.data) as T)
  const normalized = result.error.issues.map(normalizeIssue)
  if (normalized.some((issue) => isProducerDiagnosticCode(issue.code))) {
    return issues(normalized)
  }
  return issues(graphRuleIssues(snapshot.value, refine) ?? normalized)
}

/** Parses and validates one active exchange event; it never throws for any input. */
export const parseExchangeGraph = (input: unknown): Result<ExchangeGraph> =>
  parseGraphBundle(
    exchangeGraphSchema,
    refineActiveBundle,
    ACTIVE_ENTRY_PRECHECKS,
    input,
  )

/** Parses and validates one retraction assertion; it never throws for any input. */
export const parseRetractionEvent = (input: unknown): Result<RetractionEvent> =>
  parseGraphBundle(
    retractionEventSchema,
    refineRetractionBundle,
    RETRACTION_ENTRY_PRECHECKS,
    input,
  )

export const parseSupportedR4Resource = (
  input: unknown,
): Result<SupportedR4Resource> => parseWith(supportedR4ResourceSchema, input)
