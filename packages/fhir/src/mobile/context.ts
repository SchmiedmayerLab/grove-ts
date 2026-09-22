//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  containsIsolatedSurrogate,
  isEventOfScope,
  isOpaqueIdentityScope,
  type BusinessIdentifier,
  type ExchangeEventIdentifier,
  type OpaqueIdentityScope,
} from './identity.js'
import type {
  ApplicationDevice,
  ConverterRole,
  ResolvedExchangeEventContext,
  ExchangeGraphNode,
  HostDevice,
  StudyEnrollment,
  Subject,
} from './types.js'
import {
  cloneJsonValue,
  deepFreeze,
  issues,
  ok,
  parseAbsoluteUri,
  parseFhirId,
  parseFhirInstant,
  type FhirId,
  type FhirInstant,
  type Issue,
  type JsonValue,
  type Result,
  type SchemaIssueCode,
} from '../core/index.js'
import type { Patient } from '../r4/types.js'

type Path = ReadonlyArray<string | number>
type UnknownRecord = Readonly<Record<string, unknown>>

const EXCHANGE_GRAPH_NODES: ReadonlySet<string> = new Set<ExchangeGraphNode>([
  'bundle',
  'primary-output',
  'source-artifact',
  'recording-device',
  'application-device',
  'host-device',
  'writer',
  'provenance',
])

const fault = (code: SchemaIssueCode, path: Path, message: string): Issue => ({
  severity: 'error',
  code,
  path,
  message,
})

const asRecord = (value: unknown): UnknownRecord | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ?
    (value as UnknownRecord)
  : undefined

const isNonBlank = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.trim() !== '' &&
  !containsIsolatedSurrogate(value)

// An optional field set to undefined is absent; every other key must be declared.
const shapeIssues = (
  record: UnknownRecord,
  required: readonly string[],
  optional: readonly string[],
  path: Path,
): readonly Issue[] => [
  ...Object.keys(record)
    .filter(
      (key) =>
        record[key] !== undefined &&
        !required.includes(key) &&
        !optional.includes(key),
    )
    .map((key) =>
      fault('schema-invalid', [...path, key], 'Unknown context field.'),
    ),
  ...required
    .filter((key) => record[key] === undefined)
    .map((key) =>
      fault('missing-required', [...path, key], 'Required context field.'),
    ),
]

const identifierIssues = (value: unknown, path: Path): readonly Issue[] => {
  const record = asRecord(value)
  if (record === undefined) {
    return [
      fault('invalid-identifier', path, 'Expected a complete Identifier.'),
    ]
  }
  return [
    ...shapeIssues(record, ['system', 'value'], [], path),
    ...(parseAbsoluteUri(record.system).ok ?
      []
    : [
        fault(
          'invalid-uri',
          [...path, 'system'],
          'Identifier.system must be an absolute URI.',
        ),
      ]),
    ...((
      typeof record.value === 'string' &&
      record.value !== '' &&
      !containsIsolatedSurrogate(record.value)
    ) ?
      []
    : [
        fault(
          'invalid-identifier',
          [...path, 'value'],
          'Identifier.value must be a nonempty Unicode-scalar string.',
        ),
      ]),
  ]
}

const identifierOf = (value: unknown): BusinessIdentifier => {
  const record = asRecord(value) ?? {}
  return { system: record.system, value: record.value } as BusinessIdentifier
}

const patientCarriesIdentifier = (
  patient: JsonValue,
  identifier: BusinessIdentifier,
): boolean => {
  const identifiers = asRecord(patient)?.identifier
  return (
    Array.isArray(identifiers) &&
    identifiers.some((candidate) => {
      const record = asRecord(candidate)
      return (
        record?.system === identifier.system &&
        record.value === identifier.value
      )
    })
  )
}

const subjectIssues = (value: unknown, path: Path): readonly Issue[] => {
  const record = asRecord(value)
  if (
    record === undefined ||
    !['bundled', 'logical'].includes(String(record.kind))
  ) {
    return [fault('invalid-choice', path, 'A subject is logical or bundled.')]
  }
  const bundled = record.kind === 'bundled'
  const findings = [
    ...shapeIssues(
      record,
      bundled ? ['kind', 'identifier', 'patient'] : ['kind', 'identifier'],
      [],
      path,
    ),
    ...identifierIssues(record.identifier, [...path, 'identifier']),
  ]
  if (!bundled) return findings
  const patient = cloneJsonValue(record.patient)
  if (
    !patient.ok ||
    asRecord(patient.value)?.resourceType !== 'Patient' ||
    !patientCarriesIdentifier(patient.value, identifierOf(record.identifier))
  ) {
    findings.push(
      fault(
        'value-mismatch',
        [...path, 'patient'],
        'A bundled subject is a Patient resource carrying the subject identifier.',
      ),
    )
  }
  return findings
}

