//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  asRecord,
  completeIdentifier,
  groveIdentifierRoles,
  identifierRole,
  identifiersOf,
  type UnknownRecord,
} from './graph-schema-utils.js'
import { parseExchangeGraph } from './parse.js'
import type { ExchangeGraph } from './types.js'
import { groveExchangeProtocol } from '../contract/measurement-catalog.generated.js'
import {
  err,
  ok,
  parseAbsoluteUri,
  type AbsoluteUri,
  type Result,
} from '../core/index.js'
import {
  isGroveIdentifierRole,
  type BusinessIdentifier,
  type RoledIdentifier,
} from '../mobile/identity.js'

type TargetRoles = typeof groveExchangeProtocol.lifecycle.retraction.targetRoles

/** Closed target roles of the retraction lifecycle. */
export type RetractionTargetRole = keyof TargetRoles

export type RetractionTargetResourceType<Role extends RetractionTargetRole> =
  TargetRoles[Role]['resourceTypes'][number]

/**
 * One prior graph node a retraction names by its typed logical identifier.
 *
 * `nativeIdentifier` is the adapter's own record key, disclosed under the same policy as
 * a governed source identifier; it never addresses the target.
 */
export type RetractionTarget = {
  readonly [Role in RetractionTargetRole]: {
    readonly role: Role
    readonly resourceType: RetractionTargetResourceType<Role>
    readonly identifier: RoledIdentifier
    readonly nativeIdentifier?: BusinessIdentifier | undefined
  }
}[RetractionTargetRole]

const TARGET_ROLES = groveExchangeProtocol.lifecycle.retraction.targetRoles

const memberReferences = (resources: readonly unknown[]): ReadonlySet<string> =>
  new Set(
    resources.flatMap((resource) => {
      const record = asRecord(resource)
      const members =
        (
          record?.resourceType === 'Observation' &&
          Array.isArray(record.hasMember)
        ) ?
          record.hasMember
        : []
      return members.flatMap((member) => {
        const reference = asRecord(member)?.reference
        return typeof reference === 'string' ? [reference] : []
      })
    }),
  )

const roledIdentifier = (
  resource: unknown,
  role: string,
): RoledIdentifier | undefined => {
  const candidate = identifiersOf(resource).find(
    (identifier) => identifierRole(identifier) === role,
  )
  return completeIdentifier(candidate) && isGroveIdentifierRole(role) ?
      { system: candidate.system as AbsoluteUri, value: candidate.value, role }
    : undefined
}

// The one clear identifier a governed disclosure placed on the primary output.
const governedIdentifier = (
  resource: unknown,
): BusinessIdentifier | undefined => {
  const candidates = identifiersOf(resource).filter(
    (identifier) =>
      completeIdentifier(identifier) &&
      groveIdentifierRoles(identifier).length === 0 &&
      parseAbsoluteUri(identifier.system).ok,
  )
  const candidate = candidates[0]
  return candidates.length === 1 && completeIdentifier(candidate) ?
      { system: candidate.system as AbsoluteUri, value: candidate.value }
    : undefined
}

const targetRoleFor = (
  resource: UnknownRecord,
  fullUrl: string,
  members: ReadonlySet<string>,
): RetractionTargetRole | undefined => {
  const resourceType = String(resource.resourceType)
  if (resourceType === 'Device') return 'device-snapshot'
  if (resourceType === 'DocumentReference') return 'source-artifact'
  if (resourceType === 'Specimen') return 'specimen'
  if (resourceType === 'Observation' && members.has(fullUrl))
    return 'child-output'
  return (
      (
        TARGET_ROLES['primary-output'].resourceTypes as readonly string[]
      ).includes(resourceType)
    ) ?
      'primary-output'
    : undefined
}

const targetOf = (
  entry: ExchangeGraph['entry'][number],
  members: ReadonlySet<string>,
): RetractionTarget | undefined => {
  const resource = asRecord(entry.resource)
  if (resource === undefined) return undefined
  const role = targetRoleFor(resource, entry.fullUrl, members)
  if (role === undefined) return undefined
  const rule = TARGET_ROLES[role]
  const identifier = roledIdentifier(resource, rule.identifierRole)
  const resourceType = String(resource.resourceType)
  if (
    identifier === undefined ||
    !(rule.resourceTypes as readonly string[]).includes(resourceType)
  ) {
    return undefined
  }
  const nativeIdentifier =
    role === 'primary-output' ? governedIdentifier(resource) : undefined
  return {
    role,
    resourceType,
    identifier,
    ...(nativeIdentifier === undefined ? {} : { nativeIdentifier }),
  } as RetractionTarget
}

/**
 * Derives every node of an accepted graph a retraction of its source record must name.
 *
 * An Observation another Observation lists in `hasMember` is a child output; every other
 * output is primary. A governed source identifier on the primary output travels along as
 * the target's native identifier.
 */
export const retractionTargets = (
  graph: ExchangeGraph,
): Result<readonly [RetractionTarget, ...RetractionTarget[]]> => {
  const parsed = parseExchangeGraph(graph)
  if (!parsed.ok) return parsed
  const members = memberReferences(
    parsed.value.entry.map(({ resource }) => resource),
  )
  const targets = parsed.value.entry.flatMap((entry) => {
    const target = targetOf(entry, members)
    return target === undefined ? [] : [target]
  })
  const [first, ...rest] = targets
  return first === undefined ?
      err('missing-required', 'The graph names no retractable node.')
    : ok([first, ...rest])
}
