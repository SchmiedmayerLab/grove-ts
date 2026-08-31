//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type z } from 'zod'
import {
  groveRuleIssue,
  groveRuleIssueFromParameters,
  type GroveExchangeRuleCode,
} from './diagnostics.js'
import { asRecord } from './graph-schema-utils.js'
import {
  groveMobileExchangeBundleSchema,
  groveMobileRetractionBundleSchema,
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
  specimenSchema,
  supportedR4ResourceSchema,
} from './schemas.js'
import type {
  Device,
  DocumentReference,
  Observation,
  Provenance,
  Specimen,
  SupportedR4Resource,
  GroveMobileExchangeBundle,
  GroveMobileRetractionBundle,
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
    entry.message,
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
  readonly code: GroveExchangeRuleCode
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

const parseGraphBundle = <T>(
  schema: z.ZodType<T>,
  prechecks: readonly EntryRulePrecheck[],
  input: unknown,
): Result<T> => {
  const snapshot = cloneJsonValue(input)
  if (!snapshot.ok) return snapshot
  const early = entryRuleIssue(snapshot.value, prechecks)
  return early === undefined ?
      parseSnapshotWith(schema, snapshot.value)
    : issues([early])
}

export const parseGroveMobileExchangeBundle = (
  input: unknown,
): Result<GroveMobileExchangeBundle> =>
  parseGraphBundle(
    groveMobileExchangeBundleSchema,
    ACTIVE_ENTRY_PRECHECKS,
    input,
  )

export const parseGroveMobileRetractionBundle = (
  input: unknown,
): Result<GroveMobileRetractionBundle> =>
  parseGraphBundle(
    groveMobileRetractionBundleSchema,
    RETRACTION_ENTRY_PRECHECKS,
    input,
  )

export const parseSupportedR4Resource = (
  input: unknown,
): Result<SupportedR4Resource> => parseWith(supportedR4ResourceSchema, input)
