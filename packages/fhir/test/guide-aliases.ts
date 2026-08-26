//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

// The implementation guide's own facade exports its profile schemas under unprefixed names. This
// package cannot: `observationSchema` is already the permissive R4B schema at the root, so the
// profiles carry a `grove` prefix.
//
// The guide's test suites are the behavioural specification for the profiles, and they are more
// useful the less they are touched. This module lets them keep their original import lists, so the
// only edit any of them needs is the specifier on one import — every assertion stays as written,
// and `git diff` against the guide shows nothing was relaxed.

export {
  groveAttachmentSchema as attachmentSchema,
  groveCodeableConceptSchema as codeableConceptSchema,
  groveCodingSchema as codingSchema,
  groveCollectionBundleSchema as collectionBundleSchema,
  groveDeviceSchema as deviceSchema,
  groveDocumentReferenceSchema as documentReferenceSchema,
  groveExpressionSchema as expressionSchema,
  groveExtensionSchema as extensionSchema,
  groveGraphResourceSchema as graphResourceSchema,
  groveIdentifierSchema as identifierSchema,
  groveMetaSchema as metaSchema,
  groveObservationComponentSchema as observationComponentSchema,
  groveObservationSchema as observationSchema,
  grovePeriodSchema as periodSchema,
  grovePrimitiveElementSchema as primitiveElementSchema,
  groveProvenanceSchema as provenanceSchema,
  groveQuantitySchema as quantitySchema,
  groveReferenceSchema as referenceSchema,
  groveSampledDataSchema as sampledDataSchema,
  groveSpecimenSchema as specimenSchema,
  groveSupportedR4ResourceSchema as supportedR4ResourceSchema,
} from '../src/r4/index.js'
