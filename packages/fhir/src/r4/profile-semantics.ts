//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { sha1 } from '@noble/hashes/legacy.js'
import type { z } from 'zod'
import {
  addIssue,
  asRecord,
  codingCount,
  codingCountForSystem,
  identifiersOf,
  type UnknownRecord,
} from './graph-schema-utils.js'
import {
  adapterSourceMarkerClaims,
  groveProfileClaims,
} from '../contract/measurement-catalog.generated.js'
import {
  healthKitApplicationDeviceIdentity,
  healthKitClinicalRecordAdmission,
} from '../contract/providers.generated.js'
import { decodeCanonicalBase64 } from '../core/index.js'
import { groveMobileContract } from '../mobile/contract.js'

const SHA1_BASE64 = /^[A-Za-z\d+/]{26}[AEIMQUYcgkosw048]=$/u

// FHIR's base64Binary lexical space admits whitespace; the payload itself must still be canonical.
const decodeFhirBase64 = (value: unknown): Uint8Array | undefined => {
  if (typeof value !== 'string') return undefined
  const packed = value.replaceAll(/[ \t\n\r]/gu, '')
  return packed.length === 0 ? undefined : decodeCanonicalBase64(packed)
}

const bytesEqual = (left: Uint8Array, right: Uint8Array): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index])

type RecordingFormats = typeof groveMobileContract.recordingFormats.formats

const isRecordingFormatCode = (code: unknown): code is keyof RecordingFormats =>
  typeof code === 'string' &&
  Object.hasOwn(groveMobileContract.recordingFormats.formats, code)

const recordingFormat = (
  code: unknown,
): RecordingFormats[keyof RecordingFormats] | undefined =>
  isRecordingFormatCode(code) ?
    groveMobileContract.recordingFormats.formats[code]
  : undefined

interface ExactProfileClaim {
  readonly cardinality: number
  readonly profiles: readonly string[]
  readonly requiredIdentifierRoles?: readonly string[]
}

const DOCUMENT_REFERENCE_PROFILE_CLAIMS: readonly ExactProfileClaim[] = [
  groveProfileClaims.sensorRecordingDocumentClaim,
  groveProfileClaims.healthKitRecordingDocumentClaim,
  groveProfileClaims.healthKitClinicalRecordDocumentClaim,
  groveProfileClaims.providerRecordingDocumentClaim,
  groveProfileClaims.sensorKitRecordingDocumentClaim,
]

const ADAPTER_ONLY_OUTPUT_PROFILE_CLAIMS = [
  groveProfileClaims.healthConnectSpecimenClaim,
  ...groveProfileClaims.healthKitPlatformExclusiveResourceClaims,
] as const
type AdapterOnlyOutputProfileClaim =
  (typeof ADAPTER_ONLY_OUTPUT_PROFILE_CLAIMS)[number]
const ADAPTER_ONLY_OUTPUT_PROFILE_CLAIM_BY_TYPE: ReadonlyMap<
  string,
  AdapterOnlyOutputProfileClaim
> = new Map(
  ADAPTER_ONLY_OUTPUT_PROFILE_CLAIMS.map((claim) => [
    claim.resourceType,
    claim,
  ]),
)
/** Whether an adapter-only output declares its exact catalog-owned single profile. */
export const hasAdmittedAdapterOnlyOutputProfile = (
  resource: unknown,
): boolean => {
  const record = asRecord(resource)
  if (typeof record?.resourceType !== 'string') return true
  const claim = ADAPTER_ONLY_OUTPUT_PROFILE_CLAIM_BY_TYPE.get(
    record.resourceType,
  )
  if (claim === undefined) return true
  const profiles = asRecord(record.meta)?.profile
  return (
    Array.isArray(profiles) &&
    profiles.length === 1 &&
    profiles[0] === claim.profile
  )
}

const exactProfileClaim = (
  resource: UnknownRecord,
  claims: readonly ExactProfileClaim[],
): ExactProfileClaim | undefined => {
  const profiles = asRecord(resource.meta)?.profile
  if (!Array.isArray(profiles)) {
    return undefined
  }
  const directProfiles = profiles.filter(
    (profile): profile is string => typeof profile === 'string',
  )
  if (
    directProfiles.length !== profiles.length ||
    new Set(directProfiles).size !== directProfiles.length
  ) {
    return undefined
  }
  const matching = claims.filter((claim) => {
    const expected = new Set(claim.profiles)
    return (
      directProfiles.length === claim.cardinality &&
      directProfiles.length === expected.size &&
      directProfiles.every((profile) => expected.has(profile))
    )
  })
  if (matching.length !== 1) return undefined
  return matching.at(0)
}

