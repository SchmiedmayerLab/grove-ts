//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  extensionValue,
  extensionsFor,
  firstExtensionValue,
  QUESTIONNAIRE_EXTENSIONS,
  validateQuestionnaireContract,
} from './contract.js'
import {
  isExactQuestionnaireCanonical,
  parseQuestionnaire,
  parseQuestionnaireResponse,
} from './parse.js'
import {
  codingPart,
  evaluateEnableWhen,
  optionIsExclusive,
  responseAnswers,
  selectedInlineOption,
  validateAnswer,
  validateExpressionEngineRequirements,
  type PreflightContext,
  type ResolvedValueSet,
} from './preflight-answer-validation.js'
import { issue, prefixed } from './preflight-diagnostics.js'
import { questionnaireResponseReferenceType } from './references.js'
import type {
  QuestionnaireItemInput,
  QuestionnairePair,
  QuestionnairePreflightOptions,
  QuestionnaireResponseItemInput,
} from './types.js'
import {
  issues,
  ok,
  parseAbsoluteUri,
  parseSemVer,
  type Issue,
  type Result,
} from '../core/index.js'

/* eslint-disable sonarjs/no-clear-text-protocols -- FHIR R4 canonicals are normative HTTP URIs. */

const completedStatuses = new Set(['amended', 'completed'])
const VERSION_ALGORITHM =
  'http://hl7.org/fhir/StructureDefinition/artifact-versionAlgorithm'
const VERSION_ALGORITHM_SYSTEM = 'http://hl7.org/fhir/version-algorithm'
const COMPLETION_MODE =
  'http://hl7.org/fhir/StructureDefinition/questionnaireresponse-completionMode'
const PARTICIPATION_MODE =
  'http://terminology.hl7.org/CodeSystem/v3-ParticipationMode'

const validateQuestionnaireEnvelope = (
  questionnaire: QuestionnairePair['questionnaire'],
): readonly Issue[] => {
  const failures: Issue[] = []
  if (!parseSemVer(questionnaire.version).ok) {
    failures.push(
      issue(
        'invalid-code',
        ['version'],
        'Questionnaire.version must be SemVer.',
      ),
    )
  }

  const algorithms = extensionsFor(
    { extension: questionnaire.extension ?? [] },
    VERSION_ALGORITHM,
  )
  const algorithm =
    algorithms.length === 1 ? extensionValue(algorithms[0]) : undefined
  const algorithmCoding = algorithm?.value
  if (
    algorithm?.key !== 'valueCoding' ||
    codingPart(algorithmCoding, 'system') !== VERSION_ALGORITHM_SYSTEM ||
    codingPart(algorithmCoding, 'code') !== 'semver'
  ) {
    failures.push(
      issue(
        'missing-required',
        ['extension'],
        'Questionnaire requires exactly one SemVer version-algorithm Coding.',
      ),
    )
  }
  return failures
}

const validateQuestionnaireResponseEnvelope = (
  response: QuestionnairePair['response'],
): readonly Issue[] => {
  const failures: Issue[] = []
  if (!isExactQuestionnaireCanonical(response.questionnaire)) {
    failures.push(
      issue(
        'invalid-uri',
        ['questionnaire'],
        'QuestionnaireResponse.questionnaire must be one exact url|SemVer canonical without fragments.',
      ),
    )
  }

  const identifierSystem = codingPart(response.identifier, 'system')
  const identifierValue = codingPart(response.identifier, 'value')
  if (
    !parseAbsoluteUri(identifierSystem).ok ||
    typeof identifierValue !== 'string' ||
    identifierValue.trim() === ''
  ) {
    failures.push(
      issue(
        'invalid-identifier',
        ['identifier'],
        'QuestionnaireResponse requires a complete business Identifier.',
      ),
    )
  }

  const completionModes = extensionsFor(
    { extension: response.extension ?? [] },
    COMPLETION_MODE,
  )
  const completionMode =
    completionModes.length === 1 ?
      extensionValue(completionModes[0])
    : undefined
  const completionCodings = codingPart(completionMode?.value, 'coding')
  const completionCoding: unknown =
    Array.isArray(completionCodings) && completionCodings.length === 1 ?
      completionCodings[0]
    : undefined
  if (
    completionMode?.key !== 'valueCodeableConcept' ||
    codingPart(completionCoding, 'system') !== PARTICIPATION_MODE ||
    codingPart(completionCoding, 'code') !== 'ELECTRONIC'
  ) {
    failures.push(
      issue(
        'missing-required',
        ['extension'],
        'QuestionnaireResponse requires exactly one ELECTRONIC completion-mode Coding.',
      ),
    )
  }
  return failures
}

