//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

/** FHIR graph identity, reference, coding, and diagnostic utilities. */

/* eslint-disable sonarjs/no-clear-text-protocols -- FHIR R4 fixes lifecycle and participant canonicals to HTTP. */

import type { z } from 'zod'
import { encodeGroveRuleDiagnostic } from './diagnostics.js'
import { parseAbsoluteUri } from '../core/index.js'
import { groveMobileContract } from '../mobile/contract.js'
import { healthKitApplicationDeviceIdentity } from '../contract/providers.generated.js'

export type UnknownRecord = Readonly<Record<string, unknown>>

export const asRecord = (value: unknown): UnknownRecord | undefined =>
  typeof value === 'object' && value !== null ?
    (value as UnknownRecord)
  : undefined

export const completeIdentifier = (
  value: unknown,
): value is { readonly system: string; readonly value: string } => {
  const identifier = asRecord(value)
  return (
    typeof identifier?.system === 'string' &&
    identifier.system !== '' &&
    typeof identifier.value === 'string' &&
    identifier.value !== ''
  )
}

const LOWERCASE_UUID_V5 =
  /^urn:uuid:[\da-f]{8}-[\da-f]{4}-5[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/u
const ENTRY_NODE_PARTS = /^n0:([a-z][a-z\d-]*):(0|[1-9]\d*):[A-Za-z\d_-]{43}$/u
const LOGICAL_PATIENT_RESERVED_SYSTEMS = new Set<string>(
  groveMobileContract.referencePolicy.identifierOnlyPatient.reservedSystems,
)

export const isLowercaseUuidV5 = (value: string): boolean =>
  LOWERCASE_UUID_V5.test(value)

export const parseEntryNodeParts = (value: string): RegExpExecArray | null =>
  ENTRY_NODE_PARTS.exec(value)
export const ISO_LIFECYCLE_SYSTEM =
  'http://terminology.hl7.org/CodeSystem/iso-21089-lifecycle'
export const PROVENANCE_PARTICIPANT_SYSTEM =
  'http://terminology.hl7.org/CodeSystem/provenance-participant-type'

export const APPLICATION_DEVICE_PROFILES: ReadonlySet<string> = new Set([
  groveMobileContract.profiles.applicationDevice,
  healthKitApplicationDeviceIdentity.profile,
])

const ENTRY_KEY_PRIORITY: readonly string[] =
  groveMobileContract.identity.resourceIdentifierPriority

export const OPAQUE_IDENTIFIER_ROLES: ReadonlySet<string> = new Set(
  groveMobileContract.identity.opaqueIdentifierRoles,
)

export const groveIdentifierRoles = (value: unknown): readonly string[] => {
  const identifier = asRecord(value)
  const type = asRecord(identifier?.type)
  const coding = Array.isArray(type?.coding) ? type.coding : []
  return coding.flatMap((candidate) => {
    const item = asRecord(candidate)
    return (
        item?.system === groveMobileContract.systems.identifierRole &&
          typeof item.code === 'string'
      ) ?
        [item.code]
      : []
  })
}

export const identifierRole = (value: unknown): string | undefined => {
  const groveRoles = groveIdentifierRoles(value)
  return groveRoles.length === 1 ? groveRoles[0] : undefined
}

export const identifiersOf = (resource: unknown): readonly unknown[] => {
  const value = asRecord(resource)?.identifier
  if (Array.isArray(value)) return value
  return value === undefined ? [] : [value]
}

export const identifierWithRole = (resource: unknown, role: string): unknown =>
  identifiersOf(resource).find(
    (candidate) => identifierRole(candidate) === role,
  )

export const identifierPairEqual = (left: unknown, right: unknown): boolean =>
  completeIdentifier(left) &&
  completeIdentifier(right) &&
  left.system === right.system &&
  left.value === right.value

export const selectedBusinessKey = (resource: unknown): unknown => {
  for (const role of ENTRY_KEY_PRIORITY) {
    const selected = identifierWithRole(resource, role)
    if (selected !== undefined) return selected
  }
  return undefined
}

export const entryKey = (entry: unknown): unknown => {
  const extension = asRecord(entry)?.extension
  if (!Array.isArray(extension)) return undefined
  const matches = extension.filter(
    (candidate) =>
      asRecord(candidate)?.url === groveMobileContract.extensions.entryNodeKey,
  )
  return matches.length === 1 ?
      asRecord(matches[0])?.valueIdentifier
    : undefined
}

export interface LocatedReference {
  readonly reference: string
  readonly type?: unknown
  readonly path: ReadonlyArray<number | string>
}

export const fhirLocation = (
  root: string,
  path: ReadonlyArray<number | string>,
): string =>
  path.reduce<string>(
    (location, component) =>
      typeof component === 'number' ?
        `${location}[${String(component)}]`
      : `${location}.${component}`,
    root,
  )

export interface LocatedGroveIdentifier {
  readonly role: string
  readonly system: string
  readonly path: ReadonlyArray<number | string>
}

export const locatedGroveIdentifiers = (
  value: unknown,
  path: ReadonlyArray<number | string> = [],
  visited: WeakSet<object> = new WeakSet(),
): readonly LocatedGroveIdentifier[] => {
  const record = asRecord(value)
  if (record === undefined || visited.has(record)) return []
  visited.add(record)

  const roles = groveIdentifierRoles(record)
  const located =
    roles.length === 1 && typeof record.system === 'string' ?
      [{ role: roles[0] ?? '', system: record.system, path }]
    : []
  return [
    ...located,
    ...Object.entries(record).flatMap(([key, nested]) =>
      Array.isArray(nested) ?
        nested.flatMap((candidate, index) =>
          locatedGroveIdentifiers(candidate, [...path, key, index], visited),
        )
      : locatedGroveIdentifiers(nested, [...path, key], visited),
    ),
  ]
}

const REFERENCE_PROPERTY_NAMES: ReadonlySet<string> = new Set([
  'id',
  'extension',
  'reference',
  '_reference',
  'type',
  '_type',
  'identifier',
  'display',
  '_display',
])

const isReferenceObject = (value: UnknownRecord): boolean =>
  Object.keys(value).every((key) => REFERENCE_PROPERTY_NAMES.has(key))

export const locatedReferences = (
  value: unknown,
  path: ReadonlyArray<number | string> = [],
  visited: WeakSet<object> = new WeakSet(),
): readonly LocatedReference[] => {
  if (typeof value !== 'object' || value === null || visited.has(value)) {
    return []
  }
  visited.add(value)
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      locatedReferences(item, [...path, index], visited),
    )
  }
  const record = asRecord(value)
  if (record === undefined) return []
  return [
    ...(typeof record.reference === 'string' && isReferenceObject(record) ?
      [{ reference: record.reference, type: record.type, path }]
    : []),
    ...Object.entries(record)
      .filter(([key]) => key !== 'reference')
      .flatMap(([key, nested]) =>
        locatedReferences(nested, [...path, key], visited),
      ),
  ]
}