/** Whether an active DocumentReference declares one exact catalog-admitted direct profile mode. */
export const hasAdmittedActiveDocumentReferenceProfile = (
  resource: unknown,
): boolean => {
  const record = asRecord(resource)
  return (
    record?.resourceType === 'DocumentReference' &&
    exactProfileClaim(record, DOCUMENT_REFERENCE_PROFILE_CLAIMS) !== undefined
  )
}

/** Whether an active Device declares one exact catalog-admitted direct profile mode. */
export const hasAdmittedActiveDeviceProfile = (resource: unknown): boolean => {
  const record = asRecord(resource)
  return (
    record?.resourceType === 'Device' &&
    exactProfileClaim(record, groveProfileClaims.activeDeviceClaims) !==
      undefined
  )
}

const validateProfiledDevice = (
  resource: UnknownRecord,
  roleCounts: ReadonlyMap<string, number>,
  context: z.core.$RefinementCtx,
  path: ReadonlyArray<number | string>,
) => {
  const claim = exactProfileClaim(
    resource,
    groveProfileClaims.activeDeviceClaims,
  )
  if (claim === undefined) {
    addIssue(
      context,
      'mobile-support.device-profile',
      [...path, 'meta', 'profile'],
      'An active Device must declare exactly one catalog-admitted direct profile mode.',
    )
    return
  }
  const requiredRoles = new Set(claim.requiredIdentifierRoles ?? [])
  if (
    [...requiredRoles].some((role) => roleCounts.get(role) !== 1) ||
    [...roleCounts].some(([role]) => !requiredRoles.has(role))
  ) {
    addIssue(
      context,
      'mobile-support.device-profile',
      [...path, 'identifier'],
      'An active Device must carry exactly the typed identities required by its admitted profile mode.',
    )
    return
  }
  const profile = claim.profiles[0]
  if (
    profile === groveMobileContract.profiles.recordingDevice &&
    (roleCounts.get('recording-device') !== 1 ||
      identifiersOf(resource).length !== 2)
  ) {
    addIssue(
      context,
      'mobile-recording-device.identities',
      [...path, 'identifier'],
      'A recording Device requires exactly one stable recording-device identity and one event snapshot identity.',
    )
  }
  if (
    profile === groveMobileContract.profiles.hostDevice &&
    identifiersOf(resource).length !== 1
  ) {
    addIssue(
      context,
      'mobile-host-device.identity',
      [...path, 'identifier'],
      'A host Device carries exactly one event snapshot identity.',
    )
  }
  if (profile === healthKitApplicationDeviceIdentity.profile) {
    const definition = healthKitApplicationDeviceIdentity.bundleIdentifier
    const bundleIdentifiers = identifiersOf(resource).filter(
      (candidate) =>
        codingCount(
          asRecord(candidate)?.type,
          definition.typeSystem,
          definition.typeCode,
        ) === 1,
    )
    const bundleIdentifier = asRecord(bundleIdentifiers[0])
    const bundleIdentifierValue = bundleIdentifier?.value
    if (
      bundleIdentifiers.length !== 1 ||
      codingCountForSystem(bundleIdentifier?.type, definition.typeSystem) !==
        1 ||
      bundleIdentifier?.system !== definition.system ||
      typeof bundleIdentifierValue !== 'string' ||
      bundleIdentifierValue.trim() === ''
    ) {
      addIssue(
        context,
        'healthkit-application-device.bundle-identifier',
        [...path, 'identifier'],
        'A HealthKit application Device requires exactly one typed Apple bundle product identifier.',
      )
    }
  }
}