const validateOmittedGroupChildren = (
  item: QuestionnaireItemInput,
  responseItem: QuestionnaireResponseItemInput | undefined,
  enabled: boolean,
  context: PreflightContext,
  path: ReadonlyArray<number | string>,
): readonly Issue[] =>
  (
    context.completed &&
    enabled &&
    item.type === 'group' &&
    responseItem === undefined
  ) ?
    validateResponseItems(item.item ?? [], [], context, [
      ...path,
      item.linkId,
      'item',
    ])
  : []

const validateRequiredItems = (
  questionnaireItems: readonly QuestionnaireItemInput[],
  responseByLinkId: ReadonlyMap<string, QuestionnaireResponseItemInput>,
  context: PreflightContext,
  path: ReadonlyArray<number | string>,
): readonly Issue[] => {
  const failures: Issue[] = []
  for (const questionnaireItem of questionnaireItems) {
    const responseItem = responseByLinkId.get(questionnaireItem.linkId)
    const enabled = evaluateEnableWhen(questionnaireItem, context.answers)
    if (context.completed && enabled === undefined) {
      failures.push(
        issue(
          'external-validation-required',
          path,
          `enableWhen could not be evaluated for ${questionnaireItem.linkId}.`,
        ),
      )
      continue
    }
    if (enabled === undefined) continue
    if (!enabled && responseItem !== undefined) {
      failures.push(
        issue(
          'invalid-choice',
          path,
          `Disabled item ${questionnaireItem.linkId} must not be present.`,
        ),
      )
    }
    const required =
      context.completed && questionnaireItem.required === true && enabled
    const hasRequiredContent =
      questionnaireItem.type === 'group' ?
        responseItem !== undefined
      : (responseItem?.answer?.length ?? 0) > 0
    if (required && !hasRequiredContent) {
      failures.push(
        issue(
          'missing-required',
          path,
          `Completed response is missing required item ${questionnaireItem.linkId}.`,
        ),
      )
    }
    failures.push(
      ...validateOmittedGroupChildren(
        questionnaireItem,
        responseItem,
        enabled,
        context,
        path,
      ),
    )
  }
  return failures
}