export const referenceTypeMatches = (
  declared: unknown,
  actual: string,
): boolean => declared === actual

const internalReferenceTarget = (
  reference: unknown,
  resourcesByFullUrl: ReadonlyMap<string, UnknownRecord>,
): UnknownRecord | undefined => {
  const literal = asRecord(reference)?.reference
  if (typeof literal !== 'string') return undefined
  return resourcesByFullUrl.get(literal)
}

const validateInternalTarget = (
  reference: unknown,
  allowedTypes: ReadonlySet<string>,
  resourcesByFullUrl: ReadonlyMap<string, UnknownRecord>,
  context: z.core.$RefinementCtx,
  path: ReadonlyArray<number | string>,
  location: string,
): void => {
  const target = internalReferenceTarget(reference, resourcesByFullUrl)
  if (target === undefined) return
  if (
    typeof target.resourceType !== 'string' ||
    !allowedTypes.has(target.resourceType)
  ) {
    addIssue(
      context,
      'mobile-exchange.reference-target-type',
      path,
      `Internal reference must resolve to ${[...allowedTypes].join(' or ')}.`,
      `${location}.reference`,
    )
  }
}

const validateGovernedReferenceShape = (
  reference: unknown,
  allowedTypes: ReadonlySet<string>,
  context: z.core.$RefinementCtx,
  path: ReadonlyArray<number | string>,
  location: string,
): void => {
  const value = asRecord(reference)
  const hasLiteral =
    typeof value?.reference === 'string' && value.reference.trim() !== ''
  const hasIdentifier = value?.identifier !== undefined
  const validLogical =
    !hasLiteral &&
    completeIdentifier(value?.identifier) &&
    parseAbsoluteUri(value.identifier.system).ok &&
    typeof value.type === 'string' &&
    allowedTypes.has(value.type)
  const patientOnly = allowedTypes.size === 1 && allowedTypes.has('Patient')
  if (hasLiteral && hasIdentifier) {
    addIssue(
      context,
      'mobile-exchange.reference-shape',
      path,
      'A governed Reference must be exclusively a resolving literal or a typed identifier-only logical reference with one complete absolute-system Identifier.',
      location,
    )
  } else if (!hasLiteral && hasIdentifier && !validLogical) {
    addIssue(
      context,
      patientOnly ?
        'mobile-exchange.logical-patient-reference'
      : 'mobile-exchange.reference-shape',
      path,
      'An identifier-only logical Reference requires its exact admitted type and one complete absolute-system Identifier.',
      location,
    )
  } else if (!hasLiteral && !validLogical) {
    addIssue(
      context,
      'mobile-exchange.reference-shape',
      path,
      'A governed Reference requires exactly one resolving literal or identifier-only logical shape.',
      location,
    )
  } else if (validLogical && patientOnly) {
    const identifier = asRecord(value.identifier)
    if (
      typeof identifier?.system === 'string' &&
      LOGICAL_PATIENT_RESERVED_SYSTEMS.has(identifier.system)
    ) {
      addIssue(
        context,
        'mobile-exchange.logical-patient-reference',
        [...path, 'identifier', 'system'],
        'A logical Patient identifier cannot use a protocol-reserved code-system URI.',
        `${location}.identifier.system`,
      )
    }
    const type = asRecord(identifier?.type)
    const coding = Array.isArray(type?.coding) ? type.coding : []
    if (
      coding.some(
        (candidate) =>
          asRecord(candidate)?.system ===
          groveMobileContract.systems.identifierRole,
      )
    ) {
      addIssue(
        context,
        'mobile-exchange.logical-patient-reference',
        [...path, 'identifier', 'type'],
        'A logical Patient identifier cannot carry a Grove identifier role.',
        `${location}.identifier.type`,
      )
    }
  }
}

