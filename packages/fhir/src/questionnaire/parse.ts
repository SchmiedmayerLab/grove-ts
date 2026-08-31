//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type z } from 'zod'
import {
  extensionValue,
  extensionsFor,
  validateQuestionnaireContract,
  validateQuestionnaireResponseItemContract,
} from './contract.js'
import {
  QUESTIONNAIRE_EXTENSIONS,
  QUESTIONNAIRE_SYSTEMS,
} from './questionnaire-extensions.js'
import {
  isExactQuestionnaireUrl,
  isQuestionnaireResponseReference,
  QUESTIONNAIRE_RESPONSE_AUTHOR_TYPES,
  QUESTIONNAIRE_RESPONSE_SOURCE_TYPES,
  QUESTIONNAIRE_RESPONSE_SUBJECT_TYPES,
} from './references.js'
import { questionnaireResponseSchema, questionnaireSchema } from './schemas.js'
import type {
  GroveQuestionnaire,
  GroveQuestionnaireResponse,
  QuestionnaireItemInput,
  QuestionnaireResponseItemInput,
} from './types.js'
import { groveQuestionnaireProfileCanonicals } from '../contract/questionnaire.generated.js'
import {
  cloneJsonValue,
  deepFreeze,
  issue,
  issues,
  ok,
  parseAbsoluteUri,
  parseCanonical,
  parseSemVer,
  zodIssueToIssue,
  type Issue,
  type Result,
} from '../core/index.js'
import type { Extension } from '../r4/index.js'

const VERSION_ALGORITHM = QUESTIONNAIRE_EXTENSIONS.versionAlgorithm
const VERSION_ALGORITHM_SYSTEM = QUESTIONNAIRE_SYSTEMS.versionAlgorithm
const COMPLETION_MODE = QUESTIONNAIRE_EXTENSIONS.completionMode
const PARTICIPATION_MODE = QUESTIONNAIRE_SYSTEMS.participationMode

const extensionValueKeys = [
  'valueBoolean',
  'valueCanonical',
  'valueCode',
  'valueCodeableConcept',
  'valueCoding',
  'valueDate',
  'valueDateTime',
  'valueDecimal',
  'valueExpression',
  'valueIdentifier',
  'valueInstant',
  'valueInteger',
  'valueId',
  'valueQuantity',
  'valueReference',
  'valueString',
  'valueTime',
  'valueUri',
  'valueUrl',
] as const

const objectPart = (value: unknown, property: string): unknown =>
  typeof value === 'object' && value !== null ?
    Reflect.get(value, property)
  : undefined

export const isExactQuestionnaireCanonical = (value: unknown): boolean => {
  if (typeof value !== 'string' || !parseCanonical(value).ok) return false
  const separator = value.indexOf('|')
  if (separator <= 0 || separator !== value.lastIndexOf('|')) return false
  const canonical = value.slice(0, separator)
  const version = value.slice(separator + 1)
  return (
    /^https?:\/\//u.test(canonical) &&
    !canonical.includes('#') &&
    parseAbsoluteUri(canonical).ok &&
    parseSemVer(version).ok
  )
}

const exactProfileIssues = (
  resource: {
    readonly meta?:
      | {
          readonly profile?: ReadonlyArray<string | null> | undefined
        }
      | undefined
  },
  expected: string,
): readonly Issue[] =>
  (
    resource.meta?.profile?.length === 1 &&
    resource.meta.profile[0] === expected
  ) ?
    []
  : [
      issue(
        'value-mismatch',
        ['meta', 'profile'],
        `Resource requires exactly the Grove profile ${expected}.`,
      ),
    ]

const validateExtension = (
  extension: Extension,
  path: ReadonlyArray<number | string>,
): readonly Issue[] => {
  const failures: Issue[] = []
  const populatedValues = extensionValueKeys.filter(
    (key) => Reflect.get(extension, key) !== undefined,
  ).length
  const nested = extension.extension ?? []
  if ((populatedValues === 1) === nested.length > 0) {
    failures.push(
      issue(
        'invalid-choice',
        path,
        'Extension requires either one value[x] or at least one nested extension, but not both.',
      ),
    )
  }
  for (const [index, child] of nested.entries()) {
    failures.push(...validateExtension(child, [...path, 'extension', index]))
  }
  for (const [key, value] of Object.entries(extension)) {
    if (key !== 'extension') {
      failures.push(...validateElementExtensions(value, [...path, key]))
    }
  }
  return failures
}

const validateElementExtensions = (
  value: unknown,
  path: ReadonlyArray<number | string> = [],
): readonly Issue[] => {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      validateElementExtensions(entry, [...path, index]),
    )
  }
  if (typeof value !== 'object' || value === null) return []

  const failures: Issue[] = []
  for (const [key, child] of Object.entries(value)) {
    if (
      (key === 'extension' || key === 'modifierExtension') &&
      Array.isArray(child)
    ) {
      for (const [index, extension] of child.entries()) {
        failures.push(
          ...validateExtension(extension as Extension, [...path, key, index]),
        )
      }
    } else {
      failures.push(...validateElementExtensions(child, [...path, key]))
    }
  }
  return failures
}

