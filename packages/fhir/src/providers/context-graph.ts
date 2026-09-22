//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  assemblerAgent,
  identifiedEntry,
  identifier,
  makeApplicationDevice,
  makeHostDevice,
  makePlanDefinition,
  makeResearchStudy,
  makeResearchSubject,
  provenanceActivity,
  researchStudyExtension,
  resourceId,
  sourceEntityAgent,
  subjectReference,
  type StudyEntries,
} from './graph.js'
import {
  deriveApplicationEntryIdentity,
  deriveEntryNodeEntryIdentity,
  deriveHostEntryIdentity,
} from './identity.js'
import {
  err,
  issues,
  ok,
  zodIssuePath,
  type FhirInstant,
  type Issue,
  type Result,
} from '../core/index.js'
import { compareFhirDateTimes } from '../core/primitives.js'
import { parseExchangeEventContext } from '../mobile/context.js'
import type {
  EntryIdentity,
  ExchangeEventIdentifier,
  RoledIdentifier,
} from '../mobile/identity.js'
import type {
  ApplicationDevice,
  ExchangeEventContext,
  InstantEffectiveTime,
  PeriodEffectiveTime,
  ResolvedExchangeEventContext,
} from '../mobile/types.js'
import type {
  ExchangeGraph,
  Extension,
  Provenance,
  Reference,
} from '../r4/index.js'
import { patientSchema } from '../zod/r4/index.js'

type GraphEntry = ExchangeGraph['entry'][number]

/** The context-owned part of one graph: subject, studies and the converter's Device snapshots. */
export interface ContextGraph {
  readonly context: ResolvedExchangeEventContext
  readonly subject: Reference
  readonly studies: readonly StudyEntries[]
  readonly researchStudyExtensions: readonly Extension[]
  readonly application: EntryIdentity
  readonly host: EntryIdentity
  readonly writer: EntryIdentity
  readonly gatewayApplication: EntryIdentity | undefined
  readonly gatewayReference: string | undefined
  /** The bundled Patient, first in Bundle order. */
  readonly leadingEntries: readonly GraphEntry[]
  /** Studies, writer, gateway, host and application, after the outputs. */
  readonly supportingEntries: readonly GraphEntry[]
}

const bundledPatientIssues = (
  context: ExchangeEventContext,
): readonly Issue[] => {
  if (context.subject.kind !== 'bundled') return []
  const parsed = patientSchema.safeParse(context.subject.patient)
  return parsed.success ?
      []
    : parsed.error.issues.map((issue) => ({
        severity: 'error' as const,
        code: 'schema-invalid' as const,
        path: ['subject', 'patient', ...zodIssuePath(issue)],
        message: issue.message,
      }))
}

const studyEntries = (
  context: ExchangeEventContext,
  event: ExchangeEventIdentifier,
): Result<readonly StudyEntries[]> => {
  const entries: StudyEntries[] = []
  for (const [index] of (context.studies ?? []).entries()) {
    const study = deriveEntryNodeEntryIdentity(
      context.identityScope,
      event,
      'research-study',
      index,
    )
    if (!study.ok) return study
    const protocol = deriveEntryNodeEntryIdentity(
      context.identityScope,
      event,
      'plan-definition',
      index,
    )
    if (!protocol.ok) return protocol
    const enrollment = deriveEntryNodeEntryIdentity(
      context.identityScope,
      event,
      'research-subject',
      index,
    )
    if (!enrollment.ok) return enrollment
    entries.push({
      study: study.value,
      protocol: protocol.value,
      enrollment: enrollment.value,
    })
  }
  return ok(entries)
}

const sameApplication = (
  left: ApplicationDevice,
  right: ApplicationDevice,
): boolean =>
  left.sourceDeviceToken === right.sourceDeviceToken &&
  left.name === right.name &&
  left.version === right.version &&
  left.build === right.build