const deviceIssues = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  path: Path,
): readonly Issue[] => {
  const record = asRecord(value)
  if (record === undefined) {
    return [fault('invalid-type', path, 'Expected a device snapshot object.')]
  }
  return [
    ...shapeIssues(record, required, optional, path),
    ...[...required, ...optional]
      .filter((key) => record[key] !== undefined && !isNonBlank(record[key]))
      .map((key) =>
        fault(
          'invalid-identifier',
          [...path, key],
          'Expected a non-blank Unicode-scalar string.',
        ),
      ),
  ]
}

const applicationIssues = (value: unknown, path: Path): readonly Issue[] =>
  deviceIssues(value, ['sourceDeviceToken', 'name'], ['version', 'build'], path)

const hostIssues = (value: unknown, path: Path): readonly Issue[] =>
  deviceIssues(
    value,
    ['sourceDeviceToken', 'operatingSystemVersion'],
    ['name', 'manufacturer', 'modelNumber'],
    path,
  )

const converterRoleIssues = (value: unknown, path: Path): readonly Issue[] => {
  if (value === undefined) return []
  const record = asRecord(value)
  if (record?.kind === 'assembler' || record?.kind === 'gateway') {
    return shapeIssues(record, ['kind'], [], path)
  }
  if (record?.kind === 'gateway-application') {
    return [
      ...shapeIssues(record, ['kind', 'application'], [], path),
      ...applicationIssues(record.application, [...path, 'application']),
    ]
  }
  return [
    fault(
      'invalid-choice',
      path,
      'A converter role is assembler, gateway, or gateway-application.',
    ),
  ]
}

const pairKey = (identifier: BusinessIdentifier): string =>
  `${identifier.system.length}:${identifier.system}${identifier.value.length}:${identifier.value}`

const studyIssues = (value: unknown, path: Path): readonly Issue[] => {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    return [
      fault('invalid-type', path, 'Expected a list of study enrollments.'),
    ]
  }
  const findings: Issue[] = []
  const studies = new Set<string>()
  const enrollments = new Set<string>()
  for (const [index, entry] of value.entries()) {
    const record = asRecord(entry)
    const entryPath = [...path, index]
    if (record === undefined) {
      findings.push(
        fault('invalid-type', entryPath, 'Expected a study enrollment.'),
      )
      continue
    }
    findings.push(
      ...shapeIssues(
        record,
        ['study', 'protocol', 'enrollment'],
        [],
        entryPath,
      ),
      ...identifierIssues(record.study, [...entryPath, 'study']),
      ...identifierIssues(record.enrollment, [...entryPath, 'enrollment']),
    )
    const protocol = asRecord(record.protocol)
    if (
      protocol === undefined ||
      !parseAbsoluteUri(protocol.url).ok ||
      !isNonBlank(protocol.version)
    ) {
      findings.push(
        fault(
          'invalid-uri',
          [...entryPath, 'protocol'],
          'A protocol names its PlanDefinition by absolute url and non-blank version.',
        ),
      )
    } else {
      findings.push(
        ...shapeIssues(
          protocol,
          ['url', 'version'],
          [],
          [...entryPath, 'protocol'],
        ),
      )
    }
    for (const [field, seen] of [
      ['study', studies],
      ['enrollment', enrollments],
    ] as const) {
      const key = pairKey(identifierOf(record[field]))
      if (seen.has(key)) {
        findings.push(
          fault(
            'duplicate-identifier',
            [...entryPath, field],
            `Each ${field} identifier appears once.`,
          ),
        )
      }
      seen.add(key)
    }
  }
  return findings
}

const repositoryIdIssues = (value: unknown, path: Path): readonly Issue[] => {
  if (value === undefined) return []
  const record = asRecord(value)
  if (record === undefined) {
    return [
      fault(
        'invalid-type',
        path,
        'Expected repository ids keyed by graph node.',
      ),
    ]
  }
  return Object.entries(record).flatMap(([node, id]) => {
    if (id === undefined) return []
    if (!EXCHANGE_GRAPH_NODES.has(node)) {
      return [
        fault(
          'schema-invalid',
          [...path, node],
          'Unknown exchange graph node.',
        ),
      ]
    }
    return parseFhirId(id).ok ?
        []
      : [fault('invalid-identifier', [...path, node], 'Expected a FHIR id.')]
  })
}

