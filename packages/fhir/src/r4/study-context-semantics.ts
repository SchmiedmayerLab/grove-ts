//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import type { z } from 'zod'
import type { ValidatedEnvelope } from './exchange-envelope.js'
import { addIssue, asRecord, type UnknownRecord } from './graph-schema-utils.js'

interface IndexedResource {
  readonly index: number
  readonly fullUrl: string
  readonly resource: UnknownRecord
}

const resourcesOfType = (
  envelope: ValidatedEnvelope,
  resourceType: string,
): readonly IndexedResource[] =>
  envelope.entries.flatMap((entry, index) => {
    const resource = asRecord(entry.resource)
    return resource?.resourceType === resourceType ?
        [{ index, fullUrl: String(entry.fullUrl), resource }]
      : []
  })

const referenceTarget = (value: unknown): string | undefined => {
  const reference = asRecord(value)?.reference
  return typeof reference === 'string' ? reference : undefined
}

// A subject reference names the bundled Patient entry or carries a complete logical
// identifier; which participant it names is the receiver's authorization question.
const namesSubject = (
  value: unknown,
  patients: ReadonlySet<string>,
): boolean => {
  const reference = asRecord(value)
  if (reference === undefined) return false
  if (typeof reference.reference === 'string') {
    return patients.has(reference.reference)
  }
  const identifier = asRecord(reference.identifier)
  return (
    typeof identifier?.system === 'string' &&
    typeof identifier.value === 'string'
  )
}

const studyContextIssue = (
  context: z.core.$RefinementCtx,
  node: IndexedResource,
  element?: string,
): void => {
  addIssue(
    context,
    'mobile-support.study-context',
    [
      'entry',
      node.index,
      'resource',
      ...(element === undefined ? [] : [element]),
    ],
    element === undefined ?
      {}
    : { location: `${String(node.resource.resourceType)}.${element}` },
  )
}

const validateStudies = (
  studies: readonly IndexedResource[],
  protocols: ReadonlySet<string>,
  enrollments: readonly IndexedResource[],
  context: z.core.$RefinementCtx,
): ReadonlyMap<string, number> => {
  const protocolUse = new Map<string, number>()
  for (const study of studies) {
    const references =
      Array.isArray(study.resource.protocol) ?
        study.resource.protocol.map(referenceTarget)
      : []
    const [protocol] = references
    if (
      references.length !== 1 ||
      protocol === undefined ||
      !protocols.has(protocol)
    ) {
      studyContextIssue(context, study, 'protocol')
    } else {
      protocolUse.set(protocol, (protocolUse.get(protocol) ?? 0) + 1)
    }
    const linked = enrollments.filter(
      ({ resource }) => referenceTarget(resource.study) === study.fullUrl,
    )
    if (linked.length !== 1) studyContextIssue(context, study)
  }
  return protocolUse
}

const validateProtocols = (
  protocols: readonly IndexedResource[],
  protocolUse: ReadonlyMap<string, number>,
  context: z.core.$RefinementCtx,
): void => {
  for (const protocol of protocols) {
    for (const element of ['url', 'version']) {
      const value = protocol.resource[element]
      if (typeof value !== 'string' || value === '') {
        studyContextIssue(context, protocol, element)
      }
    }
    if ((protocolUse.get(protocol.fullUrl) ?? 0) !== 1) {
      studyContextIssue(context, protocol)
    }
  }
}

const validateEnrollments = (
  enrollments: readonly IndexedResource[],
  studies: ReadonlySet<string>,
  patients: ReadonlySet<string>,
  context: z.core.$RefinementCtx,
): void => {
  for (const enrollment of enrollments) {
    const study = referenceTarget(enrollment.resource.study)
    if (study === undefined || !studies.has(study)) {
      studyContextIssue(context, enrollment, 'study')
    }
    if (!namesSubject(enrollment.resource.individual, patients)) {
      studyContextIssue(context, enrollment, 'individual')
    }
  }
}

/**
 * Holds a bundled study context to the registry rule: one ResearchStudy, its exact-revision
 * PlanDefinition with canonical url and version, and one ResearchSubject linking a subject
 * to that study. The entry-node role of each is checked with the entry keys; whether the
 * enrolled participant is the graph's subject stays a receiver decision.
 */
export const validateStudyContext = (
  envelope: ValidatedEnvelope,
  context: z.core.$RefinementCtx,
): void => {
  const studies = resourcesOfType(envelope, 'ResearchStudy')
  const protocols = resourcesOfType(envelope, 'PlanDefinition')
  const enrollments = resourcesOfType(envelope, 'ResearchSubject')
  if (studies.length + protocols.length + enrollments.length === 0) return
  const protocolUse = validateStudies(
    studies,
    new Set(protocols.map(({ fullUrl }) => fullUrl)),
    enrollments,
    context,
  )
  validateProtocols(protocols, protocolUse, context)
  validateEnrollments(
    enrollments,
    new Set(studies.map(({ fullUrl }) => fullUrl)),
    new Set(resourcesOfType(envelope, 'Patient').map(({ fullUrl }) => fullUrl)),
    context,
  )
}