const validateMatchedResponseItem = (
  questionnaireItem: QuestionnaireItemInput,
  responseItem: QuestionnaireResponseItemInput,
  context: PreflightContext,
  path: ReadonlyArray<number | string>,
): readonly Issue[] => {
  const failures: Issue[] = []
  const answers = responseItem.answer ?? []
  if (responseItem.text !== questionnaireItem.text) {
    failures.push(
      issue(
        'value-mismatch',
        [...path, 'text'],
        'Response item text must exactly match Questionnaire.item.text.',
      ),
    )
  }
  if (questionnaireItem.repeats !== true && answers.length > 1) {
    failures.push(
      issue(
        'out-of-range',
        [...path, 'answer'],
        'A non-repeating Questionnaire item permits at most one answer.',
      ),
    )
  }
  const minimumOccurs = firstExtensionValue(
    questionnaireItem,
    QUESTIONNAIRE_EXTENSIONS.minOccurs,
  )?.value
  const maximumOccurs = firstExtensionValue(
    questionnaireItem,
    QUESTIONNAIRE_EXTENSIONS.maxOccurs,
  )?.value
  if (typeof minimumOccurs === 'number' && answers.length < minimumOccurs) {
    failures.push(
      issue(
        'out-of-range',
        [...path, 'answer'],
        'Answer count is below minOccurs.',
      ),
    )
  }
  if (typeof maximumOccurs === 'number' && answers.length > maximumOccurs) {
    failures.push(
      issue(
        'out-of-range',
        [...path, 'answer'],
        'Answer count exceeds maxOccurs.',
      ),
    )
  }
  if (
    answers.length > 1 &&
    answers.some((answer) => {
      const selected = selectedInlineOption(questionnaireItem, answer)
      return selected !== undefined && optionIsExclusive(selected)
    })
  ) {
    failures.push(
      issue(
        'invalid-choice',
        [...path, 'answer'],
        'An exclusive option cannot be combined with another answer.',
      ),
    )
  }
  for (const [answerIndex, answer] of answers.entries()) {
    const answerPath = [...path, 'answer', answerIndex]
    failures.push(
      ...validateAnswer(questionnaireItem, answer, context, answerPath),
    )
    failures.push(
      ...validateResponseItems(
        questionnaireItem.item ?? [],
        answer.item ?? [],
        context,
        [...answerPath, 'item'],
      ),
    )
  }

  if (questionnaireItem.type === 'group') {
    if (answers.length > 0) {
      failures.push(
        issue(
          'invalid-type',
          [...path, 'answer'],
          'Group items cannot carry answers.',
        ),
      )
    }
    failures.push(
      ...validateResponseItems(
        questionnaireItem.item ?? [],
        responseItem.item ?? [],
        context,
        [...path, 'item'],
      ),
    )
  } else if ((responseItem.item?.length ?? 0) > 0) {
    failures.push(
      issue(
        'invalid-choice',
        [...path, 'item'],
        'Children of an answered question belong under answer.item.',
      ),
    )
  }
  return failures
}

const validateResponseItems = (
  questionnaireItems: readonly QuestionnaireItemInput[],
  responseItems: readonly QuestionnaireResponseItemInput[],
  context: PreflightContext,
  path: ReadonlyArray<number | string> = ['response', 'item'],
): readonly Issue[] => {
  const failures: Issue[] = []
  const questionnaireByLinkId = new Map(
    questionnaireItems.map((item) => [item.linkId, item]),
  )
  const responseByLinkId = new Map<string, QuestionnaireResponseItemInput>()

  for (const [responseIndex, responseItem] of responseItems.entries()) {
    const itemPath = [...path, responseIndex]
    if (responseByLinkId.has(responseItem.linkId)) {
      failures.push(
        issue(
          'duplicate-identifier',
          [...itemPath, 'linkId'],
          `Response linkId ${responseItem.linkId} is duplicated among siblings.`,
        ),
      )
      continue
    }
    responseByLinkId.set(responseItem.linkId, responseItem)
    const questionnaireItem = questionnaireByLinkId.get(responseItem.linkId)
    if (questionnaireItem === undefined) {
      failures.push(
        issue(
          'invalid-reference',
          [...itemPath, 'linkId'],
          `Response linkId ${responseItem.linkId} is not valid at this nesting level.`,
        ),
      )
      continue
    }

    failures.push(
      ...validateMatchedResponseItem(
        questionnaireItem,
        responseItem,
        context,
        itemPath,
      ),
    )
  }

  failures.push(
    ...validateRequiredItems(
      questionnaireItems,
      responseByLinkId,
      context,
      path,
    ),
  )

  return failures
}

/**
 * Strictly parses and cross-checks one Questionnaire/QuestionnaireResponse pair.
 * It validates exact canonical version identity, nesting, answer types, options,
 * portable answer constraints, status-aware required items, expressions, and
 * response text fidelity. Warning-severity target constraints are returned in
 * the successful Result's `warnings`; unexecuted behavior that can change
 * completion acceptance fails closed.
 */
