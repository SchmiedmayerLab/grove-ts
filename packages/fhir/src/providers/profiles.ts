//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

/* eslint-disable sonarjs/no-clear-text-protocols -- FHIR fixes these canonical URIs to HTTP. */

import {
  providerAdapterCatalog,
  groveProviderPackageCanonicals,
  groveProviderProfileCanonicals,
} from '../contract/providers.generated.js'
import { groveMobileContract } from '../mobile/contract.js'

export const PROVIDER_RECORDING_OUTPUT_ROLE: 'native-recording' =
  providerAdapterCatalog.recordingDocument.outputRole
export const PROVIDER_RECORDING_OUTPUT_DISCRIMINATOR: 'single' =
  providerAdapterCatalog.recordingDocument.outputDiscriminator
type GroveSystems = Readonly<{
  groveAggregationMethod: string
  groveIdentifierRole: string
  groveLifecycleEvent: string
  groveRecordingMethod: string
  isoLifecycle: string
  provenanceParticipant: string
}>

export const SYSTEMS: GroveSystems = {
  groveAggregationMethod: `${groveProviderPackageCanonicals.mobile}/CodeSystem/grove-aggregation-method`,
  groveIdentifierRole: groveMobileContract.systems.identifierRole,
  groveLifecycleEvent: groveMobileContract.systems.lifecycleEvent,
  groveRecordingMethod: `${groveProviderPackageCanonicals.mobile}/CodeSystem/grove-recording-method`,
  isoLifecycle: 'http://terminology.hl7.org/CodeSystem/iso-21089-lifecycle',
  provenanceParticipant:
    'http://terminology.hl7.org/CodeSystem/provenance-participant-type',
} as const

type GroveProfiles = Readonly<{
  mobileBundle: string
  recordingDevice: string
  applicationDevice: string
  hostDevice: string
  providerObservation: string
  sensorRecordingDocument: string
  providerRecordingDocument: string
  providerConversionProvenance: string
  retractionBundle: string
  retractionProvenance: string
}>

export const PROFILES: GroveProfiles = {
  mobileBundle: groveProviderProfileCanonicals['grove-mobile-exchange-bundle'],
  recordingDevice: groveProviderProfileCanonicals['grove-recording-device'],
  applicationDevice: groveProviderProfileCanonicals['grove-application-device'],
  hostDevice: groveMobileContract.profiles.hostDevice,
  providerObservation: groveProviderProfileCanonicals['providers-observation'],
  sensorRecordingDocument:
    groveProviderProfileCanonicals['grove-sensor-recording-document'],
  providerRecordingDocument:
    groveProviderProfileCanonicals['providers-recording-document'],
  providerConversionProvenance:
    groveProviderProfileCanonicals['providers-conversion-provenance'],
  retractionBundle: groveMobileContract.profiles.retractionBundle,
  retractionProvenance: groveMobileContract.profiles.retractionProvenance,
} as const

type GroveExtensions = Readonly<{
  gatewayDevice: string
  recordingMethod: string
  provider: string
  providerSourceType: string
  entryNodeKey: string
  retractionTargetRole: string
  retractionTargetNativeIdentifier: string
  researchStudy: string
  writerRecordVersion: string
}>

export const EXTENSIONS: GroveExtensions = {
  gatewayDevice:
    'http://hl7.org/fhir/StructureDefinition/observation-gatewayDevice',
  recordingMethod: `${groveProviderPackageCanonicals.mobile}/StructureDefinition/grove-recording-method`,
  provider: `${groveProviderPackageCanonicals.providers}/StructureDefinition/provider`,
  providerSourceType: `${groveProviderPackageCanonicals.providers}/StructureDefinition/provider-source-type`,
  entryNodeKey: groveMobileContract.extensions.entryNodeKey,
  retractionTargetRole: groveMobileContract.extensions.retractionTargetRole,
  retractionTargetNativeIdentifier:
    groveMobileContract.extensions.retractionTargetNativeIdentifier,
  researchStudy:
    'http://hl7.org/fhir/StructureDefinition/workflow-researchStudy',
  writerRecordVersion:
    'https://grovealliance.org/fhir/mobile/StructureDefinition/grove-writer-record-version',
} as const
