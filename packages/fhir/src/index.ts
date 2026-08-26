//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

export * from './elements/index.js'
export * from './valueSets/index.js'
export * from './resources/account.js'
export * from './resources/activityDefinition.js'
export * from './resources/administrableProductDefinition.js'
export * from './resources/adverseEvent.js'
export * from './resources/allergyIntolerance.js'
export * from './resources/appointment.js'
export * from './resources/appointmentResponse.js'
export * from './resources/auditEvent.js'
export * from './resources/basic.js'
export * from './resources/binary.js'
export * from './resources/biologicallyDerivedProduct.js'
export * from './resources/bodyStructure.js'
export * from './resources/bundle.js'
export * from './resources/capabilityStatement.js'
export * from './resources/carePlan.js'
export * from './resources/careTeam.js'
export * from './resources/catalogEntry.js'
export * from './resources/chargeItem.js'
export * from './resources/chargeItemDefinition.js'
export * from './resources/citation.js'
export * from './resources/claim.js'
export * from './resources/claimResponse.js'
export * from './resources/clinicalImpression.js'
export * from './resources/clinicalUseDefinition.js'
export * from './resources/codeSystem.js'
export * from './resources/communication.js'
export * from './resources/communicationRequest.js'
export * from './resources/compartmentDefinition.js'
export * from './resources/composition.js'
export * from './resources/conceptMap.js'
export * from './resources/condition.js'
export * from './resources/consent.js'
export * from './resources/contract.js'
export * from './resources/coverage.js'
export * from './resources/coverageEligibilityRequest.js'
export * from './resources/coverageEligibilityResponse.js'
export * from './resources/detectedIssue.js'
export * from './resources/device.js'
export * from './resources/deviceDefinition.js'
export * from './resources/deviceMetric.js'
export * from './resources/deviceRequest.js'
export * from './resources/deviceUseStatement.js'
export * from './resources/diagnosticReport.js'
export * from './resources/documentManifest.js'
export * from './resources/documentReference.js'
export * from './resources/encounter.js'
export * from './resources/endpoint.js'
export * from './resources/enrollmentRequest.js'
export * from './resources/enrollmentResponse.js'
export * from './resources/episodeOfCare.js'
export * from './resources/eventDefinition.js'
export * from './resources/evidence.js'
export * from './resources/evidenceReport.js'
export * from './resources/evidenceVariable.js'
export * from './resources/exampleScenario.js'
export * from './resources/explanationOfBenefit.js'
export * from './resources/familyMemberHistory.js'
export * from './resources/fhirDomainResource.js'
export * from './resources/fhirResource.js'
export * from './resources/flag.js'
export * from './resources/goal.js'
export * from './resources/graphDefinition.js'
export * from './resources/group.js'
export * from './resources/guidanceResponse.js'
export * from './resources/healthcareService.js'
export * from './resources/imagingStudy.js'
export * from './resources/implementationGuide.js'
export * from './resources/immunization.js'
export * from './resources/immunizationEvaluation.js'
export * from './resources/immunizationRecommendation.js'
export * from './resources/ingredient.js'
export * from './resources/insurancePlan.js'
export * from './resources/invoice.js'
export * from './resources/library.js'
export * from './resources/linkage.js'
export * from './resources/list.js'
export * from './resources/location.js'
export * from './resources/manufacturedItemDefinition.js'
export * from './resources/measure.js'
export * from './resources/measureReport.js'
export * from './resources/medication.js'
export * from './resources/medicationAdministration.js'
export * from './resources/medicationDispense.js'
export * from './resources/medicationKnowledge.js'
export * from './resources/medicationRequest.js'
export * from './resources/medicationStatement.js'
export * from './resources/media.js'
export * from './resources/medicinalProductDefinition.js'
export * from './resources/messageDefinition.js'
export * from './resources/messageHeader.js'
export * from './resources/molecularSequence.js'
export * from './resources/namingSystem.js'
export * from './resources/nutritionOrder.js'
export * from './resources/nutritionProduct.js'
export * from './resources/observation.js'
export * from './resources/observationDefinition.js'
export * from './resources/operationDefinition.js'
export * from './resources/operationOutcome.js'
export * from './resources/organization.js'
export * from './resources/organizationAffiliation.js'
export * from './resources/packagedProductDefinition.js'
export * from './resources/parameters.js'
export * from './resources/patient.js'
export * from './resources/paymentNotice.js'
export * from './resources/paymentReconciliation.js'
export * from './resources/person.js'
export * from './resources/planDefinition.js'
export * from './resources/practitioner.js'
export * from './resources/practitionerRole.js'
export * from './resources/procedure.js'
export * from './resources/provenance.js'
export * from './resources/questionnaire.js'
export * from './resources/questionnaireResponse.js'
export * from './resources/regulatedAuthorization.js'
export * from './resources/relatedPerson.js'
export * from './resources/requestGroup.js'
export * from './resources/researchDefinition.js'
export * from './resources/researchElementDefinition.js'
export * from './resources/researchStudy.js'
export * from './resources/researchSubject.js'
export * from './resources/riskAssessment.js'
export * from './resources/schedule.js'
export * from './resources/searchParameter.js'
export * from './resources/serviceRequest.js'
export * from './resources/slot.js'
export * from './resources/specimen.js'
export * from './resources/specimenDefinition.js'
export * from './resources/structureDefinition.js'
export * from './resources/structureMap.js'
export * from './resources/subscription.js'
export * from './resources/subscriptionStatus.js'
export * from './resources/subscriptionTopic.js'
export * from './resources/substance.js'
export * from './resources/substanceDefinition.js'
export * from './resources/supplyDelivery.js'
export * from './resources/supplyRequest.js'
export * from './resources/task.js'
export * from './resources/terminologyCapabilities.js'
export * from './resources/testReport.js'
export * from './resources/testScript.js'
export * from './resources/valueSet.js'
export * from './resources/verificationResult.js'
export * from './resources/visionPrescription.js'

