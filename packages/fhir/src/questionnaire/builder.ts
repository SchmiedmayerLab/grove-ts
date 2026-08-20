//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { parseQuestionnaire, parseQuestionnaireResponse } from './parse.js'
import type {
  GroveQuestionnaire,
  GroveQuestionnaireResponse,
  QuestionnaireInput,
  QuestionnaireItemInput,
  QuestionnaireResponseInput,
  QuestionnaireResponseItemInput,
} from './types.js'
import {
  issues,
  parseAbsoluteUri,
  parseCanonical,
  parseFhirId,
  parseFhirInstant,
  parsePatientReference,
  parseSemVer,
  type Issue,
  type Result,
} from '../core/index.js'
import { groveFhirProfileCanonicals } from '../mobile/measurement-catalog.generated.js'

/* eslint-disable sonarjs/no-clear-text-protocols -- FHIR R4 canonicals are normative HTTP URIs. */

const VERSION_ALGORITHM =
  'http://hl7.org/fhir/StructureDefinition/artifact-versionAlgorithm'
const VERSION_ALGORITHM_SYSTEM = 'http://hl7.org/fhir/version-algorithm'
const COMPLETION_MODE =
  'http://hl7.org/fhir/StructureDefinition/questionnaireresponse-completionMode'
const PARTICIPATION_MODE =
  'http://terminology.hl7.org/CodeSystem/v3-ParticipationMode'
const ENABLE_WHEN_EXPRESSION =
  'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-enableWhenExpression'
const INITIAL_EXPRESSION =
  'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-initialExpression'
const STYLE_SENSITIVE =
  'http://hl7.org/fhir/StructureDefinition/rendering-styleSensitive'

const issue = (
  code: Issue['code'],
  path: Issue['path'],
  message: string,
): Issue => ({ severity: 'error', code, path, message })

const extensionCount = (
  extensions: ReadonlyArray<{ readonly url: string }> | undefined,
  url: string,
) => extensions?.filter((extension) => extension.url === url).length ?? 0

const validateItemContent = (
  item: QuestionnaireItemInput,
  seen: Set<string>,
  path: ReadonlyArray<number | string>,
): readonly Issue[] => {
  const failures: Issue[] = []
  if (seen.has(item.linkId)) {
    failures.push(
      issue(
        'duplicate-identifier',
        [...path, 'linkId'],
        `Questionnaire linkId ${item.linkId} is duplicated.`,
      ),
    )
  }
  seen.add(item.linkId)
  if (item.type !== 'group' && (item.text?.trim() ?? '') === '') {
    failures.push(
      issue(
        'missing-required',
        [...path, 'text'],
        'Every non-group Questionnaire item requires text.',
      ),
    )
  }
  if (
    item.repeats === true &&
    !['attachment', 'choice', 'open-choice'].includes(item.type)
  ) {
    failures.push(
      issue(
        'invalid-choice',
        [...path, 'repeats'],
        'Only choice, open-choice, and attachment questions may repeat.',
      ),
    )
  }
  if ((item.enableWhen?.length ?? 0) > 1 && item.enableBehavior === undefined) {
    failures.push(
      issue(
        'missing-required',
        [...path, 'enableBehavior'],
        'Multiple enableWhen rules require enableBehavior.',
      ),
    )
  }
  return failures
}

const validateItemExclusivity = (
  item: QuestionnaireItemInput,
  path: ReadonlyArray<number | string>,
): readonly Issue[] => {
  const failures: Issue[] = []
  if (
    (item.enableWhen?.length ?? 0) > 0 &&
    extensionCount(item.extension, ENABLE_WHEN_EXPRESSION) > 0
  ) {
    failures.push(
      issue(
        'invalid-choice',
        path,
        'An item cannot combine enableWhen with enableWhenExpression.',
      ),
    )
  }
  if (
    (item.initial?.length ?? 0) > 0 &&
    extensionCount(item.extension, INITIAL_EXPRESSION) > 0
  ) {
    failures.push(
      issue(
        'invalid-choice',
        path,
        'An item cannot combine initial with initialExpression.',
      ),
    )
  }
  if (
    (item.answerOption?.length ?? 0) > 0 &&
    item.answerValueSet !== undefined
  ) {
    failures.push(
      issue(
        'invalid-choice',
        path,
        'An item cannot combine answerOption with answerValueSet.',
      ),
    )
  }
  if (extensionCount(item.extension, STYLE_SENSITIVE) > 0) {
    failures.push(
      issue(
        'invalid-code',
        [...path, 'extension'],
        'Presentation-sensitive questionnaire semantics are not supported.',
      ),
    )
  }
  return failures
}

