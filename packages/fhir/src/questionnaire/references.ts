//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { isR4ResourceType } from './r4-resource-types.js'
import { parseAbsoluteUri } from '../core/index.js'

type UnknownRecord = Readonly<Record<string, unknown>>

const asRecord = (value: unknown): UnknownRecord | undefined =>
  typeof value === 'object' && value !== null ?
    (value as UnknownRecord)
  : undefined

const FHIR_ID = /^[A-Za-z\d\-.]{1,64}$/u
const TYPED_LITERAL_REFERENCE =
  /(?:^|\/)([A-Z][A-Za-z\d]*)\/([A-Za-z\d\-.]{1,64})(?:\/_history\/[A-Za-z\d\-.]{1,64})?$/u

export const QUESTIONNAIRE_RESPONSE_SUBJECT_TYPES: ReadonlySet<string> =
  new Set(['Patient'])

export const QUESTIONNAIRE_RESPONSE_AUTHOR_TYPES: ReadonlySet<string> = new Set(
  [
    'Device',
    'Organization',
    'Patient',
    'Practitioner',
    'PractitionerRole',
    'RelatedPerson',
  ],
)

export const QUESTIONNAIRE_RESPONSE_SOURCE_TYPES: ReadonlySet<string> = new Set(
  ['Patient', 'Practitioner', 'PractitionerRole', 'RelatedPerson'],
)

const declaredTargetType = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || value === '') return undefined
  let end = value.length
  while (end > 0 && value[end - 1] === '/') end -= 1
  const separator = value.lastIndexOf('/', end - 1)
  const type = value.slice(separator + 1, end)
  return isR4ResourceType(type) ? type : undefined
}

const containedTargetType = (
  reference: string,
  contained: readonly unknown[],
): string | undefined => {
  const id = reference.slice(1)
  if (!FHIR_ID.test(id)) return undefined
  const matches = contained.filter(
    (candidate) => asRecord(candidate)?.id === id,
  )
  if (matches.length !== 1) return undefined
  const resourceType = asRecord(matches[0])?.resourceType
  return typeof resourceType === 'string' && isR4ResourceType(resourceType) ?
      resourceType
    : undefined
}

const literalTargetType = (
  reference: string,
  contained: readonly unknown[],
): string | undefined => {
  if (reference.startsWith('#')) {
    return containedTargetType(reference, contained)
  }
  if (/[?#]/u.test(reference)) return undefined
  const match = TYPED_LITERAL_REFERENCE.exec(reference)
  const type = match?.[1]
  return type !== undefined && isR4ResourceType(type) ? type : undefined
}

const completeLogicalIdentifier = (value: unknown): boolean => {
  const identifier = asRecord(value)
  return (
    parseAbsoluteUri(identifier?.system).ok &&
    typeof identifier?.value === 'string' &&
    identifier.value.trim() !== ''
  )
}

/** Resolves a target type from Reference.type, a typed literal, or a contained target. */
export const questionnaireResponseReferenceType = (
  value: unknown,
  contained: readonly unknown[] = [],
): string | undefined => {
  const reference = asRecord(value)
  if (reference === undefined) return undefined
  const declared = declaredTargetType(reference.type)
  if (reference.type !== undefined && declared === undefined) return undefined
  if (typeof reference.reference !== 'string') return declared
  const literal = literalTargetType(reference.reference, contained)
  if (reference.reference.startsWith('#') && literal === undefined) {
    return undefined
  }
  if (declared !== undefined && literal !== undefined && declared !== literal) {
    return undefined
  }
  return declared ?? literal
}

/** Validates a conformant parser-side literal and/or logical Reference. */
export const isQuestionnaireResponseReference = (
  value: unknown,
  allowedTypes?: ReadonlySet<string>,
  contained: readonly unknown[] = [],
): boolean => {
  const reference = asRecord(value)
  if (reference === undefined) return false
  const hasLiteral =
    typeof reference.reference === 'string' && reference.reference !== ''
  const hasIdentifier = reference.identifier !== undefined
  if (!hasLiteral && !hasIdentifier) return false
  if (hasIdentifier && !completeLogicalIdentifier(reference.identifier)) {
    return false
  }
  const type = questionnaireResponseReferenceType(reference, contained)
  return (
    type !== undefined &&
    (hasLiteral || reference.type !== undefined) &&
    (allowedTypes === undefined || allowedTypes.has(type))
  )
}

/** Strict builder-side shape: explicit type and exactly one literal or logical target. */
export const isQuestionnaireResponseBuilderReference = (
  value: unknown,
  allowedTypes?: ReadonlySet<string>,
): boolean => {
  const reference = asRecord(value)
  if (reference === undefined) return false
  const type = declaredTargetType(reference.type)
  if (
    type === undefined ||
    reference.type !== type ||
    (allowedTypes !== undefined && !allowedTypes.has(type))
  ) {
    return false
  }
  const hasLiteral =
    typeof reference.reference === 'string' && reference.reference !== ''
  const hasIdentifier = reference.identifier !== undefined
  if (hasLiteral === hasIdentifier) return false
  if (hasIdentifier) return completeLogicalIdentifier(reference.identifier)
  const literal = literalTargetType(reference.reference as string, [])
  return literal === type
}

/** Required canonical base form for Grove Questionnaire.url. */
export const isExactQuestionnaireUrl = (value: unknown): boolean =>
  typeof value === 'string' &&
  /^https?:\/\//u.test(value) &&
  !value.includes('#') &&
  !value.includes('|') &&
  parseAbsoluteUri(value).ok
