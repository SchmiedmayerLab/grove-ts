//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

/* eslint-disable sonarjs/no-clear-text-protocols -- FHIR fixes these canonical URIs to HTTP. */

import {
  groveProviderPackageCanonicals,
  groveProviderProfileCanonicals,
} from './contract.generated.js'
import { groveFhirExchangeIdentity } from '../mobile/measurement-catalog.generated.js'

type GroveSystems = Readonly<{
  groveAggregationMethod: string
  groveRecordingMethod: string
  isoLifecycle: string
  observationCategory: string
  provenanceParticipant: string
}>

export const SYSTEMS: GroveSystems = {
  groveAggregationMethod: `${groveProviderPackageCanonicals.mobile}/CodeSystem/grove-aggregation-method`,
  groveRecordingMethod: `${groveProviderPackageCanonicals.mobile}/CodeSystem/grove-recording-method`,
  isoLifecycle: 'http://terminology.hl7.org/CodeSystem/iso-21089-lifecycle',
  observationCategory:
    'http://terminology.hl7.org/CodeSystem/observation-category',
  provenanceParticipant:
    'http://terminology.hl7.org/CodeSystem/provenance-participant-type',
} as const

type GroveProfiles = Readonly<{
  mobileBundle: string
  recordingDevice: string
  applicationDevice: string
  providerObservation: string
  sensorRecordingDocument: string
  providerRecordingDocument: string
  providerConversionProvenance: string
}>

export const PROFILES: GroveProfiles = {
  mobileBundle: groveProviderProfileCanonicals['grove-mobile-exchange-bundle'],
  recordingDevice: groveProviderProfileCanonicals['grove-recording-device'],
  applicationDevice: groveProviderProfileCanonicals['grove-application-device'],
  providerObservation: groveProviderProfileCanonicals['provider-observation'],
  sensorRecordingDocument:
    groveProviderProfileCanonicals['grove-sensor-recording-document'],
  providerRecordingDocument:
    groveProviderProfileCanonicals['provider-recording-document'],
  providerConversionProvenance:
    groveProviderProfileCanonicals['provider-conversion-provenance'],
} as const

type GroveExtensions = Readonly<{
  gatewayDevice: string
  recordingMethod: string
  provider: string
  providerSourceType: string
  exchangeEntryIdentifier: string
  researchStudy: string
}>

export const EXTENSIONS: GroveExtensions = {
  gatewayDevice:
    'http://hl7.org/fhir/StructureDefinition/observation-gatewayDevice',
  recordingMethod: `${groveProviderPackageCanonicals.mobile}/StructureDefinition/grove-recording-method`,
  provider: `${groveProviderPackageCanonicals.providers}/StructureDefinition/provider`,
  providerSourceType: `${groveProviderPackageCanonicals.providers}/StructureDefinition/provider-source-type`,
  exchangeEntryIdentifier: groveFhirExchangeIdentity.entryIdentifierExtension,
  researchStudy:
    'http://hl7.org/fhir/StructureDefinition/workflow-researchStudy',
} as const