const validateProfilePathReferenceTargets = (
  resource: UnknownRecord,
  resourcesByFullUrl: ReadonlyMap<string, UnknownRecord>,
  context: z.core.$RefinementCtx,
  path: ReadonlyArray<number | string>,
): void => {
  for (const rule of groveMobileContract.referencePolicy.paths) {
    if (rule.resourceType !== resource.resourceType) continue
    const references = resource[rule.path]
    const values = Array.isArray(references) ? references : [references]
    for (const [index, reference] of values.entries()) {
      if (reference === undefined) continue
      const targetTypes = new Set(rule.targetTypes)
      const referencePath = [
        ...path,
        rule.path,
        ...(Array.isArray(references) ? [index] : []),
      ]
      const referenceIndex =
        Array.isArray(references) ? `[${String(index)}]` : ''
      const referenceLocation = `${String(resource.resourceType)}.${rule.path}${referenceIndex}`
      validateGovernedReferenceShape(
        reference,
        targetTypes,
        context,
        referencePath,
        referenceLocation,
      )
      validateInternalTarget(
        reference,
        targetTypes,
        resourcesByFullUrl,
        context,
        referencePath,
        referenceLocation,
      )
    }
  }
}

const validateProfileExtensionReferenceTargets = (
  resource: UnknownRecord,
  resourcesByFullUrl: ReadonlyMap<string, UnknownRecord>,
  context: z.core.$RefinementCtx,
  path: ReadonlyArray<number | string>,
): void => {
  const extensions = Array.isArray(resource.extension) ? resource.extension : []
  for (const [index, extension] of extensions.entries()) {
    const item = asRecord(extension)
    const rule = groveMobileContract.referencePolicy.extensionTargets.find(
      ({ url }) => url === item?.url,
    )
    if (rule !== undefined && item !== undefined) {
      const targetTypes = new Set(rule.targetTypes)
      const referencePath = [...path, 'extension', index, 'valueReference']
      const referenceLocation = `${String(resource.resourceType)}.extension[${String(index)}].valueReference`
      validateGovernedReferenceShape(
        item.valueReference,
        targetTypes,
        context,
        referencePath,
        referenceLocation,
      )
      validateInternalTarget(
        item.valueReference,
        targetTypes,
        resourcesByFullUrl,
        context,
        referencePath,
        referenceLocation,
      )
    }
  }
}

export const validateProfileReferenceTargets = (
  resource: UnknownRecord,
  resourcesByFullUrl: ReadonlyMap<string, UnknownRecord>,
  context: z.core.$RefinementCtx,
  path: ReadonlyArray<number | string>,
): void => {
  validateProfilePathReferenceTargets(
    resource,
    resourcesByFullUrl,
    context,
    path,
  )
  validateProfileExtensionReferenceTargets(
    resource,
    resourcesByFullUrl,
    context,
    path,
  )
}

export const codingExists = (
  concept: unknown,
  system: string,
  code: string,
): boolean => codingCount(concept, system, code) > 0

export const codingCount = (
  concept: unknown,
  system: string,
  code: string,
): number => {
  const coding = asRecord(concept)?.coding
  return Array.isArray(coding) ?
      coding.filter((candidate) => {
        const item = asRecord(candidate)
        return item?.system === system && item.code === code
      }).length
    : 0
}

export const codingCountForSystem = (
  concept: unknown,
  system: string,
): number => {
  const coding = asRecord(concept)?.coding
  return Array.isArray(coding) ?
      coding.filter((candidate) => asRecord(candidate)?.system === system)
        .length
    : 0
}

export const addIssue = (
  context: z.core.$RefinementCtx,
  code: string,
  path: ReadonlyArray<number | string>,
  message: string,
  location?: string,
): void => {
  context.addIssue({
    code: 'custom',
    path: [...path],
    message: encodeGroveRuleDiagnostic(code, path, message, location),
  })
}
