//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import type { Reference as R4Reference } from 'fhir/r4.js'
import { z } from 'zod'
import type {
  CollectionBundle,
  GraphResource,
  SupportedR4Resource,
} from './types.js'
import {
  attachmentSchema,
  codeableConceptSchema,
  codingSchema,
  deviceSchema,
  documentReferenceSchema,
  elementSchema,
  expressionSchema,
  extensionSchema,
  identifierSchema,
  instantSchema,
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
  questionnaireSchema,
  referenceSchema as baseReferenceSchema,
  researchStudySchema,
  researchSubjectSchema,
  sampledDataSchema,
  specimenSchema,
  visionPrescriptionSchema,
} from '../zod/r4/index.js'

// The FHIR R4 model is generated from the release's own StructureDefinitions; only Grove's
// narrowings are written here. Anything hand-written that merely restates the specification
// would be a second source of truth for it.
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

/**
 * A reference Grove can resolve.
 *
 * FHIR admits a Reference carrying only a display string. An exchange graph cannot follow one, so
 * Grove requires an actual pointer: a literal reference or a business identifier.
 */
export const resolvableReferenceSchema: z.ZodType<R4Reference> =
  baseReferenceSchema.refine(
    (value) => {
      const reference = value as { reference?: unknown; identifier?: unknown }
      return (
        reference.reference !== undefined || reference.identifier !== undefined
      )
    },
    { message: 'A Reference requires reference or identifier.' },
  )

/**
 * The reference every Grove resource uses.
 *
 * Named separately from the generated FHIR one, which the `/zod/r4` entry point also exports as
 * `referenceSchema`: they are different objects with different semantics, and a consumer
 * reaching for the wrong one would get no error.
 */
export const referenceSchema: z.ZodType<R4Reference> = resolvableReferenceSchema

/** The Element a primitive carries its id and extensions in. */
export const primitiveElementSchema: typeof elementSchema = elementSchema

/** The resources a Grove exchange graph may carry. */
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
  questionnaireSchema,
  questionnaireResponseSchema,
] as const

export const graphResourceSchema: z.ZodType<GraphResource> =
  z.union(graphResourceMembers)

/**
 * A Grove exchange bundle.
 *
 * Narrower than a FHIR Bundle in three ways the exchange contract requires: the type is always
 * `collection`, every entry carries a `urn:uuid:` full URL, and an entry's resource is one of the
 * graph resources rather than any resource at all.
 */
export const collectionBundleSchema: z.ZodType<CollectionBundle> =
  z.strictObject({
    resourceType: z.literal('Bundle'),
    id: z.string().optional(),
    meta: metaSchema.optional(),
    implicitRules: z.string().optional(),
    language: z.string().optional(),
    identifier: identifierSchema.optional(),
    type: z.literal('collection'),
    timestamp: instantSchema.optional(),
    entry: z
      .array(
        z.strictObject({
          id: z.string().optional(),
          extension: z.array(extensionSchema).optional(),
          modifierExtension: z.array(extensionSchema).optional(),
          fullUrl: z.string().regex(
            // Any UUID version, either case: RFC 4122 is case-insensitive on input and the
            // version nibble keeps growing. Grove mints lowercase v4 itself, but this also
            // validates bundles it receives, and rejecting a conformant v7 would be wrong.
            /^urn:uuid:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/u,
          ),
          resource: graphResourceSchema,
        }),
      )
      .optional(),
  }) as unknown as z.ZodType<CollectionBundle>

/** Any resource the package parses on its own. */
export const supportedR4ResourceSchema: z.ZodType<SupportedR4Resource> =
  z.union(graphResourceMembers)
