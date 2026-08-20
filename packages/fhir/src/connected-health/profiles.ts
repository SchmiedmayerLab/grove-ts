//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

/* eslint-disable sonarjs/no-clear-text-protocols -- FHIR fixes these canonical URIs to HTTP. */

import {
  groveConnectedHealthPackageCanonicals,
  groveConnectedHealthProfileCanonicals,
} from './contract.generated.js'
import { groveFhirExchangeIdentity } from '../mobile/measurement-catalog.generated.js'

type GroveSystems = Readonly<{
  groveRecordingMethod: string
  isoLifecycle: string
  observationCategory: string
  provenanceParticipant: string
}>

export const SYSTEMS: GroveSystems = {
  groveRecordingMethod: `${groveConnectedHealthPackageCanonicals.mobile}/CodeSystem/grove-recording-method`,
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
  connectedHealthObservation: string
  sensorRecordingDocument: string
  connectedHealthRecordingDocument: string
  connectedHealthConversionProvenance: string
}>

export const PROFILES: GroveProfiles = {
  mobileBundle:
    groveConnectedHealthProfileCanonicals['grove-mobile-exchange-bundle'],
  recordingDevice:
    groveConnectedHealthProfileCanonicals['grove-recording-device'],
  applicationDevice:
    groveConnectedHealthProfileCanonicals['grove-application-device'],
  connectedHealthObservation:
    groveConnectedHealthProfileCanonicals['connected-health-observation'],
  sensorRecordingDocument:
    groveConnectedHealthProfileCanonicals['grove-sensor-recording-document'],
  connectedHealthRecordingDocument:
    groveConnectedHealthProfileCanonicals[
      'connected-health-recording-document'
    ],
  connectedHealthConversionProvenance:
    groveConnectedHealthProfileCanonicals[
      'connected-health-conversion-provenance'
    ],
} as const

type GroveExtensions = Readonly<{
  gatewayDevice: string
  recordingMethod: string
  connectedHealthProvider: string
  connectedHealthSourceType: string
  exchangeEntryIdentifier: string
  researchStudy: string
}>

export const EXTENSIONS: GroveExtensions = {
  gatewayDevice:
    'http://hl7.org/fhir/StructureDefinition/observation-gatewayDevice',
  recordingMethod: `${groveConnectedHealthPackageCanonicals.mobile}/StructureDefinition/grove-recording-method`,
  connectedHealthProvider: `${groveConnectedHealthPackageCanonicals['connected-health']}/StructureDefinition/connected-health-provider`,
  connectedHealthSourceType: `${groveConnectedHealthPackageCanonicals['connected-health']}/StructureDefinition/connected-health-source-type`,
  exchangeEntryIdentifier: groveFhirExchangeIdentity.entryIdentifierExtension,
  researchStudy:
    'http://hl7.org/fhir/StructureDefinition/workflow-researchStudy',
} as const