const validateRecordingDocument = (
  resource: UnknownRecord,
  roleCounts: ReadonlyMap<string, number>,
  context: z.core.$RefinementCtx,
  path: ReadonlyArray<number | string>,
) => {
  const claim = exactProfileClaim(resource, DOCUMENT_REFERENCE_PROFILE_CLAIMS)
  if (claim === undefined) {
    addIssue(
      context,
      'mobile-output.document-profile',
      [...path, 'meta', 'profile'],
      'A source-preservation DocumentReference must declare exactly one catalog-admitted direct profile set.',
    )
  }
  const requiredRoles: ReadonlySet<string> = new Set<string>(
    claim?.requiredIdentifierRoles ?? [],
  )
  const missingRoles = [...requiredRoles].filter(
    (role) => roleCounts.get(role) !== 1,
  )
  if (claim !== undefined && missingRoles.length > 0) {
    addIssue(
      context,
      'mobile-recording-document.identities',
      [...path, 'identifier'],
      'A source-preservation DocumentReference requires every identity role named by its exact profile claim.',
    )
  }
  const admittedRoles = new Set([...requiredRoles, 'writer-record'])
  if (
    (roleCounts.get('writer-record') ?? 0) > 1 ||
    (claim !== undefined &&
      [...roleCounts].some(([role]) => !admittedRoles.has(role)))
  ) {
    addIssue(
      context,
      'mobile-recording-document.identity-roles',
      [...path, 'identifier'],
      'A recording DocumentReference admits only its three required identities and at most one writer-record identity.',
    )
  }
  if (
    resource.type === undefined ||
    resource.subject === undefined ||
    typeof resource.date !== 'string'
  ) {
    addIssue(
      context,
      'mobile-recording-document.required-metadata',
      path,
      'A recording DocumentReference requires type, Patient subject, and document creation date.',
    )
  }
  const content = Array.isArray(resource.content) ? resource.content : []
  const item = asRecord(content[0])
  const attachment = asRecord(item?.attachment)
  const format = asRecord(item?.format)
  const hasData = attachment?.data !== undefined
  const hasUrl = attachment?.url !== undefined
  if (
    content.length !== 1 ||
    attachment === undefined ||
    hasData === hasUrl ||
    typeof attachment.contentType !== 'string' ||
    attachment.contentType === '' ||
    !Number.isInteger(attachment.size) ||
    Number(attachment.size) < 0 ||
    Number(attachment.size) > 2_147_483_647 ||
    typeof attachment.hash !== 'string' ||
    !SHA1_BASE64.test(attachment.hash)
  ) {
    addIssue(
      context,
      'mobile-recording-document.attachment',
      [...path, 'content'],
      'A recording has one attachment with exactly one payload location, media type, R4-sized byte count, and canonical SHA-1 hash.',
    )
  }
  if (typeof attachment?.data === 'string') {
    const payload = decodeFhirBase64(attachment.data)
    const digest = decodeFhirBase64(attachment.hash)
    if (
      payload === undefined ||
      digest === undefined ||
      payload.length !== attachment.size ||
      !bytesEqual(sha1(payload), digest)
    ) {
      addIssue(
        context,
        'mobile-recording-document.embedded-integrity',
        [...path, 'content', 0, 'attachment'],
        'Embedded recording size and SHA-1 hash must match the decoded attachment bytes.',
      )
    }
  }
  const definition = recordingFormat(format?.code)
  const formatContentTypes: readonly string[] = definition?.contentTypes ?? []
  if (
    format?.system !== groveMobileContract.recordingFormats.codeSystem ||
    format.version !== undefined ||
    definition?.status !== 'active' ||
    typeof attachment?.contentType !== 'string' ||
    !formatContentTypes.includes(attachment.contentType)
  ) {
    addIssue(
      context,
      'mobile-recording-document.format',
      [...path, 'content', 0, 'format'],
      'Recording format and content type must match the active Grove registry entry; Coding.version is not permitted.',
    )
  }
  if (claim === groveProfileClaims.healthKitClinicalRecordDocumentClaim) {
    const representation = healthKitClinicalRecordAdmission.fhirRepresentation
    const admittedContentTypes: readonly string[] = Object.values(
      representation.contentTypeByRelease,
    )
    if (
      resource.resourceType !== representation.resourceType ||
      format?.code !== healthKitClinicalRecordAdmission.payloadFormat ||
      typeof attachment?.contentType !== 'string' ||
      !admittedContentTypes.includes(attachment.contentType)
    ) {
      addIssue(
        context,
        'healthkit-clinical.fhir-representation',
        [...path, 'content', 0, 'attachment', 'contentType'],
        'A HealthKit clinical-record document must declare the admitted payload format and the exact media type of its source FHIR release.',
      )
    }
  }
}

const validateProfiledQuestionnaireResponse = (
  resource: UnknownRecord,
  context: z.core.$RefinementCtx,
  path: ReadonlyArray<number | string>,
) => {
  if (
    exactProfileClaim(resource, [
      groveProfileClaims.activeQuestionnaireResponseClaim,
    ]) === undefined
  ) {
    addIssue(
      context,
      'mobile-support.questionnaire-response-profile',
      [...path, 'meta', 'profile'],
      'An active QuestionnaireResponse must directly declare exactly the admitted Grove QuestionnaireResponse profile.',
    )
  }
}