const validateItems = (
  items: readonly QuestionnaireItemInput[],
  seen: Set<string>,
  path: ReadonlyArray<number | string> = ['items'],
): readonly Issue[] => {
  const failures: Issue[] = []
  for (const [index, item] of items.entries()) {
    const itemPath = [...path, index]
    failures.push(...validateItemContent(item, seen, itemPath))
    failures.push(...validateItemExclusivity(item, itemPath))
    failures.push(
      ...validateItems(item.item ?? [], seen, [...itemPath, 'item']),
    )
  }
  return failures
}

const validateQuestionnaireInput = (
  input: QuestionnaireInput,
): readonly Issue[] => {
  const failures: Issue[] = []
  if (!parseAbsoluteUri(input.url).ok) {
    failures.push(
      issue('invalid-uri', ['url'], 'Questionnaire.url is invalid.'),
    )
  }
  if (!parseSemVer(input.version).ok) {
    failures.push(
      issue(
        'invalid-code',
        ['version'],
        'Questionnaire.version must be SemVer.',
      ),
    )
  }
  if (input.id !== undefined && !parseFhirId(input.id).ok) {
    failures.push(
      issue('invalid-identifier', ['id'], 'Questionnaire.id is invalid.'),
    )
  }
  if (input.date !== undefined && !parseFhirInstant(input.date).ok) {
    failures.push(
      issue('invalid-date-time', ['date'], 'Questionnaire.date is invalid.'),
    )
  }
  if (input.subjectTypes?.some((entry) => entry.trim() === '') === true) {
    failures.push(
      issue(
        'missing-required',
        ['subjectTypes'],
        'Questionnaire.subjectTypes cannot contain empty resource type codes.',
      ),
    )
  }
  if (extensionCount(input.extensions, VERSION_ALGORITHM) > 0) {
    failures.push(
      issue(
        'duplicate-identifier',
        ['extensions'],
        'The builder owns the single SemVer algorithm extension.',
      ),
    )
  }
  if (extensionCount(input.extensions, STYLE_SENSITIVE) > 0) {
    failures.push(
      issue(
        'invalid-code',
        ['extensions'],
        'Presentation-sensitive questionnaire semantics are not supported.',
      ),
    )
  }
  failures.push(...validateItems(input.items, new Set()))
  return failures
}

/** Builds a versioned Grove R4 Questionnaire with the SemVer contract stamped. */
export const buildQuestionnaire = (
  input: QuestionnaireInput,
): Result<GroveQuestionnaire> => {
  const failures = validateQuestionnaireInput(input)
  if (failures.length > 0) return issues(failures)

  return parseQuestionnaire({
    resourceType: 'Questionnaire',
    ...(input.id === undefined ? {} : { id: input.id }),
    meta: {
      profile: [groveFhirProfileCanonicals['grove-questionnaire']],
    },
    extension: [
      ...(input.extensions ?? []),
      {
        url: VERSION_ALGORITHM,
        valueCoding: {
          system: VERSION_ALGORITHM_SYSTEM,
          code: 'semver',
        },
      },
    ],
    url: input.url,
    version: input.version,
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.title === undefined ? {} : { title: input.title }),
    status: input.status,
    ...(input.subjectTypes === undefined ?
      {}
    : { subjectType: input.subjectTypes }),
    ...(input.date === undefined ? {} : { date: input.date }),
    ...(input.description === undefined ?
      {}
    : { description: input.description }),
    ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
    item: input.items,
  })
}

