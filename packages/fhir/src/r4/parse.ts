//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type z } from 'zod'
import { decodeGroveRuleDiagnostic, groveRuleIssue } from './diagnostics.js'
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
  err,
  issues,
  type IssueCode,
  ok,
  type Issue,
  type Result,
} from '../core/index.js'

const LOCAL_MOBILE_RULE = /^(mobile-[a-z\d.-]+): (.+)$/su

const issuePath = (entry: z.core.$ZodIssue): ReadonlyArray<string | number> =>
  entry.path.map((component) =>
    typeof component === 'symbol' ?
      (component.description ?? component.toString())
    : component,
  )

const normalizeIssue = (entry: z.core.$ZodIssue): Issue => {
  const path = issuePath(entry)
  const diagnostic = decodeGroveRuleDiagnostic(entry.message)
  if (diagnostic !== undefined) {
    return {
      severity: diagnostic.severity,
      code: diagnostic.code,
      path,
      message: diagnostic.reason,
      reason: diagnostic.reason,
      location: diagnostic.location,
    }
  }
  const localRule = LOCAL_MOBILE_RULE.exec(entry.message)
  if (localRule !== null) {
    return {
      severity: 'error',
      code: localRule[1] as IssueCode,
      path,
      message: entry.message,
    }
  }
  return {
    severity: 'error',
    code: 'schema-invalid',
    path,
    message: entry.message,
  }
}

// The schema decides the parsed type; a caller-chosen T would make the cast below a lie.
const parseSnapshotWith = <T>(
  schema: z.ZodType<T>,
  snapshot: unknown,
): Result<T> => {
  try {
    const result = schema.safeParse(snapshot)
    if (!result.success) {
      return issues(result.error.issues.map(normalizeIssue))
    }
    return ok(deepFreeze(result.data) as T)
  } catch {
    return err(
      'schema-invalid',
      'FHIR JSON validation could not safely inspect the supplied value.',
    )
  }
}

const parseWith = <T>(schema: z.ZodType<T>, input: unknown): Result<T> => {
  const snapshot = cloneJsonValue(input)
  return snapshot.ok ? parseSnapshotWith(schema, snapshot.value) : snapshot
}

const entryResource = (entry: unknown): unknown =>
  typeof entry === 'object' && entry !== null && 'resource' in entry ?
    (entry as { readonly resource?: unknown }).resource
  : undefined

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