// The writer may be the converter itself; the same token then names one snapshot,
// and differing facts under one token are a collision, not a second Device.
const writerEntries = (
  writer: ApplicationDevice,
  author: EntryIdentity,
  converters: ReadonlyArray<readonly [ApplicationDevice, EntryIdentity]>,
): Result<readonly GraphEntry[]> => {
  const shared = converters.find(
    ([, identity]) => identity.fullUrl === author.fullUrl,
  )
  if (shared === undefined) {
    return ok([
      identifiedEntry(
        author,
        makeApplicationDevice({ ...writer, identity: author }),
      ),
    ])
  }
  return sameApplication(shared[0], writer) ?
      ok([])
    : err(
        'duplicate-identifier',
        'The writer reuses a converter device token with different facts.',
        ['source', 'writer'],
      )
}

const gatewayIdentity = (
  context: ExchangeEventContext,
  application: EntryIdentity,
): Result<{
  readonly gatewayApplication: EntryIdentity | undefined
  readonly gatewayReference: string | undefined
}> => {
  const role = context.converterRole ?? { kind: 'assembler' }
  if (role.kind === 'assembler') {
    return ok({ gatewayApplication: undefined, gatewayReference: undefined })
  }
  if (role.kind === 'gateway') {
    return ok({
      gatewayApplication: undefined,
      gatewayReference: application.fullUrl,
    })
  }
  const distinct = deriveApplicationEntryIdentity(
    context.identityScope,
    context.event,
    role.application,
  )
  if (!distinct.ok) return distinct
  return ok({
    gatewayApplication: distinct.value,
    gatewayReference: distinct.value.fullUrl,
  })
}

/**
 * Validates the context and derives everything the graph takes from it.
 *
 * `admitsStudies` is false for a graph whose output cannot carry the research-study
 * extension; such a context must not name studies, because dropping them would silently
 * lose the attribution the deployment asked for.
 */
export const resolveContextGraph = (
  context: ExchangeEventContext,
  writer: ApplicationDevice,
  admitsStudies: boolean,
): Result<ContextGraph> => {
  const parsed = parseExchangeEventContext(context)
  if (!parsed.ok) return parsed
  const validated = parsed.value
  const findings = [...bundledPatientIssues(validated)]
  if (!admitsStudies && validated.studies.length > 0) {
    findings.push({
      severity: 'error',
      code: 'value-mismatch',
      path: ['studies'],
      message:
        'This graph has no output that carries the research-study extension, so its context names no studies.',
    })
  }
  if (findings.length > 0) return issues(findings)

  const { identityScope: scope, event, repositoryIds = {} } = validated
  const patient =
    validated.subject.kind === 'bundled' ?
      deriveEntryNodeEntryIdentity(scope, event, 'patient', 0)
    : ok(undefined)
  if (!patient.ok) return patient
  const studies = studyEntries(validated, event)
  if (!studies.ok) return studies
  const application = deriveApplicationEntryIdentity(
    scope,
    event,
    validated.application,
    repositoryIds['application-device'],
  )
  if (!application.ok) return application
  const host = deriveHostEntryIdentity(
    scope,
    event,
    validated.host,
    repositoryIds['host-device'],
  )
  if (!host.ok) return host
  const author = deriveApplicationEntryIdentity(
    scope,
    event,
    writer,
    repositoryIds.writer,
  )
  if (!author.ok) return author
  const gateway = gatewayIdentity(validated, application.value)
  if (!gateway.ok) return gateway

  const subject = subjectReference(validated.subject, patient.value)
  const gatewayRole = validated.converterRole
  const authorEntries = writerEntries(writer, author.value, [
    [validated.application, application.value],
    ...((
      gatewayRole.kind === 'gateway-application' &&
      gateway.value.gatewayApplication !== undefined
    ) ?
      [[gatewayRole.application, gateway.value.gatewayApplication] as const]
    : []),
  ])
  if (!authorEntries.ok) return authorEntries
  const supportingEntries: GraphEntry[] = [
    ...validated.studies.flatMap((enrollment, index) => {
      const entries = studies.value[index]
      if (entries === undefined) return []
      return [
        identifiedEntry(entries.study, makeResearchStudy(enrollment, entries)),
        identifiedEntry(
          entries.protocol,
          makePlanDefinition(enrollment, entries.protocol),
        ),
        identifiedEntry(
          entries.enrollment,
          makeResearchSubject(enrollment, entries, subject),
        ),
      ]
    }),
    ...authorEntries.value,
    ...((
      gatewayRole.kind === 'gateway-application' &&
      gateway.value.gatewayApplication !== undefined
    ) ?
      [
        identifiedEntry(
          gateway.value.gatewayApplication,
          makeApplicationDevice({
            ...gatewayRole.application,
            identity: gateway.value.gatewayApplication,
          }),
        ),
      ]
    : []),
    identifiedEntry(
      host.value,
      makeHostDevice({ ...validated.host, identity: host.value }),
    ),
    identifiedEntry(
      application.value,
      makeApplicationDevice({
        ...validated.application,
        identity: application.value,
        parentReference: host.value.fullUrl,
      }),
    ),
  ]
  return ok({
    context: validated,
    subject,
    studies: studies.value,
    researchStudyExtensions: studies.value.map(researchStudyExtension),
    application: application.value,
    host: host.value,
    writer: author.value,
    gatewayApplication: gateway.value.gatewayApplication,
    gatewayReference: gateway.value.gatewayReference,
    leadingEntries:
      validated.subject.kind === 'bundled' && patient.value !== undefined ?
        [identifiedEntry(patient.value, validated.subject.patient)]
      : [],
    supportingEntries,
  })
}