const validateResponseText = (
  items: readonly QuestionnaireResponseItemInput[],
  path: ReadonlyArray<number | string> = ['items'],
): readonly Issue[] => {
  const failures: Issue[] = []
  for (const [index, item] of items.entries()) {
    const itemPath = [...path, index]
    if ((item.answer?.length ?? 0) > 0 && (item.text?.trim() ?? '') === '') {
      failures.push(
        issue(
          'missing-required',
          [...itemPath, 'text'],
          'Every answered response item must repeat the question text.',
        ),
      )
    }
    if (item.item !== undefined) {
      failures.push(...validateResponseText(item.item, [...itemPath, 'item']))
    }
    for (const [answerIndex, answer] of (item.answer ?? []).entries()) {
      if (answer.item !== undefined) {
        failures.push(
          ...validateResponseText(answer.item, [
            ...itemPath,
            'answer',
            answerIndex,
            'item',
          ]),
        )
      }
    }
  }
  return failures
}

const validateResponseInput = (
  input: QuestionnaireResponseInput,
): readonly Issue[] => {
  const failures: Issue[] = []
  const canonical = parseCanonical(input.questionnaire)
  if (!canonical.ok || !/^[^|#]+\|[^|#]+$/u.test(input.questionnaire)) {
    failures.push(
      issue(
        'invalid-uri',
        ['questionnaire'],
        'Response.questionnaire must be an exact url|version canonical.',
      ),
    )
  }
  const version = input.questionnaire.split('|')[1]
  if (!parseSemVer(version).ok) {
    failures.push(
      issue(
        'invalid-code',
        ['questionnaire'],
        'Response.questionnaire version must be SemVer.',
      ),
    )
  }
  if (
    !parseAbsoluteUri(input.identifier.system).ok ||
    input.identifier.value.trim() === ''
  ) {
    failures.push(
      issue(
        'invalid-identifier',
        ['identifier'],
        'Response identifier requires an absolute system and non-empty value.',
      ),
    )
  }
  if (!parseFhirInstant(input.authored).ok) {
    failures.push(
      issue('invalid-date-time', ['authored'], 'Response.authored is invalid.'),
    )
  }
  if (input.id !== undefined && !parseFhirId(input.id).ok) {
    failures.push(
      issue('invalid-identifier', ['id'], 'Response.id is invalid.'),
    )
  }
  if (input.subject !== undefined && !parsePatientReference(input.subject).ok) {
    failures.push(
      issue('invalid-reference', ['subject'], 'Response.subject is invalid.'),
    )
  }
  for (const [field, reference] of [
    ['authorReference', input.authorReference],
    ['sourceReference', input.sourceReference],
  ] as const) {
    if (reference?.trim() === '') {
      failures.push(
        issue('invalid-reference', [field], `${field} must not be empty.`),
      )
    }
  }
  if (extensionCount(input.extensions, COMPLETION_MODE) > 0) {
    failures.push(
      issue(
        'duplicate-identifier',
        ['extensions'],
        'The builder owns the single electronic completion-mode extension.',
      ),
    )
  }
  failures.push(...validateResponseText(input.items ?? []))
  return failures
}

/** Builds a Grove R4 QuestionnaireResponse for one exact instrument version. */
export const buildQuestionnaireResponse = (
  input: QuestionnaireResponseInput,
): Result<GroveQuestionnaireResponse> => {
  const failures = validateResponseInput(input)
  if (failures.length > 0) return issues(failures)

  return parseQuestionnaireResponse({
    resourceType: 'QuestionnaireResponse',
    ...(input.id === undefined ? {} : { id: input.id }),
    meta: {
      profile: [groveFhirProfileCanonicals['grove-questionnaire-response']],
    },
    extension: [
      ...(input.extensions ?? []),
      {
        url: COMPLETION_MODE,
        valueCodeableConcept: {
          coding: [{ system: PARTICIPATION_MODE, code: 'ELECTRONIC' }],
        },
      },
    ],
    identifier: input.identifier,
    questionnaire: input.questionnaire,
    status: input.status,
    ...(input.subject === undefined ?
      {}
    : { subject: { reference: input.subject } }),
    authored: input.authored,
    ...(input.authorReference === undefined ?
      {}
    : { author: { reference: input.authorReference } }),
    ...(input.sourceReference === undefined ?
      {}
    : { source: { reference: input.sourceReference } }),
    ...(input.items === undefined ? {} : { item: input.items }),
  })
}
