//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type z } from 'zod'
import {
  expectRule as expectRuleIssue,
  refinementIssues,
} from './rule-test-support.js'
import {
  adapterSourceMarkerClaims,
  groveProfileClaims,
} from '../src/contract/measurement-catalog.generated.js'
import {
  healthKitApplicationDeviceIdentity,
  healthKitClinicalRecordAdmission,
} from '../src/contract/providers.generated.js'
import { groveMobileContract } from '../src/mobile/contract.js'
import {
  hasAdmittedActiveDeviceProfile,
  hasAdmittedActiveDocumentReferenceProfile,
  hasAdmittedAdapterOnlyOutputProfile,
  validateProfiledResource,
} from '../src/r4/profile-semantics.js'

const refineProfiles =
  (roles: ReadonlyMap<string, number> = new Map()) =>
  (value: unknown, context: z.core.$RefinementCtx): void => {
    validateProfiledResource(value, roles, context, ['resource'])
  }

const messagesFor = (
  resource: unknown,
  roles: ReadonlyMap<string, number> = new Map(),
): readonly string[] =>
  refinementIssues(refineProfiles(roles), resource).map(
    ({ message }) => message,
  )

const codesFor = (
  resource: unknown,
  roles?: ReadonlyMap<string, number>,
): readonly string[] =>
  refinementIssues(refineProfiles(roles), resource).map(({ code }) => code)

const expectRule = (
  resource: unknown,
  code: string,
  roles?: ReadonlyMap<string, number>,
): void => {
  expectRuleIssue(refineProfiles(roles), resource, code)
}

const roles = (...values: readonly string[]): ReadonlyMap<string, number> =>
  new Map(values.map((value) => [value, 1]))

