//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { EXTENSIONS, PROFILES, SYSTEMS } from './profiles.js'
import type { GovernedSourceIdentifierInput } from './types.js'
import { err, ok, type Result } from '../core/index.js'
import type {
  ApplicationDeviceInput,
  CompleteIdentifierInput,
  HostDeviceInput,
  IdentifiedEntryIdentityInput,
  RecordingDeviceInput,
  ResourceIdentityInput,
} from '../mobile/types.js'
import type {
  CodeableConcept,
  Coding,
  Device,
  GraphResource,
  GroveMobileExchangeBundle,
  Identifier,
  Provenance,
} from '../r4/index.js'

type GraphEntry = GroveMobileExchangeBundle['entry'][number]
type ProvenanceAgent = Provenance['agent'][number]

export const resourceId = (
  identity: ResourceIdentityInput,
): { readonly id?: string } =>
  identity.id === undefined ? {} : { id: identity.id }

export const identifier = (input: CompleteIdentifierInput): Identifier => ({
  system: input.system,
  value: input.value,
  ...(input.role === undefined ?
    {}
  : {
      type: concept(SYSTEMS.groveIdentifierRole, input.role),
    }),
})

/**
 * Emits the caller-governed, source-native traceability Identifier verbatim.
 * It deliberately has no Grove graph-role coding and never participates in identity.
 */
export const governedSourceIdentifier = (
  input: GovernedSourceIdentifierInput,
): Identifier => ({
  system: input.system,
  value: input.nativeId,
  ...(input.type === undefined ?
    {}
  : {
      type: {
        ...(input.type.coding === undefined ?
          {}
        : {
            coding: input.type.coding.map(({ system, code, display }) => ({
              system,
              code,
              ...(display === undefined ? {} : { display }),
            })),
          }),
        ...(input.type.text === undefined ? {} : { text: input.type.text }),
      },
    }),
})

export const coding = (
  system: string,
  code: string,
  display?: string,
): Coding => ({
  system,
  code,
  ...(display === undefined ? {} : { display }),
})

export const concept = (
  system: string,
  code: string,
  display?: string,
): CodeableConcept => ({
  coding: [coding(system, code, display)],
  ...(display === undefined ? {} : { text: display }),
})

export const makeApplicationDevice = (
  input: Omit<ApplicationDeviceInput, 'host' | 'id' | 'sourceDeviceToken'> & {
    readonly identity: IdentifiedEntryIdentityInput
    readonly parentReference?: string
  },
): Device => {
  const versions = [
    ...(input.version === undefined ?
      []
    : [
        {
          type: {
            coding: [
              coding(
                'urn:iso:std:iso:11073:10101',
                '531975',
                'Software revision',
              ),
            ],
          },
          value: input.version,
        },
      ]),
    ...(input.build === undefined ?
      []
    : [
        {
          type: {
            coding: [
              coding(
                'https://grovealliance.org/fhir/mobile/CodeSystem/grove-application-version-type',
                'build',
                'Application build',
              ),
            ],
          },
          value: input.build,
        },
      ]),
  ]
  return {
    resourceType: 'Device' as const,
    ...resourceId(input.identity),
    meta: { profile: [PROFILES.applicationDevice] },
    identifier: [identifier(input.identity.identifier)],
    status: 'active' as const,
    ...(input.manufacturer === undefined ?
      {}
    : { manufacturer: input.manufacturer }),
    deviceName: [{ name: input.name, type: 'user-friendly-name' as const }],
    ...(versions.length === 0 ? {} : { version: versions }),
    ...(input.parentReference === undefined ?
      {}
    : { parent: { reference: input.parentReference } }),
  }
}

export const makeHostDevice = (
  input: Omit<HostDeviceInput, 'id' | 'sourceDeviceToken'> & {
    readonly identity: IdentifiedEntryIdentityInput
  },
): Device => ({
  resourceType: 'Device' as const,
  ...resourceId(input.identity),
  meta: { profile: [PROFILES.hostDevice] },
  identifier: [identifier(input.identity.identifier)],
  status: 'active' as const,
  ...(input.name === undefined ?
    {}
  : {
      deviceName: [{ name: input.name, type: 'user-friendly-name' as const }],
    }),
  ...(input.manufacturer === undefined ?
    {}
  : { manufacturer: input.manufacturer }),
  ...(input.modelNumber === undefined ?
    {}
  : { modelNumber: input.modelNumber }),
  version: [
    {
      type: concept(
        'https://grovealliance.org/fhir/mobile/CodeSystem/grove-application-version-type',
        'os-version',
        'Operating system version',
      ),
      value: input.operatingSystemVersion,
    },
  ],
})

export const makeRecordingDevice = (
  input: Omit<
    RecordingDeviceInput,
    'id' | 'stableUnitToken' | 'subjectIdentifier'
  > & {
    readonly identity: IdentifiedEntryIdentityInput
    readonly stableIdentifier: CompleteIdentifierInput
  },
): Device => ({
  resourceType: 'Device' as const,
  ...resourceId(input.identity),
  meta: { profile: [PROFILES.recordingDevice] },
  identifier: [
    identifier(input.stableIdentifier),
    identifier(input.identity.identifier),
  ],
  status: 'active' as const,
  ...(input.name === undefined ?
    {}
  : {
      deviceName: [{ name: input.name, type: 'user-friendly-name' as const }],
    }),
  ...(input.manufacturer === undefined ?
    {}
  : { manufacturer: input.manufacturer }),
  ...(input.modelNumber === undefined ?
    {}
  : { modelNumber: input.modelNumber }),
})

export const identifiedEntry = (
  identity: IdentifiedEntryIdentityInput,
  resource: GraphResource,
): GraphEntry => ({
  fullUrl: identity.fullUrl,
  extension: [
    {
      url: EXTENSIONS.entryNodeKey,
      valueIdentifier: identifier(identity.identifier),
    },
  ],
  resource,
})

/**
 * Reuses one identical resource when it legitimately fills multiple graph roles.
 * A repeated fullUrl carrying conflicting resource facts remains an identity collision.
 */
export const deduplicateIdentifiedEntries = (
  entries: readonly GraphEntry[],
): Result<readonly GraphEntry[]> => {
  const byFullUrl = new Map<string, GraphEntry>()
  for (const entry of entries) {
    const existing = byFullUrl.get(entry.fullUrl)
    if (existing === undefined) {
      byFullUrl.set(entry.fullUrl, entry)
      continue
    }
    if (JSON.stringify(existing.resource) !== JSON.stringify(entry.resource)) {
      return err(
        'duplicate-identifier',
        'One Bundle fullUrl resolves to conflicting resource snapshots.',
      )
    }
  }
  return ok([...byFullUrl.values()])
}

export const provenanceActivity = (): CodeableConcept =>
  concept(
    SYSTEMS.isoLifecycle,
    'transform',
    'Transform/Translate Record Lifecycle Event',
  )

export const assemblerAgent = (reference: string): ProvenanceAgent => ({
  type: concept(SYSTEMS.provenanceParticipant, 'assembler', 'Assembler'),
  who: { reference },
})

export const sourceEntityAgent = (reference: string): ProvenanceAgent => ({
  type: concept(SYSTEMS.provenanceParticipant, 'enterer', 'Enterer'),
  who: { reference },
})
