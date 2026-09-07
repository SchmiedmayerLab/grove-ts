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
} from '../contract/measurement-catalog.generated.js'
import { deepFreeze } from '../core/index.js'

export interface GroveMobileProtocolContract {
  readonly canonical: string
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
    retractionTargetNativeIdentifier: string
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
    valuePrefixes: Readonly<{
      opaque: string
      event: string
      entryNode: string
    }>
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

// Each identity value form opens with its revision token, so the contract owns every
// persisted prefix and a renumbered revision reaches this package by regeneration alone.
const valuePrefix = (valueForm: string): string =>
  `${valueForm.slice(0, valueForm.indexOf(':'))}:`

// Canonicals the implementation guide owns that the pinned catalog release does not yet
// publish. The catalog spread overrides each one the moment a re-pin carries it.
const unpinnedExtensionCanonicals = {
  retractionTargetNativeIdentifier:
    'https://grovealliance.org/fhir/mobile/StructureDefinition/grove-retraction-target-native-identifier',
} as const

const groveMobileContractValue: GroveMobileProtocolContract = {
  canonical: groveMobilePackageMetadata.canonical,
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
  extensions: {
    ...unpinnedExtensionCanonicals,
    ...groveExchangeProtocol.extensions,
  },
  systems: groveExchangeProtocol.codeSystems,
  identity: {
    domain: groveExchangeProtocol.opaqueIdentity.domain,
    entryNodeDomain: groveExchangeProtocol.entryIdentity.entryNode.domain,
    fullUrlNamespace: groveExchangeProtocol.entryIdentity.fullUrl.namespace,
    valuePrefixes: {
      opaque: valuePrefix(groveExchangeProtocol.opaqueIdentity.valueForm),
      event: valuePrefix(
        groveExchangeProtocol.event.bundleIdentifier.valueForm,
      ),
      entryNode: valuePrefix(
        groveExchangeProtocol.entryIdentity.entryNode.valueForm,
      ),
    },
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

/** Runtime constants projected from the generated Grove FHIR protocol catalog. */
export const groveMobileContract: GroveMobileProtocolContract = deepFreeze(
  groveMobileContractValue,
)