describe('profile-specific resource semantic boundaries', () => {
  it('rejects malformed direct profile sets before resource-specific checks', () => {
    const recordingProfile =
      groveProfileClaims.activeDeviceClaims[0].profiles[0]
    const documentProfiles =
      groveProfileClaims.providerRecordingDocumentClaim.profiles
    expect(hasAdmittedActiveDeviceProfile(null)).toBe(false)
    expect(
      hasAdmittedActiveDeviceProfile({
        resourceType: 'Device',
        meta: { profile: [recordingProfile] },
      }),
    ).toBe(true)
    expect(
      hasAdmittedActiveDocumentReferenceProfile({
        resourceType: 'DocumentReference',
        meta: { profile: documentProfiles },
      }),
    ).toBe(true)

    for (const profile of [
      undefined,
      [42],
      [recordingProfile, recordingProfile],
    ]) {
      const device = { resourceType: 'Device', meta: { profile } }
      expect(hasAdmittedActiveDeviceProfile(device)).toBe(false)
      expectRule(device, 'mobile-support.device-profile')
    }
    expect(
      hasAdmittedActiveDocumentReferenceProfile({ resourceType: 'Patient' }),
    ).toBe(false)
    expect(messagesFor(null)).toEqual([])
  })

  it('enforces exact Device identity modes after admitting the profile', () => {
    const recordingProfile = groveProfileClaims.activeDeviceClaims.find(
      ({ id }) => id === 'mobile-recording-device',
    )?.profiles[0]
    const hostProfile = groveProfileClaims.activeDeviceClaims.find(
      ({ id }) => id === 'mobile-host-device',
    )?.profiles[0]
    if (recordingProfile === undefined || hostProfile === undefined)
      throw new Error('Missing Device profile claim.')

    const recording = {
      resourceType: 'Device',
      meta: { profile: [recordingProfile] },
      identifier: [],
    }
    expectRule(
      recording,
      'mobile-support.device-profile',
      roles('recording-device'),
    )
    expectRule(
      recording,
      'mobile-recording-device.identities',
      roles('recording-device', 'device-snapshot'),
    )

    expectRule(
      {
        resourceType: 'Device',
        meta: { profile: [hostProfile] },
        identifier: [],
      },
      'mobile-host-device.identity',
      roles('device-snapshot'),
    )
  })

  it('requires the typed Apple bundle identifier on a HealthKit application', () => {
    const definition = healthKitApplicationDeviceIdentity.bundleIdentifier
    const device: {
      resourceType: string
      meta: { profile: string[] }
      identifier: Array<{
        type: { coding: Array<{ system: string; code: string }> }
        system: string
        value: string
      }>
    } = {
      resourceType: 'Device',
      meta: { profile: [healthKitApplicationDeviceIdentity.profile] },
      identifier: [
        {
          type: {
            coding: [
              { system: definition.typeSystem, code: definition.typeCode },
            ],
          },
          system: definition.system,
          value: 'org.example.study',
        },
      ],
    }
    expect(messagesFor(device, roles('device-snapshot'))).toEqual([])

    for (const mutate of [
      (candidate: typeof device) => {
        candidate.identifier = []
      },
      (candidate: typeof device) => {
        const identifier = candidate.identifier.at(0)
        if (identifier === undefined) throw new Error('Missing identifier.')
        identifier.type.coding.push({
          system: definition.typeSystem,
          code: 'other',
        })
      },
      (candidate: typeof device) => {
        const identifier = candidate.identifier.at(0)
        if (identifier === undefined) throw new Error('Missing identifier.')
        identifier.system = 'https://example.org/wrong-system'
      },
      (candidate: typeof device) => {
        const identifier = candidate.identifier.at(0)
        if (identifier === undefined) throw new Error('Missing identifier.')
        identifier.value = '   '
      },
    ]) {
      const candidate = structuredClone(device)
      mutate(candidate)
      expectRule(
        candidate,
        'healthkit-application-device.bundle-identifier',
        roles('device-snapshot'),
      )
    }
  })

  it('rejects incomplete recording documents with their specific rules', () => {
    const profile = groveProfileClaims.sensorRecordingDocumentClaim.profiles[0]
    const document = {
      resourceType: 'DocumentReference',
      meta: { profile: [profile] },
    }
    const requiredRoles = roles(
      'source-record',
      'source-output',
      'source-artifact',
    )

    expectRule(
      { ...document, meta: { profile: ['https://example.org/unknown'] } },
      'mobile-output.document-profile',
    )
    expectRule(document, 'mobile-recording-document.identities')
    expectRule(
      document,
      'mobile-recording-document.identity-roles',
      roles('source-record', 'source-output', 'source-artifact', 'unexpected'),
    )
    expectRule(
      document,
      'mobile-recording-document.identity-roles',
      new Map([
        ['source-record', 1],
        ['source-output', 1],
        ['source-artifact', 1],
        ['writer-record', 2],
      ]),
    )
    expectRule(
      document,
      'mobile-recording-document.required-metadata',
      requiredRoles,
    )
    expectRule(document, 'mobile-recording-document.attachment', requiredRoles)
    expectRule(document, 'mobile-recording-document.format', requiredRoles)
  })

  it('fails closed for malformed embedded recording data and registry metadata', () => {
    const profile = groveProfileClaims.sensorRecordingDocumentClaim.profiles[0]
    const requiredRoles = roles(
      'source-record',
      'source-output',
      'source-artifact',
    )
    const document = {
      resourceType: 'DocumentReference',
      meta: { profile: [profile] },
      type: {},
      subject: {},
      date: '2026-08-20T00:00:00Z',
      content: [
        {
          attachment: {
            data: 'AQID',
            contentType: 'application/octet-stream',
            size: 3,
            hash: 'cDeAcZjCKn0rCAc3HXY3eahP388=',
          },
          format: {
            system:
              'https://grovealliance.org/fhir/sensor/CodeSystem/grove-recording-format',
            code: 'sensor-recording',
          },
        },
      ],
    }
    for (const data of ['%%%%', '', 'AAAA']) {
      const candidate = structuredClone(document)
      const content = candidate.content.at(0)
      if (content === undefined) throw new Error('Missing recording content.')
      content.attachment.data = data
      expectRule(
        candidate,
        'mobile-recording-document.embedded-integrity',
        requiredRoles,
      )
    }
    const invalidFormat = structuredClone(document)
    const formatContent = invalidFormat.content.at(0)
    if (formatContent === undefined)
      throw new Error('Missing recording content.')
    formatContent.format = {
      system: 'https://example.org/wrong',
      code: 'unknown',
    }
    expectRule(invalidFormat, 'mobile-recording-document.format', requiredRoles)
  })

  it('requires the exact QuestionnaireResponse profile', () => {
    const profile =
      groveProfileClaims.activeQuestionnaireResponseClaim.profiles[0]
    expect(
      messagesFor({
        resourceType: 'QuestionnaireResponse',
        meta: { profile: [profile] },
      }),
    ).toEqual([])
    expectRule(
      { resourceType: 'QuestionnaireResponse', meta: { profile: [] } },
      'mobile-support.questionnaire-response-profile',
    )
  })

  it('closes adapter-only output profiles, identity roles, and source markers', () => {
    const claim = groveProfileClaims.healthConnectSpecimenClaim
    const specimen = {
      resourceType: claim.resourceType,
      meta: { profile: [claim.profile] },
      identifier: [],
    }
    const requiredRoles = roles(...claim.requiredIdentifierRoles)

    expect(
      hasAdmittedAdapterOnlyOutputProfile({ resourceType: 'Patient' }),
    ).toBe(true)
    expect(hasAdmittedAdapterOnlyOutputProfile({})).toBe(true)
    expect(messagesFor({})).toEqual([])
    expect(hasAdmittedAdapterOnlyOutputProfile(specimen)).toBe(true)
    expectRule(specimen, 'mobile-output.adapter-only-profile', requiredRoles)
    expectRule(
      { ...specimen, meta: { profile: ['https://example.org/unknown'] } },
      'mobile-output.adapter-only-profile',
      requiredRoles,
    )
    expectRule(specimen, 'mobile-output.adapter-only-profile', new Map())
    expectRule(
      specimen,
      'mobile-output.adapter-only-profile',
      roles(...claim.requiredIdentifierRoles, 'unexpected'),
    )

    const healthKitClaim =
      groveProfileClaims.healthKitPlatformExclusiveResourceClaims[0]
    const marker = adapterSourceMarkerClaims
      .find(({ adapter }) => adapter === 'healthkit')
      ?.markers.find(({ resourceTypes }) =>
        (resourceTypes as readonly string[]).includes(
          healthKitClaim.resourceType,
        ),
      )
    if (marker === undefined)
      throw new Error('Missing HealthKit source marker.')
    const healthKitResource = {
      resourceType: healthKitClaim.resourceType,
      meta: { profile: [healthKitClaim.profile] },
      extension: [{ url: marker.url, valueCode: '' }],
    }
    expectRule(
      healthKitResource,
      'mobile-exchange.adapter-source-marker',
      roles(...healthKitClaim.requiredIdentifierRoles),
    )

    const neutral = {
      resourceType: healthKitClaim.resourceType,
      meta: { profile: ['https://example.org/neutral'] },
      extension: [{ url: marker.url, valueCode: 'owned-marker' }],
    }
    expectRule(neutral, 'mobile-exchange.adapter-source-marker')
  })

  it('admits only the release-versioned media types on clinical documents', () => {
    const claim = groveProfileClaims.healthKitClinicalRecordDocumentClaim
    const representation = healthKitClinicalRecordAdmission.fhirRepresentation
    const clinicalDocument = (contentType: string) => ({
      resourceType: 'DocumentReference',
      meta: { profile: claim.profiles },
      content: [
        {
          attachment: { contentType },
          format: {
            system: groveMobileContract.recordingFormats.codeSystem,
            code: healthKitClinicalRecordAdmission.payloadFormat,
          },
        },
      ],
    })
    const clinicalRoles = roles(...claim.requiredIdentifierRoles)

    for (const contentType of Object.values(
      representation.contentTypeByRelease,
    )) {
      expect(
        codesFor(clinicalDocument(contentType), clinicalRoles),
      ).not.toContain('healthkit-clinical.fhir-representation')
    }
    expectRule(
      clinicalDocument('application/fhir+json'),
      'healthkit-clinical.fhir-representation',
      clinicalRoles,
    )
  })
})
