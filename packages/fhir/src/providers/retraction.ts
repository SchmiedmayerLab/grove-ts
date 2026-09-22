//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  concept,
  deduplicateIdentifiedEntries,
  identifiedEntry,
  identifier,
  makeApplicationDevice,
  makeHostDevice,
  resourceId,
} from './graph.js'
import {
  deriveApplicationEntryIdentity,
  deriveEntryNodeEntryIdentity,
  deriveHostEntryIdentity,
} from './identity.js'
import { EXTENSIONS, PROFILES, SYSTEMS } from './profiles.js'
import { groveExchangeProtocol } from '../contract/measurement-catalog.generated.js'
import {
  issues,
  parseAbsoluteUri,
  parseFhirInstant,
  type FhirInstant,
  type Issue,
  type Result,
  type SchemaIssueCode,
} from '../core/index.js'
import { parseExchangeEventContext } from '../mobile/context.js'
import {
  containsIsolatedSurrogate,
  isOpaqueIdentityValue,
  type BusinessIdentifier,
  type OpaqueIdentityScope,
  type RoledIdentifier,
} from '../mobile/identity.js'
import type { ExchangeEventContext } from '../mobile/types.js'
import {
  parseRetractionEvent,
  type Identifier,
  type RetractionEvent,
  type RetractionTarget,
  type RetractionTargetRole,
} from '../r4/index.js'

const TARGET_ROLES = groveExchangeProtocol.lifecycle.retraction.targetRoles
type Path = ReadonlyArray<string | number>

const fault = (code: SchemaIssueCode, path: Path, message: string): Issue => ({
  severity: 'error',
  code,
  path,
  message,
})

const isNonBlank = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.trim() !== '' &&
  !containsIsolatedSurrogate(value)

// The systems this scope mints for one identifier role, across the kinds that carry it.
const systemsForRole = (
  scope: OpaqueIdentityScope,
  role: string,
): ReadonlySet<string> =>
  new Set(
    groveExchangeProtocol.opaqueIdentity.identityKinds
      .filter(({ identifierRole }) => identifierRole === role)
      .map(({ kind }) => scope.systems.opaque[kind]),
  )

const groveSystems = (scope: OpaqueIdentityScope): ReadonlySet<string> =>
  new Set([
    SYSTEMS.groveIdentifierRole,
    scope.systems.event,
    scope.systems.entryNode,
    ...Object.values(scope.systems.opaque),
  ])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const opaqueIdentifierIssues = (
  value: unknown,
  role: string,
  scope: OpaqueIdentityScope,
  path: Path,
): readonly Issue[] => {
  if (
    !isRecord(value) ||
    value.role !== role ||
    typeof value.system !== 'string' ||
    !systemsForRole(scope, role).has(value.system) ||
    !isOpaqueIdentityValue(value.value)
  ) {
    return [
      fault(
        'invalid-identifier',
        path,
        `Expected the exact ${role} identity this scope minted for the retracted node.`,
      ),
    ]
  }
  return []
}

const nativeIdentifierIssues = (
  value: unknown,
  scope: OpaqueIdentityScope,
  path: Path,
): readonly Issue[] => {
  if (value === undefined) return []
  const candidate = value as Partial<BusinessIdentifier>
  if (
    typeof candidate !== 'object' ||
    !parseAbsoluteUri(candidate.system).ok ||
    !isNonBlank(candidate.value) ||
    Object.keys(candidate).length !== 2
  ) {
    return [
      fault(
        'invalid-identifier',
        path,
        'A native record identifier is one complete absolute-system Identifier.',
      ),
    ]
  }
  if (groveSystems(scope).has(candidate.system ?? '')) {
    return [
      fault(
        'value-mismatch',
        [...path, 'system'],
        'A native record identifier lives in the adapter’s own key space, never a Grove one.',
      ),
    ]
  }
  return []
}

const targetIssues = (
  target: unknown,
  scope: OpaqueIdentityScope,
  path: Path,
): readonly Issue[] => {
  const candidate = isRecord(target) ? target : undefined
  const role = candidate?.role
  if (
    candidate === undefined ||
    typeof role !== 'string' ||
    !Object.hasOwn(TARGET_ROLES, role)
  ) {
    return [
      fault(
        'invalid-code',
        [...path, 'role'],
        'Expected a closed retraction target role.',
      ),
    ]
  }
  const rule = TARGET_ROLES[role as RetractionTargetRole]
  const findings: Issue[] = []
  if (
    !(rule.resourceTypes as readonly string[]).includes(
      String(candidate.resourceType),
    )
  ) {
    findings.push(
      fault(
        'invalid-code',
        [...path, 'resourceType'],
        `${role} targets declare one of ${rule.resourceTypes.join(', ')}.`,
      ),
    )
  }
  findings.push(
    ...opaqueIdentifierIssues(
      candidate.identifier,
      rule.identifierRole,
      scope,
      [...path, 'identifier'],
    ),
    ...nativeIdentifierIssues(candidate.nativeIdentifier, scope, [
      ...path,
      'nativeIdentifier',
    ]),
  )
  const keys = Object.keys(candidate).filter(
    (key) =>
      !['role', 'resourceType', 'identifier', 'nativeIdentifier'].includes(key),
  )
  if (keys.length > 0) {
    findings.push(
      fault(
        'schema-invalid',
        [...path, keys[0] ?? ''],
        'Unknown target field.',
      ),
    )
  }
  return findings
}

const pairKey = (identifier: BusinessIdentifier): string =>
  `${identifier.system.length}:${identifier.system}${identifier.value.length}:${identifier.value}`