type AdapterSourceMarker =
  (typeof adapterSourceMarkerClaims)[number]['markers'][number]

const adapterSourceMarkerCandidates = (
  resource: UnknownRecord,
  marker: AdapterSourceMarker,
): readonly unknown[] =>
  (Array.isArray(resource.extension) ? resource.extension : []).filter(
    (extension) => asRecord(extension)?.url === marker.url,
  )

const hasCompleteAdapterSourceMarker = (
  candidates: readonly unknown[],
): boolean =>
  candidates.every((candidate) => {
    const item = asRecord(candidate)
    return typeof item?.valueCode === 'string' && item.valueCode.trim() !== ''
  })

const validateAdapterSourceMarkers = (
  resource: UnknownRecord,
  context: z.core.$RefinementCtx,
  path: ReadonlyArray<number | string>,
) => {
  const profiles = asRecord(resource.meta)?.profile
  const directProfiles = new Set(
    Array.isArray(profiles) ?
      profiles.filter(
        (profile): profile is string => typeof profile === 'string',
      )
    : [],
  )
  for (const claim of adapterSourceMarkerClaims) {
    const claimsAdapterProfile = claim.profiles.some((profile) =>
      directProfiles.has(profile),
    )
    for (const marker of claim.markers) {
      if (
        typeof resource.resourceType !== 'string' ||
        !(marker.resourceTypes as readonly string[]).includes(
          resource.resourceType,
        )
      ) {
        continue
      }
      const candidates = adapterSourceMarkerCandidates(resource, marker)
      const complete = hasCompleteAdapterSourceMarker(candidates)
      if (
        (claimsAdapterProfile && (candidates.length !== 1 || !complete)) ||
        (!claimsAdapterProfile && candidates.length !== 0)
      ) {
        addIssue(
          context,
          'mobile-exchange.adapter-source-marker',
          path,
          `The ${claim.adapter} source marker must appear exactly once on its catalog-owned adapter output and never on a source-neutral or different-adapter output.`,
        )
      }
    }
  }
}

const validateAdapterOnlyOutputProfile = (
  resource: UnknownRecord,
  roleCounts: ReadonlyMap<string, number>,
  context: z.core.$RefinementCtx,
  path: ReadonlyArray<number | string>,
) => {
  if (typeof resource.resourceType !== 'string') return
  const claim = ADAPTER_ONLY_OUTPUT_PROFILE_CLAIM_BY_TYPE.get(
    resource.resourceType,
  )
  if (claim === undefined) return
  const exactProfile = hasAdmittedAdapterOnlyOutputProfile(resource)
  const requiredRoles: ReadonlySet<string> = new Set<string>(
    claim.requiredIdentifierRoles,
  )
  const invalidRoles =
    [...requiredRoles].some((role) => roleCounts.get(role) !== 1) ||
    [...roleCounts].some(
      ([role]) => !requiredRoles.has(role) && role !== 'writer-record',
    )
  const closedSpecimenIdentifiers =
    resource.resourceType === 'Specimen' &&
    identifiersOf(resource).length !== requiredRoles.size
  if (!exactProfile || invalidRoles || closedSpecimenIdentifiers) {
    addIssue(
      context,
      'mobile-output.adapter-only-profile',
      [...path, 'meta', 'profile'],
      'This active output resource type is admitted only under its exact one-profile adapter claim and required typed identities.',
    )
  }
}

export const validateProfiledResource = (
  resource: unknown,
  roleCounts: ReadonlyMap<string, number>,
  context: z.core.$RefinementCtx,
  path: ReadonlyArray<number | string>,
): void => {
  const record = asRecord(resource)
  if (record !== undefined) {
    validateAdapterSourceMarkers(record, context, path)
    validateAdapterOnlyOutputProfile(record, roleCounts, context, path)
  }
  if (record?.resourceType === 'Device') {
    validateProfiledDevice(record, roleCounts, context, path)
  } else if (record?.resourceType === 'DocumentReference') {
    validateRecordingDocument(record, roleCounts, context, path)
  } else if (record?.resourceType === 'QuestionnaireResponse') {
    validateProfiledQuestionnaireResponse(record, context, path)
  }
}
