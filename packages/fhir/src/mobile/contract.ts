//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  groveExchangeProtocol,
  groveMobilePackageMetadata,
  groveMobileProfileCanonicals,
  groveRecordingFormatRegistry,
} from './measurement-catalog.generated.js'
import { deepFreeze } from '../core/index.js'

export interface GroveMobileProtocolContract {
  readonly canonical: string
  readonly version: string
  readonly fhirVersion: string
  readonly protocolVersion: number
  readonly profiles: Readonly<{
    exchangeBundle: string
    conversionProvenance: string
    recordingDevice: string
    applicationDevice: string
    hostDevice: string
    sensorRecordingDocument: string
    retractionBundle: string
    retractionProvenance: string
  }>
  readonly extensions: Readonly<{
    entryNodeKey: string
    retractionTargetRole: string
  }>
  readonly systems: Readonly<{
    identifierRole: string
    lifecycleEvent: string
    retractionTargetRole: string
  }>
  readonly identity: Readonly<{
    domain: string
    entryNodeDomain: string
    fullUrlNamespace: string
    opaqueIdentifierRoles: readonly string[]
    resourceIdentifierPriority: readonly string[]
  }>
  readonly lifecycle: Readonly<{
    sourceRecordRetracted: string
    retractionTargets: typeof groveExchangeProtocol.lifecycle.retraction.targetRoles
    adapterOnlyOutputProfileClaims: typeof groveExchangeProtocol.lifecycle.active.adapterOnlyOutputProfileClaims
    activeEntryResourcePolicy: typeof groveExchangeProtocol.lifecycle.active.entryResourcePolicy
  }>
  readonly referencePolicy: typeof groveExchangeProtocol.referencePolicy
  readonly recordingFormats: typeof groveRecordingFormatRegistry
}

const groveMobileContractValue: GroveMobileProtocolContract = {
  canonical: groveMobilePackageMetadata.canonical,
  version: groveMobilePackageMetadata.version,
  fhirVersion: groveMobilePackageMetadata.fhirVersion,
  protocolVersion: groveExchangeProtocol.protocolVersion,
  profiles: {
    exchangeBundle: groveExchangeProtocol.profiles.activeBundle,
    conversionProvenance: groveExchangeProtocol.profiles.conversionProvenance,
    recordingDevice: groveMobileProfileCanonicals['grove-recording-device'],
    applicationDevice: groveMobileProfileCanonicals['grove-application-device'],
    hostDevice: groveMobileProfileCanonicals['grove-host-device'],
    sensorRecordingDocument:
      groveMobileProfileCanonicals['grove-sensor-recording-document'],
    retractionBundle: groveExchangeProtocol.profiles.retractionBundle,
    retractionProvenance: groveExchangeProtocol.profiles.retractionProvenance,
  },
  extensions: groveExchangeProtocol.extensions,
  systems: groveExchangeProtocol.codeSystems,
  identity: {
    domain: groveExchangeProtocol.opaqueIdentity.domain,
    entryNodeDomain: groveExchangeProtocol.entryIdentity.entryNode.domain,
    fullUrlNamespace: groveExchangeProtocol.entryIdentity.fullUrl.namespace,
    opaqueIdentifierRoles: [
      ...new Set(
        groveExchangeProtocol.opaqueIdentity.identityKinds.map(
          ({ identifierRole }) => identifierRole,
        ),
      ),
    ],
    resourceIdentifierPriority:
      groveExchangeProtocol.entryIdentity.resourceIdentifierPriority,
  },
  lifecycle: {
    activeEntryResourcePolicy:
      groveExchangeProtocol.lifecycle.active.entryResourcePolicy,
    adapterOnlyOutputProfileClaims:
      groveExchangeProtocol.lifecycle.active.adapterOnlyOutputProfileClaims,
    sourceRecordRetracted:
      groveExchangeProtocol.lifecycle.retraction.activityCode,
    retractionTargets: groveExchangeProtocol.lifecycle.retraction.targetRoles,
  },
  referencePolicy: groveExchangeProtocol.referencePolicy,
  recordingFormats: groveRecordingFormatRegistry,
}

/** Runtime constants projected from the pinned, generated Grove 0.6 protocol catalog. */
export const groveMobileContract: GroveMobileProtocolContract = deepFreeze(
  groveMobileContractValue,
)