const targetsIssues = (
  targets: unknown,
  scope: OpaqueIdentityScope,
): readonly Issue[] => {
  if (!Array.isArray(targets) || targets.length === 0) {
    return [
      fault(
        'missing-required',
        ['targets'],
        'A retraction names at least one target.',
      ),
    ]
  }
  const findings = targets.flatMap((target, index) =>
    targetIssues(target, scope, ['targets', index]),
  )
  const pairs = new Set<string>()
  for (const [index, target] of (
    targets as readonly RetractionTarget[]
  ).entries()) {
    const identity = target.identifier as BusinessIdentifier | undefined
    if (findings.length > 0 || identity === undefined) continue
    const key = pairKey(identity)
    if (pairs.has(key)) {
      findings.push(
        fault(
          'duplicate-identifier',
          ['targets', index],
          'Retraction targets must be unique.',
        ),
      )
    }
    pairs.add(key)
  }
  return findings
}

interface TargetReference {
  readonly extension: readonly [
    { readonly url: string; readonly valueCode: RetractionTargetRole },
    ...Array<{ readonly url: string; readonly valueIdentifier: Identifier }>,
  ]
  readonly identifier: Identifier
  readonly type: string
}

const compareText = (left: string, right: string): number => {
  if (left === right) return 0
  return left < right ? -1 : 1
}

const compareTargetReferences = (
  left: TargetReference,
  right: TargetReference,
): number =>
  compareText(left.extension[0].valueCode, right.extension[0].valueCode) ||
  compareText(left.type, right.type) ||
  compareText(left.identifier.system ?? '', right.identifier.system ?? '') ||
  compareText(left.identifier.value ?? '', right.identifier.value ?? '') ||
  compareText(
    left.extension[1]?.valueIdentifier.system ?? '',
    right.extension[1]?.valueIdentifier.system ?? '',
  ) ||
  compareText(
    left.extension[1]?.valueIdentifier.value ?? '',
    right.extension[1]?.valueIdentifier.value ?? '',
  )

const targetReference = (target: RetractionTarget): TargetReference => ({
  extension:
    target.nativeIdentifier === undefined ?
      [{ url: EXTENSIONS.retractionTargetRole, valueCode: target.role }]
    : [
        { url: EXTENSIONS.retractionTargetRole, valueCode: target.role },
        {
          url: EXTENSIONS.retractionTargetNativeIdentifier,
          valueIdentifier: identifier(target.nativeIdentifier),
        },
      ],
  type: target.resourceType,
  identifier: identifier(target.identifier),
})

/**
 * Builds one append-only retraction event naming prior graph nodes by typed logical identity.
 *
 * It never copies, mutates, tombstones, or marks prior clinical resources entered-in-error;
 * receiver lifecycle policy remains separate. `retractedAt` is Provenance.occurred[x]; the
 * conversion instant is its recorded time and the Bundle timestamp.
 */
export const buildProviderRetractionEvent = (
  targets: readonly [RetractionTarget, ...RetractionTarget[]],
  context: ExchangeEventContext,
  sourceRecord: RoledIdentifier,
  retractedAt: FhirInstant,
): Result<RetractionEvent> => {
  const parsedContext = parseExchangeEventContext(context)
  if (!parsedContext.ok) return parsedContext
  const validated = parsedContext.value
  const { identityScope: scope, event, repositoryIds = {} } = validated
  const findings = [
    ...targetsIssues(targets, scope),
    ...opaqueIdentifierIssues(sourceRecord, 'source-record', scope, [
      'sourceRecord',
    ]),
    ...(parseFhirInstant(retractedAt).ok ?
      []
    : [
        fault(
          'invalid-date-time',
          ['retractedAt'],
          'Expected an RFC 3339 instant with seconds and an explicit UTC offset.',
        ),
      ]),
    ...(validated.studies.length > 0 ?
      [
        fault(
          'value-mismatch',
          ['studies'],
          'A retraction event carries no outputs, so its context names no studies.',
        ),
      ]
    : []),
  ]
  if (findings.length > 0) return issues(findings)

  const provenanceIdentity = deriveEntryNodeEntryIdentity(
    scope,
    event,
    'retraction-provenance',
    0,
    repositoryIds.provenance,
  )
  if (!provenanceIdentity.ok) return provenanceIdentity
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

  const provenance = {
    resourceType: 'Provenance' as const,
    ...resourceId(provenanceIdentity.value),
    meta: { profile: [PROFILES.retractionProvenance] },
    target: [...targets].map(targetReference).sort(compareTargetReferences),
    occurredDateTime: retractedAt,
    recorded: validated.conversionInstant,
    activity: concept(
      SYSTEMS.groveLifecycleEvent,
      groveExchangeProtocol.lifecycle.retraction.activityCode,
      'Source record retracted',
    ),
    agent: [
      {
        type: concept(SYSTEMS.provenanceParticipant, 'assembler', 'Assembler'),
        who: { reference: application.value.fullUrl },
      },
    ],
    entity: [
      {
        role: 'source' as const,
        what: { identifier: identifier(sourceRecord) },
      },
    ],
  }
  const entries = deduplicateIdentifiedEntries([
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
    identifiedEntry(provenanceIdentity.value, provenance),
  ])
  if (!entries.ok) return entries
  return parseRetractionEvent({
    resourceType: 'Bundle' as const,
    ...(repositoryIds.bundle === undefined ? {} : { id: repositoryIds.bundle }),
    meta: { profile: [PROFILES.retractionBundle] },
    identifier: identifier(event),
    type: 'collection' as const,
    timestamp: validated.conversionInstant,
    entry: entries.value,
  })
}