// Everything above is the R4B surface this package has always exported, unchanged. What follows is
// the Grove layer built on top of it: a result channel instead of thrown errors, and the profiles
// that constrain the R4B shapes above to what a Grove exchange admits.
//
// The profile schemas are named `grove*` so that no name means two things: `observationSchema`
// above is still the permissive R4B schema, and `groveObservationSchema` is the closed profile.
// Narrower entry points exist for callers who want only one layer — see the package README.

export {
  collectResults,
  deepFreeze,
  err,
  issues,
  mapResult,
  ok,
  parseAbsoluteUri,
  parseCanonical,
  parseFhirId,
  parseFhirInstant,
  parsePatientReference,
  parsePositiveInteger,
  parseResearchStudyReference,
  parseSemVer,
  parseUrnUuid,
  type AbsoluteUri,
  type Canonical,
  type FhirId,
  type FhirInstant,
  type Issue,
  type IssueCode,
  type ParseIssueSeverity,
  type PatientReference,
  type PositiveInteger,
  type ReadonlyDeep,
  type ResearchStudyReference,
  type Result,
  type SemVer,
  type UrnUuid,
} from './core/index.js'

export {
  groveAttachmentSchema,
  groveCodeableConceptSchema,
  groveCodingSchema,
  groveCollectionBundleSchema,
  groveDeviceSchema,
  groveDocumentReferenceSchema,
  groveExpressionSchema,
  groveExtensionSchema,
  groveGraphResourceSchema,
  groveIdentifierSchema,
  groveMetaSchema,
  groveObservationComponentSchema,
  groveObservationSchema,
  grovePeriodSchema,
  grovePrimitiveElementSchema,
  groveProvenanceSchema,
  groveQuantitySchema,
  groveReferenceSchema,
  groveSampledDataSchema,
  groveSpecimenSchema,
  groveSupportedR4ResourceSchema,
  parseCollectionBundle,
  parseDevice,
  parseDocumentReference,
  parseObservation,
  parseProvenance,
  parseSpecimen,
  parseSupportedR4Resource,
  // Deep-readonly views of the same `@types/fhir` interfaces the schemas above are declared
  // against. None of these names existed at the root before, so nothing is shadowed.
  type Attachment,
  type CodeableConcept,
  type Coding,
  type CollectionBundle,
  type Device,
  type DocumentReference,
  type Extension,
  type GraphResource,
  type Identifier,
  type Observation,
  type Period,
  type Provenance,
  type Quantity,
  type Questionnaire,
  type QuestionnaireResponse,
  type Reference,
  type SampledData,
  type Specimen,
  type SupportedR4Resource,
} from './r4/index.js'

// The measurement catalog and the questionnaire builders, exactly as the guide's facade exposes
// them. The provider adapters are deliberately absent: they carry platform-exclusive measurements
// and belong only to the `./providers` entry point, which `exports.test.ts` holds us to.

export {
  canonicalizeMobileEffectiveInstant,
  entryIdentifierName,
  createEntryIdentity,
  deriveEntryFullUrl,
  groveFhirContractVersion,
  groveFhirExchangeIdentity,
  groveFhirVersion,
  mobileEffectiveCanonicalization,
  mobileEffectiveCanonicalizationVectors,
  sharedMobileMeasurementCatalog,
  type ApplicationDeviceInput,
  type BloodPressureMeasurement,
  type CompleteIdentifierInput,
  type GatewayApplicationInput,
  type IdentifiedEntryIdentityInput,
  type InstantEffectiveTime,
  type InstantQuantityMeasurement,
  type InstantQuantityMeasurementKind,
  type MobileMeasurement,
  type PeriodEffectiveTime,
  type PeriodQuantityMeasurement,
  type PeriodQuantityMeasurementKind,
  type RecordingDeviceInput,
  type RecordingMethod,
  type ResourceIdentityInput,
  type SharedMobileMeasurementKind,
  type SleepStage,
  type SleepStageMeasurement,
  type SleepStageSourceCodingInput,
} from './mobile/index.js'

export {
  buildQuestionnaire,
  buildQuestionnaireResponse,
  parseQuestionnaire,
  parseQuestionnaireResponse,
  preflightQuestionnairePair,
  type GroveQuestionnaire,
  type GroveQuestionnaireResponse,
  type QuestionnaireInput,
  type QuestionnaireItemInput,
  type QuestionnairePair,
  type QuestionnairePreflightOptions,
  type QuestionnaireResponseAnswerInput,
  type QuestionnaireResponseInput,
  type QuestionnaireResponseItemInput,
  type ResolvedQuestionnaireValueSetInput,
} from './questionnaire/index.js'