export const preflightQuestionnairePair = (
  questionnaireInput: unknown,
  responseInput: unknown,
  options: QuestionnairePreflightOptions = {},
): Result<QuestionnairePair> => {
  const questionnaire = parseQuestionnaire(questionnaireInput)
  const response = parseQuestionnaireResponse(responseInput)
  const parseFailures = [
    ...(questionnaire.ok ?
      []
    : prefixed(questionnaire.issues, 'questionnaire')),
    ...(response.ok ? [] : prefixed(response.issues, 'response')),
  ]
  if (parseFailures.length > 0) return issues(parseFailures)
  if (!questionnaire.ok || !response.ok) return issues(parseFailures)

  const failures: Issue[] = [
    ...prefixed(
      validateQuestionnaireEnvelope(questionnaire.value),
      'questionnaire',
    ),
    ...prefixed(
      validateQuestionnaireResponseEnvelope(response.value),
      'response',
    ),
  ]
  const expectedCanonical = `${questionnaire.value.url}|${questionnaire.value.version}`
  if (response.value.questionnaire !== expectedCanonical) {
    failures.push(
      issue(
        'value-mismatch',
        ['response', 'questionnaire'],
        'QuestionnaireResponse must name the exact Questionnaire url|version.',
      ),
    )
  }
  const admittedSubjectTypes = questionnaire.value.subjectType ?? []
  const responseSubjectType = questionnaireResponseReferenceType(
    response.value.subject,
    response.value.contained ?? [],
  )
  if (
    response.value.subject !== undefined &&
    (responseSubjectType === undefined ||
      (admittedSubjectTypes.length > 0 &&
        !admittedSubjectTypes.some(
          (admitted) => admitted === responseSubjectType,
        )))
  ) {
    failures.push(
      issue(
        'value-mismatch',
        ['response', 'subject', 'type'],
        'QuestionnaireResponse.subject.type must be admitted by Questionnaire.subjectType.',
      ),
    )
  }
  if (response.value.status === 'entered-in-error') {
    failures.push(
      issue(
        'invalid-choice',
        ['response', 'status'],
        'An entered-in-error response cannot be accepted as answer data.',
      ),
    )
  }

  const valueSets = new Map<string, ResolvedValueSet>()
  for (const valueSet of options.valueSets ?? []) {
    if (valueSets.has(valueSet.canonical)) {
      failures.push(
        issue(
          'duplicate-identifier',
          ['options', 'valueSets'],
          `Resolved ValueSet ${valueSet.canonical} is duplicated.`,
        ),
      )
    } else {
      valueSets.set(valueSet.canonical, valueSet)
    }
  }
  const context: PreflightContext = {
    completed:
      response.value.status !== undefined &&
      completedStatuses.has(response.value.status),
    answers: responseAnswers(
      (response.value.item ??
        []) as unknown as readonly QuestionnaireResponseItemInput[],
    ),
    valueSets,
  }

  const questionnaireItems = questionnaire.value
    .item as unknown as readonly QuestionnaireItemInput[]
  const responseItems = (response.value.item ??
    []) as unknown as readonly QuestionnaireResponseItemInput[]
  failures.push(
    ...prefixed(
      validateQuestionnaireContract(
        questionnaire.value.extension,
        questionnaireItems,
      ),
      'questionnaire',
    ),
  )
  if (context.completed) {
    failures.push(
      ...validateExpressionEngineRequirements(
        questionnaire.value.extension,
        questionnaireItems,
      ),
    )
  }
  failures.push(
    ...validateResponseItems(questionnaireItems, responseItems, context),
  )

  const errors = failures.filter((entry) => entry.severity === 'error')
  const warnings = failures.filter((entry) => entry.severity === 'warning')
  return errors.length === 0 ?
      ok(
        { questionnaire: questionnaire.value, response: response.value },
        warnings,
      )
    : issues(failures)
}
