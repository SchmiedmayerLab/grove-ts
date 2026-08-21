//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { EXTENSIONS, PROFILES, SYSTEMS } from './profiles.js'
import type {
  ApplicationDeviceInput,
  CompleteIdentifierInput,
  IdentifiedEntryIdentityInput,
  RecordingDeviceInput,
  ResourceIdentityInput,
} from '../mobile/types.js'
import type {
  CodeableConcept,
  Coding,
  CollectionBundle,
  Device,
  GraphResource,
  Identifier,
  Provenance,
} from '../r4/index.js'

type GraphEntry = CollectionBundle['entry'][number]
type ProvenanceAgent = Provenance['agent'][number]

export const resourceId = (
  identity: ResourceIdentityInput,
): { readonly id?: string } =>
  identity.id === undefined ? {} : { id: identity.id }

export const identifier = (input: CompleteIdentifierInput): Identifier => ({
  system: input.system,
  value: input.value,
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
  input: ApplicationDeviceInput,
): Device => ({
  resourceType: 'Device' as const,
  ...resourceId(input.identity),
  meta: { profile: [PROFILES.applicationDevice] },
  identifier: [identifier(input.identity.identifier)],
  status: 'active' as const,
  ...(input.manufacturer === undefined ?
    {}
  : { manufacturer: input.manufacturer }),
  deviceName: [{ name: input.name, type: 'user-friendly-name' as const }],
  ...(input.version === undefined ?
    {}
  : {
      version: [
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
      ],
    }),
})

export const makeRecordingDevice = (input: RecordingDeviceInput): Device => ({
  resourceType: 'Device' as const,
  ...resourceId(input.identity),
  meta: { profile: [PROFILES.recordingDevice] },
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
})

export const identifiedEntry = (
  identity: IdentifiedEntryIdentityInput,
  resource: GraphResource,
): GraphEntry => ({
  fullUrl: identity.fullUrl,
  extension: [
    {
      url: EXTENSIONS.exchangeEntryIdentifier,
      valueIdentifier: identifier(identity.identifier),
    },
  ],
  resource,
})

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