export const parseGroveMobileExchangeBundle = (
  input: unknown,
): Result<GroveMobileExchangeBundle> => {
  const snapshot = cloneJsonValue(input)
  if (!snapshot.ok) return snapshot
  input = snapshot.value
  const entries =
    typeof input === 'object' && input !== null && 'entry' in input ?
      (input as { readonly entry?: unknown }).entry
    : undefined
  if (Array.isArray(entries)) {
    const invalidResourceTypeIndex = entries.findIndex(
      (entry) => !isAdmittedActiveEntryResource(entryResource(entry)),
    )
    if (invalidResourceTypeIndex !== -1) {
      return issues([
        groveRuleIssue('mobile-exchange.entry-resource-type', [
          'entry',
          invalidResourceTypeIndex,
          'resource',
          'resourceType',
        ]),
      ])
    }
    const containedIndex = entries.findIndex((entry) =>
      hasProhibitedContainedResource(entryResource(entry)),
    )
    if (containedIndex !== -1) {
      return issues([
        groveRuleIssue('mobile-exchange.contained-resource-prohibited', [
          'entry',
          containedIndex,
          'resource',
          'contained',
        ]),
      ])
    }
    const invalidIndex = entries.findIndex((entry) => {
      if (
        typeof entry !== 'object' ||
        entry === null ||
        !('resource' in entry)
      ) {
        return false
      }
      const resource = (entry as { readonly resource?: unknown }).resource
      return (
        typeof resource === 'object' &&
        resource !== null &&
        'resourceType' in resource &&
        (resource as { readonly resourceType?: unknown }).resourceType ===
          'Observation' &&
        !hasAdmittedMobileObservationProfile(resource)
      )
    })
    if (invalidIndex !== -1) {
      return issues([
        groveRuleIssue('mobile-output.semantic-profile', [
          'entry',
          invalidIndex,
          'resource',
          'meta',
          'profile',
        ]),
      ])
    }
    const invalidAdapterOnlyIndex = entries.findIndex((entry) => {
      if (
        typeof entry !== 'object' ||
        entry === null ||
        !('resource' in entry)
      ) {
        return false
      }
      return !hasAdmittedAdapterOnlyOutputProfile(
        (entry as { readonly resource?: unknown }).resource,
      )
    })
    if (invalidAdapterOnlyIndex !== -1) {
      return issues([
        groveRuleIssue('mobile-output.adapter-only-profile', [
          'entry',
          invalidAdapterOnlyIndex,
          'resource',
          'meta',
          'profile',
        ]),
      ])
    }
    const invalidDocumentIndex = entries.findIndex((entry) => {
      const resource = entryResource(entry)
      return (
        typeof resource === 'object' &&
        resource !== null &&
        'resourceType' in resource &&
        (resource as { readonly resourceType?: unknown }).resourceType ===
          'DocumentReference' &&
        !hasAdmittedActiveDocumentReferenceProfile(resource)
      )
    })
    if (invalidDocumentIndex !== -1) {
      return issues([
        groveRuleIssue('mobile-output.document-profile', [
          'entry',
          invalidDocumentIndex,
          'resource',
          'meta',
          'profile',
        ]),
      ])
    }
    const invalidDeviceIndex = entries.findIndex((entry) => {
      const resource = entryResource(entry)
      return (
        typeof resource === 'object' &&
        resource !== null &&
        'resourceType' in resource &&
        (resource as { readonly resourceType?: unknown }).resourceType ===
          'Device' &&
        !hasAdmittedActiveDeviceProfile(resource)
      )
    })
    if (invalidDeviceIndex !== -1) {
      return issues([
        groveRuleIssue('mobile-support.device-profile', [
          'entry',
          invalidDeviceIndex,
          'resource',
          'meta',
          'profile',
        ]),
      ])
    }
    const invalidProvenanceIndex = entries.findIndex((entry) => {
      const resource = entryResource(entry)
      return (
        typeof resource === 'object' &&
        resource !== null &&
        'resourceType' in resource &&
        (resource as { readonly resourceType?: unknown }).resourceType ===
          'Provenance' &&
        !hasAdmittedActiveProvenanceProfile(resource)
      )
    })
    if (invalidProvenanceIndex !== -1) {
      return issues([
        groveRuleIssue('mobile-exchange.provenance-profile', [
          'entry',
          invalidProvenanceIndex,
          'resource',
          'meta',
          'profile',
        ]),
      ])
    }
  }
  return parseSnapshotWith(groveMobileExchangeBundleSchema, input)
}

export const parseGroveMobileRetractionBundle = (
  input: unknown,
): Result<GroveMobileRetractionBundle> => {
  const snapshot = cloneJsonValue(input)
  if (!snapshot.ok) return snapshot
  input = snapshot.value
  const entries =
    typeof input === 'object' && input !== null && 'entry' in input ?
      (input as { readonly entry?: unknown }).entry
    : undefined
  if (Array.isArray(entries)) {
    const invalidIndex = entries.findIndex((entry) => {
      const resource = entryResource(entry)
      return (
        typeof resource === 'object' &&
        resource !== null &&
        'resourceType' in resource &&
        !['Device', 'Provenance'].includes(
          String(
            (resource as { readonly resourceType?: unknown }).resourceType,
          ),
        )
      )
    })
    if (invalidIndex !== -1) {
      return issues([
        groveRuleIssue('mobile-retraction.no-clinical-copy', [
          'entry',
          invalidIndex,
          'resource',
        ]),
      ])
    }
    const containedIndex = entries.findIndex((entry) =>
      hasProhibitedContainedResource(entryResource(entry)),
    )
    if (containedIndex !== -1) {
      return issues([
        groveRuleIssue('mobile-exchange.contained-resource-prohibited', [
          'entry',
          containedIndex,
          'resource',
          'contained',
        ]),
      ])
    }
  }
  return parseSnapshotWith(groveMobileRetractionBundleSchema, input)
}

export const parseSupportedR4Resource = (
  input: unknown,
): Result<SupportedR4Resource> => parseWith(supportedR4ResourceSchema, input)
