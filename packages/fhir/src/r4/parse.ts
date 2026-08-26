//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type z } from 'zod'
import {
  collectionBundleSchema,
  deviceSchema,
  documentReferenceSchema,
  observationSchema,
  provenanceSchema,
  specimenSchema,
  supportedR4ResourceSchema,
} from './schemas.js'
import type {
  CollectionBundle,
  Device,
  DocumentReference,
  Observation,
  Provenance,
  Specimen,
  SupportedR4Resource,
} from './types.js'
import {
  deepFreeze,
  issues,
  ok,
  type Issue,
  type Result,
} from '../core/index.js'

const normalizeIssue = (entry: z.core.$ZodIssue): Issue => ({
  severity: 'error',
  code: 'schema-invalid',
  path: entry.path.map((component) =>
    typeof component === 'symbol' ?
      (component.description ?? component.toString())
    : component,
  ),
  message: entry.message,
})

// The schema decides the parsed type; a caller-chosen T would make the cast below a lie.
const parseWith = <T>(schema: z.ZodType<T>, input: unknown): Result<T> => {
  const result = schema.safeParse(input)
  if (!result.success) {
    return issues(result.error.issues.map(normalizeIssue))
  }
  return ok(deepFreeze(result.data) as T)
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

export const parseCollectionBundle = (
  input: unknown,
): Result<CollectionBundle> => parseWith(collectionBundleSchema, input)

export const parseSupportedR4Resource = (
  input: unknown,
): Result<SupportedR4Resource> => parseWith(supportedR4ResourceSchema, input)
