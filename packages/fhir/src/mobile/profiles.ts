//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

/* eslint-disable sonarjs/no-clear-text-protocols -- FHIR fixes these canonical URIs to HTTP. */

import {
  groveFhirExchangeIdentity,
  groveFhirPackageCanonicals,
  groveFhirProfileCanonicals,
} from './measurement-catalog.generated.js'

export const SYSTEMS = {
  groveMobileMeasurement: `${groveFhirPackageCanonicals.mobile}/CodeSystem/grove-mobile-measurement`,
  groveSleepStage: `${groveFhirPackageCanonicals.mobile}/CodeSystem/grove-sleep-stage`,
  isoLifecycle: 'http://terminology.hl7.org/CodeSystem/iso-21089-lifecycle',
  loinc: 'http://loinc.org',
  observationCategory:
    'http://terminology.hl7.org/CodeSystem/observation-category',
  provenanceParticipant:
    'http://terminology.hl7.org/CodeSystem/provenance-participant-type',
  ucum: 'http://unitsofmeasure.org',
} as const

export const PROFILES = {
  mobileBundle: groveFhirProfileCanonicals['grove-mobile-exchange-bundle'],
  mobileObservation: groveFhirProfileCanonicals['grove-mobile-observation'],
  mobileConversionProvenance:
    groveFhirProfileCanonicals['grove-mobile-conversion-provenance'],
  recordingDevice: groveFhirProfileCanonicals['grove-recording-device'],
  applicationDevice: groveFhirProfileCanonicals['grove-application-device'],
  connectedHealthObservation:
    groveFhirProfileCanonicals['connected-health-observation'],
  connectedHealthConversionProvenance:
    groveFhirProfileCanonicals['connected-health-conversion-provenance'],
} as const

export const EXTENSIONS = {
  gatewayDevice:
    'http://hl7.org/fhir/StructureDefinition/observation-gatewayDevice',
  recordingMethod: `${groveFhirPackageCanonicals.mobile}/StructureDefinition/grove-recording-method`,
  exchangeEntryIdentifier: groveFhirExchangeIdentity.entryIdentifierExtension,
  researchStudy:
    'http://hl7.org/fhir/StructureDefinition/workflow-researchStudy',
} as const
