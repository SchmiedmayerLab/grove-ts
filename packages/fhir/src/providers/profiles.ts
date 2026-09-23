//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

/* eslint-disable sonarjs/no-clear-text-protocols -- FHIR fixes these canonical URIs to HTTP. */

import {
  groveExchangeProtocol,
  groveMobileProfileCanonicals,
} from '../contract/measurement-catalog.generated.js'
import {
  providerAdapterCatalog,
  groveProviderPackageCanonicals,
  groveProviderProfileCanonicals,
} from '../contract/providers.generated.js'

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
  groveIdentifierRole: groveExchangeProtocol.codeSystems.identifierRole,
  groveLifecycleEvent: groveExchangeProtocol.codeSystems.lifecycleEvent,
  groveRecordingMethod: `${groveProviderPackageCanonicals.mobile}/CodeSystem/grove-recording-method`,
  isoLifecycle: groveExchangeProtocol.lifecycle.active.activitySystem,
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
  hostDevice: groveMobileProfileCanonicals['grove-host-device'],
  providerObservation: groveProviderProfileCanonicals['providers-observation'],
  sensorRecordingDocument:
    groveProviderProfileCanonicals['grove-sensor-recording-document'],
  providerRecordingDocument:
    groveProviderProfileCanonicals['providers-recording-document'],
  providerConversionProvenance:
    groveProviderProfileCanonicals['providers-conversion-provenance'],
  retractionBundle: groveExchangeProtocol.profiles.retractionBundle,
  retractionProvenance: groveExchangeProtocol.profiles.retractionProvenance,
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

const extensionTarget = (name: string): string => {
  const rule = groveExchangeProtocol.referencePolicy.extensionTargets.find(
    ({ url }) => url.endsWith(`/${name}`),
  )
  if (rule === undefined) {
    throw new Error(`The exchange protocol names no ${name} extension target.`)
  }
  return rule.url
}

export const EXTENSIONS: GroveExtensions = {
  gatewayDevice: extensionTarget('observation-gatewayDevice'),
  recordingMethod: `${groveProviderPackageCanonicals.mobile}/StructureDefinition/grove-recording-method`,
  provider: providerAdapterCatalog.providerExtension.url,
  providerSourceType: providerAdapterCatalog.sourceTypeExtension.url,
  entryNodeKey: groveExchangeProtocol.extensions.entryNodeKey,
  retractionTargetRole: groveExchangeProtocol.extensions.retractionTargetRole,
  retractionTargetNativeIdentifier:
    groveExchangeProtocol.extensions.retractionTargetNativeIdentifier,
  researchStudy: extensionTarget('workflow-researchStudy'),
  writerRecordVersion: groveExchangeProtocol.extensions.writerRecordVersion,
} as const