const eventIssues = (
  value: unknown,
  scope: unknown,
  path: Path,
): readonly Issue[] =>
  isOpaqueIdentityScope(scope) && isEventOfScope(scope, value) ?
    shapeIssues(asRecord(value) ?? {}, ['system', 'value', 'role'], [], path)
  : [
      fault(
        'invalid-identifier',
        path,
        "The event identifier must be one this context's identity scope minted.",
      ),
    ]

const CONTEXT_REQUIRED = [
  'subject',
  'event',
  'identityScope',
  'repositoryScope',
  'application',
  'host',
]
const CONTEXT_OPTIONAL = [
  'conversionInstant',
  'converterRole',
  'studies',
  'repositoryIds',
]

const conversionInstantOf = (value: unknown): Result<FhirInstant> =>
  value === undefined ?
    parseFhirInstant(new Date().toISOString())
  : parseFhirInstant(value)

const frozenRepositoryIds = (
  value: unknown,
): Readonly<Partial<Record<ExchangeGraphNode, FhirId>>> | undefined => {
  const record = asRecord(value)
  if (record === undefined) return undefined
  const entries = Object.entries(record).filter(([, id]) => id !== undefined)
  return entries.length === 0 ? undefined : Object.fromEntries(entries)
}

/**
 * Validates one exchange event context and returns its frozen copy with every default
 * applied: the conversion instant is now, the converter role the assembler, the studies none.
 *
 * Context faults are deployment configuration, never producer rules: the issues carry the
 * package's schema codes, not registry codes, because no source record can cause them.
 */
export const parseExchangeEventContext = (
  input: unknown,
): Result<ResolvedExchangeEventContext> => {
  const record = asRecord(input)
  if (record === undefined) {
    return issues([
      fault('invalid-type', [], 'Expected an exchange event context object.'),
    ])
  }
  const conversionInstant = conversionInstantOf(record.conversionInstant)
  const findings = [
    ...shapeIssues(record, CONTEXT_REQUIRED, CONTEXT_OPTIONAL, []),
    ...subjectIssues(record.subject, ['subject']),
    ...(isOpaqueIdentityScope(record.identityScope) ?
      []
    : [
        fault(
          'invalid-identifier',
          ['identityScope'],
          'Expected the handle validateOpaqueIdentityScope returned.',
        ),
      ]),
    ...eventIssues(record.event, record.identityScope, ['event']),
    ...identifierIssues(record.repositoryScope, ['repositoryScope']),
    ...applicationIssues(record.application, ['application']),
    ...hostIssues(record.host, ['host']),
    ...(conversionInstant.ok ?
      []
    : [
        fault(
          'invalid-date-time',
          ['conversionInstant'],
          'Expected an RFC 3339 instant with seconds and an explicit UTC offset.',
        ),
      ]),
    ...converterRoleIssues(record.converterRole, ['converterRole']),
    ...studyIssues(record.studies, ['studies']),
    ...repositoryIdIssues(record.repositoryIds, ['repositoryIds']),
  ]
  if (findings.length > 0 || !conversionInstant.ok) return issues(findings)

  // Validated above; the scope handle is kept by reference because it proves itself by identity.
  const subject = cloneJsonValue(record.subject)
  const converterRole = cloneJsonValue(
    record.converterRole ?? { kind: 'assembler' },
  )
  const studies = cloneJsonValue(record.studies ?? [])
  const repositoryIds = frozenRepositoryIds(record.repositoryIds)
  if (!subject.ok || !converterRole.ok || !studies.ok) {
    return issues([
      fault('invalid-type', [], 'Expected an acyclic plain JSON context.'),
    ])
  }
  const application = cloneJsonValue(record.application)
  const host = cloneJsonValue(record.host)
  const repositoryScope = cloneJsonValue(record.repositoryScope)
  const event = cloneJsonValue(record.event)
  if (!application.ok || !host.ok || !repositoryScope.ok || !event.ok) {
    return issues([
      fault('invalid-type', [], 'Expected an acyclic plain JSON context.'),
    ])
  }
  return ok(
    deepFreeze({
      subject: subject.value as unknown as Subject,
      event: event.value as unknown as ExchangeEventIdentifier,
      identityScope: record.identityScope as OpaqueIdentityScope,
      repositoryScope: repositoryScope.value as unknown as BusinessIdentifier,
      application: application.value as unknown as ApplicationDevice,
      host: host.value as unknown as HostDevice,
      conversionInstant: conversionInstant.value,
      converterRole: converterRole.value as unknown as ConverterRole,
      studies: studies.value as unknown as readonly StudyEnrollment[],
      ...(repositoryIds === undefined ? {} : { repositoryIds }),
    }),
  )
}

export type { Patient }