type EffectiveTime = InstantEffectiveTime | PeriodEffectiveTime

const boundsOf = (
  effective: EffectiveTime,
): readonly [FhirInstant, FhirInstant] =>
  effective.kind === 'date-time' ?
    [effective.value, effective.value]
  : [effective.start, effective.end]

const earlier = (left: FhirInstant, right: FhirInstant): FhirInstant =>
  compareFhirDateTimes(left, right) === 1 ? right : left
const later = (left: FhirInstant, right: FhirInstant): FhirInstant =>
  compareFhirDateTimes(left, right) === -1 ? right : left

/** Provenance.occurred[x] as the span of the source activity the outputs describe. */
export const occurredFor = (
  effectives: readonly [EffectiveTime, ...EffectiveTime[]],
): Pick<Provenance, 'occurredDateTime' | 'occurredPeriod'> => {
  const [first, ...rest] = effectives
  if (rest.length === 0 && first.kind === 'date-time') {
    return { occurredDateTime: first.value }
  }
  const [start, end] = rest
    .map(boundsOf)
    .reduce<readonly [FhirInstant, FhirInstant]>(
      ([earliest, latest], [nextStart, nextEnd]) => [
        earlier(earliest, nextStart),
        later(latest, nextEnd),
      ],
      boundsOf(first),
    )
  return start === end ?
      { occurredDateTime: start }
    : { occurredPeriod: { start, end } }
}

export interface ConversionProvenanceInput {
  readonly identity: EntryIdentity
  readonly profile: string
  readonly targets: readonly string[]
  readonly occurred: Pick<Provenance, 'occurredDateTime' | 'occurredPeriod'>
  readonly recorded: FhirInstant
  readonly sourceRecord: RoledIdentifier
  readonly graph: ContextGraph
}

export const makeConversionProvenance = (
  input: ConversionProvenanceInput,
): Provenance => ({
  resourceType: 'Provenance' as const,
  ...resourceId(input.identity),
  meta: { profile: [input.profile] },
  target: input.targets.map((reference) => ({ reference })),
  ...input.occurred,
  recorded: input.recorded,
  activity: provenanceActivity(),
  agent: [assemblerAgent(input.graph.application.fullUrl)],
  entity: [
    {
      role: 'source' as const,
      what: { identifier: identifier(input.sourceRecord) },
      agent: [sourceEntityAgent(input.graph.writer.fullUrl)],
    },
  ],
})

export const contextFault = (
  path: ReadonlyArray<string | number>,
  message: string,
): Result<never> => err('value-mismatch', message, path)
