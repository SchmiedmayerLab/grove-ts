//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'
import type {
  GraphResource,
  R4CollectionBundle,
  Reference,
  SupportedR4Resource,
} from './types.js'
import {
  attachmentSchema,
  bundleSchema,
  codeableConceptSchema,
  codingSchema,
  deviceSchema,
  documentReferenceSchema,
  elementSchema,
  expressionSchema,
  extensionSchema,
  identifierSchema,
  medicationAdministrationSchema,
  medicationStatementSchema,
  metaSchema,
  observationComponentSchema,
  observationSchema,
  patientSchema,
  periodSchema,
  planDefinitionSchema,
  provenanceSchema,
  quantitySchema,
  questionnaireResponseSchema,
  referenceSchema as baseReferenceSchema,
  researchStudySchema,
  researchSubjectSchema,
  sampledDataSchema,
  specimenSchema,
  visionPrescriptionSchema,
} from '../zod/r4/index.js'

export {
  attachmentSchema,
  codeableConceptSchema,
  codingSchema,
  deviceSchema,
  documentReferenceSchema,
  expressionSchema,
  extensionSchema,
  identifierSchema,
  metaSchema,
  observationComponentSchema,
  observationSchema,
  periodSchema,
  provenanceSchema,
  quantitySchema,
  sampledDataSchema,
  specimenSchema,
}

type UnknownRecord = Readonly<Record<string, unknown>>

const asRecord = (value: unknown): UnknownRecord | undefined =>
  typeof value === 'object' && value !== null ?
    (value as UnknownRecord)
  : undefined

const completeIdentifier = (
  value: unknown,
): value is { readonly system: string; readonly value: string } => {
  const identifier = asRecord(value)
  return (
    typeof identifier?.system === 'string' &&
    identifier.system !== '' &&
    typeof identifier.value === 'string' &&
    identifier.value !== ''
  )
}

/** A nonblank literal pointer or a complete `(system, value)` business identifier. */
export const resolvableReferenceSchema: z.ZodType<Reference> =
  baseReferenceSchema.refine(
    (value) =>
      (typeof value.reference === 'string' && value.reference.trim() !== '') ||
      completeIdentifier(value.identifier),
    {
      message:
        'A Reference requires a nonblank reference or complete identifier.',
    },
  )

/** The Element a primitive carries its id and extensions in. */
export const primitiveElementSchema: typeof elementSchema = elementSchema

const graphResourceMembers = [
  observationSchema,
  deviceSchema,
  documentReferenceSchema,
  provenanceSchema,
  specimenSchema,
  patientSchema,
  researchStudySchema,
  researchSubjectSchema,
  planDefinitionSchema,
  medicationAdministrationSchema,
  medicationStatementSchema,
  visionPrescriptionSchema,
  questionnaireResponseSchema,
] as const

/** The bounded resource surface Grove graph helpers expose. */
export const graphResourceSchema: z.ZodType<GraphResource> =
  z.union(graphResourceMembers)

/** Base-R4 collection parser: no Grove profile or graph promises are implied. */
export const r4CollectionBundleSchema: z.ZodType<R4CollectionBundle> =
  bundleSchema
    .refine((value) => value.type === 'collection', {
      message: 'Expected a FHIR R4 collection Bundle.',
    })
    .transform((value) => value as R4CollectionBundle)

/** Any standalone bounded graph resource or base-R4 collection Bundle. */
export const supportedR4ResourceSchema: z.ZodType<SupportedR4Resource> =
  z.union([r4CollectionBundleSchema, ...graphResourceMembers])
