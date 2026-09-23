//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { EXTENSIONS, PROFILES, SYSTEMS } from './profiles.js'
import type { Writer } from './types.js'
import { err, ok, type Result } from '../core/index.js'
import type {
  BusinessIdentifier,
  EntryIdentity,
  RoledIdentifier,
} from '../mobile/identity.js'
import type {
  ApplicationDevice,
  GovernedSourceIdentifierDisclosurePolicy,
  HostDevice,
  RecordingDevice,
  StudyEnrollment,
  Subject,
} from '../mobile/types.js'
import type {
  CodeableConcept,
  Coding,
  Device,
  ExchangeGraph,
  GraphResource,
  Identifier,
  PlanDefinition,
  Provenance,
  Reference,
  ResearchStudy,
  ResearchSubject,
} from '../r4/index.js'

type GraphEntry = ExchangeGraph['entry'][number]
type ProvenanceAgent = Provenance['agent'][number]

export const resourceId = (
  identity: EntryIdentity,
): { readonly id?: string } =>
  identity.id === undefined ? {} : { id: identity.id }

export const identifier = (
  input: BusinessIdentifier | RoledIdentifier,
): Identifier => ({
  system: input.system,
  value: input.value,
  ...('role' in input ?
    { type: concept(SYSTEMS.groveIdentifierRole, input.role) }
  : {}),
})

/**
 * Emits the caller-governed, source-native traceability Identifier verbatim.
 * It deliberately has no Grove graph-role coding and never participates in identity.
 */
export const governedSourceIdentifier = (
  policy: Extract<
    GovernedSourceIdentifierDisclosurePolicy,
    { kind: 'authorized' }
  >,
  nativeId: string,
): Identifier => ({
  system: policy.system,
  value: nativeId,
  ...(policy.type === undefined ?
    {}
  : {
      type: {
        ...(policy.type.coding === undefined ?
          {}
        : {
            coding: policy.type.coding.map(({ system, code, display }) => ({
              system,
              code,
              ...(display === undefined ? {} : { display }),
            })),
          }),
        ...(policy.type.text === undefined ? {} : { text: policy.type.text }),
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

/** The literal reference to a bundled Patient entry, or the identifier-only logical one. */
export const subjectReference = (
  subject: Subject,
  patient: EntryIdentity | undefined,
): Reference =>
  patient === undefined ?
    {
      type: 'Patient',
      identifier: {
        system: subject.identifier.system,
        value: subject.identifier.value,
      },
    }
  : { reference: patient.fullUrl }

export const makeApplicationDevice = (
  input: (ApplicationDevice | Writer) & {
    readonly identity: EntryIdentity
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
    deviceName: [{ name: input.name, type: 'user-friendly-name' as const }],
    ...(versions.length === 0 ? {} : { version: versions }),
    ...(input.parentReference === undefined ?
      {}
    : { parent: { reference: input.parentReference } }),
  }
}

export const makeHostDevice = (
  input: HostDevice & { readonly identity: EntryIdentity },
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
  input: RecordingDevice & {
    readonly identity: EntryIdentity
    readonly stableIdentifier: RoledIdentifier
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

/** The three entries one study enrollment adds, keyed by the catalog's node roles. */
export interface StudyEntries {
  readonly study: EntryIdentity
  readonly protocol: EntryIdentity
  readonly enrollment: EntryIdentity
}

export const makePlanDefinition = (
  enrollment: StudyEnrollment,
  identity: EntryIdentity,
): PlanDefinition => ({
  resourceType: 'PlanDefinition' as const,
  ...resourceId(identity),
  url: enrollment.protocolUrl,
  version: enrollment.protocolVersion,
  status: 'active' as const,
})

export const makeResearchStudy = (
  enrollment: StudyEnrollment,
  entries: StudyEntries,
): ResearchStudy => ({
  resourceType: 'ResearchStudy' as const,
  ...resourceId(entries.study),
  identifier: [identifier(enrollment.study)],
  status: 'active' as const,
  protocol: [{ reference: entries.protocol.fullUrl }],
})

export const makeResearchSubject = (
  enrollment: StudyEnrollment,
  entries: StudyEntries,
  individual: Reference,
): ResearchSubject => ({
  resourceType: 'ResearchSubject' as const,
  ...resourceId(entries.enrollment),
  identifier: [identifier(enrollment.enrollment)],
  status: 'on-study' as const,
  study: { reference: entries.study.fullUrl },
  individual,
})

export const researchStudyExtension = (
  entries: StudyEntries,
): { readonly url: string; readonly valueReference: Reference } => ({
  url: EXTENSIONS.researchStudy,
  valueReference: { reference: entries.study.fullUrl },
})

export const identifiedEntry = (
  identity: EntryIdentity,
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