const questionnaireContractIssues = (
  questionnaire: GroveQuestionnaire,
): readonly Issue[] => {
  const failures: Issue[] = [
    ...exactProfileIssues(
      questionnaire,
      groveQuestionnaireProfileCanonicals['grove-questionnaire'],
    ),
    ...validateElementExtensions(questionnaire),
  ]
  if (!isExactQuestionnaireUrl(questionnaire.url)) {
    failures.push(
      issue(
        'invalid-uri',
        ['url'],
        'Questionnaire.url must be an exact absolute HTTP(S) canonical without a fragment or version delimiter.',
      ),
    )
  }
  if (!parseSemVer(questionnaire.version).ok) {
    failures.push(
      issue(
        'invalid-code',
        ['version'],
        'Questionnaire.version must be SemVer.',
      ),
    )
  }
  const subjectTypes = questionnaire.subjectType ?? []
  if (subjectTypes.length !== 1 || subjectTypes[0] !== 'Patient') {
    failures.push(
      issue(
        'value-mismatch',
        ['subjectType'],
        'Questionnaire.subjectType is fixed to exactly Patient.',
      ),
    )
  }
  const algorithms = extensionsFor(
    { extension: questionnaire.extension ?? [] },
    VERSION_ALGORITHM,
  )
  const algorithm =
    algorithms.length === 1 ? extensionValue(algorithms[0]) : undefined
  if (
    algorithm?.key !== 'valueCoding' ||
    objectPart(algorithm.value, 'system') !== VERSION_ALGORITHM_SYSTEM ||
    objectPart(algorithm.value, 'code') !== 'semver'
  ) {
    failures.push(
      issue(
        'missing-required',
        ['extension'],
        'Questionnaire requires exactly one SemVer version-algorithm Coding.',
      ),
    )
  }
  failures.push(
    ...validateQuestionnaireContract(
      questionnaire.extension,
      questionnaire.item as unknown as readonly QuestionnaireItemInput[],
    ),
  )
  return failures
}

const responseContractIssues = (
  response: GroveQuestionnaireResponse,
): readonly Issue[] => {
  const failures: Issue[] = [
    ...exactProfileIssues(
      response,
      groveQuestionnaireProfileCanonicals['grove-questionnaire-response'],
    ),
    ...validateElementExtensions(response),
  ]
  if (!isExactQuestionnaireCanonical(response.questionnaire)) {
    failures.push(
      issue(
        'invalid-uri',
        ['questionnaire'],
        'QuestionnaireResponse.questionnaire must be one exact url|SemVer canonical without fragments.',
      ),
    )
  }
  const identifierSystem = objectPart(response.identifier, 'system')
  const identifierValue = objectPart(response.identifier, 'value')
  if (
    !parseAbsoluteUri(identifierSystem).ok ||
    typeof identifierValue !== 'string' ||
    identifierValue.trim() === ''
  ) {
    failures.push(
      issue(
        'invalid-identifier',
        ['identifier'],
        'QuestionnaireResponse requires one complete business Identifier.',
      ),
    )
  }
  if (response.subject === undefined) {
    failures.push(
      issue(
        'missing-required',
        ['subject'],
        'QuestionnaireResponse.subject is mandatory and references exactly one Patient.',
      ),
    )
  }
  for (const [field, reference, allowedTypes] of [
    ['subject', response.subject, QUESTIONNAIRE_RESPONSE_SUBJECT_TYPES],
    ['author', response.author, QUESTIONNAIRE_RESPONSE_AUTHOR_TYPES],
    ['source', response.source, QUESTIONNAIRE_RESPONSE_SOURCE_TYPES],
  ] as const) {
    if (
      reference !== undefined &&
      !isQuestionnaireResponseReference(
        reference,
        allowedTypes,
        response.contained ?? [],
      )
    ) {
      failures.push(
        issue(
          'invalid-reference',
          [field],
          `QuestionnaireResponse.${field} requires one typed literal or identifier-only logical Reference to an admitted target type.`,
        ),
      )
    }
  }
  const completionModes = extensionsFor(
    { extension: response.extension ?? [] },
    COMPLETION_MODE,
  )
  const completionMode =
    completionModes.length === 1 ?
      extensionValue(completionModes[0])
    : undefined
  const codings = objectPart(completionMode?.value, 'coding')
  const coding: unknown =
    Array.isArray(codings) && codings.length === 1 ? codings[0] : undefined
  if (
    completionMode?.key !== 'valueCodeableConcept' ||
    objectPart(coding, 'system') !== PARTICIPATION_MODE ||
    objectPart(coding, 'code') !== 'ELECTRONIC'
  ) {
    failures.push(
      issue(
        'missing-required',
        ['extension'],
        'QuestionnaireResponse requires exactly one ELECTRONIC completion-mode Coding.',
      ),
    )
  }
  failures.push(
    ...validateQuestionnaireResponseItemContract(
      (response.item ??
        []) as unknown as readonly QuestionnaireResponseItemInput[],
    ),
  )
  return failures
}

// The schema decides the parsed type; a caller-chosen T would make the cast below a lie.
const parseWith = <T>(schema: z.ZodType<T>, input: unknown): Result<T> => {
  const snapshot = cloneJsonValue(input)
  if (!snapshot.ok) return snapshot
  const result = schema.safeParse(snapshot.value)
  if (!result.success) return issues(result.error.issues.map(zodIssueToIssue))
  return ok(deepFreeze(result.data) as T)
}

export const parseQuestionnaire = (
  input: unknown,
): Result<GroveQuestionnaire> => {
  const parsed = parseWith(questionnaireSchema, input)
  if (!parsed.ok) return parsed
  const failures = questionnaireContractIssues(parsed.value)
  return failures.length === 0 ? parsed : issues(failures)
}

export const parseQuestionnaireResponse = (
  input: unknown,
): Result<GroveQuestionnaireResponse> => {
  const parsed = parseWith(questionnaireResponseSchema, input)
  if (!parsed.ok) return parsed
  const failures = responseContractIssues(parsed.value)
  return failures.length === 0 ? parsed : issues(failures)
}
