//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { parseQuestionnaire, parseQuestionnaireResponse } from './parse.js'
import type {
  QuestionnaireItemInput,
  QuestionnairePair,
  QuestionnairePreflightOptions,
  QuestionnaireResponseAnswerInput,
  QuestionnaireResponseItemInput,
} from './types.js'
import { issues, ok, type Issue, type Result } from '../core/index.js'

const ENABLE_WHEN_EXPRESSION =
  'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-enableWhenExpression'

const completedStatuses = new Set(['amended', 'completed'])

const answerKeys = [
  'valueBoolean',
  'valueDecimal',
  'valueInteger',
  'valueDate',
  'valueDateTime',
  'valueTime',
  'valueString',
  'valueUri',
  'valueAttachment',
  'valueCoding',
  'valueQuantity',
] as const

type AnswerKey = (typeof answerKeys)[number]

const issue = (
  code: Issue['code'],
  path: Issue['path'],
  message: string,
): Issue => ({ severity: 'error', code, path, message })

const prefixed = (
  entries: readonly Issue[],
  prefix: string,
): readonly Issue[] =>
  entries.map((entry) => ({ ...entry, path: [prefix, ...entry.path] }))

const populatedAnswerKeys = (
  answer: QuestionnaireResponseAnswerInput,
): readonly AnswerKey[] =>
  answerKeys.filter((key) => Reflect.get(answer, key) !== undefined)

const expectedAnswerKeys = (
  type: QuestionnaireItemInput['type'],
): readonly AnswerKey[] => {
  switch (type) {
    case 'boolean':
      return ['valueBoolean']
    case 'decimal':
      return ['valueDecimal']
    case 'integer':
      return ['valueInteger']
    case 'date':
      return ['valueDate']
    case 'dateTime':
      return ['valueDateTime']
    case 'time':
      return ['valueTime']
    case 'string':
    case 'text':
      return ['valueString']
    case 'url':
      return ['valueUri']
    case 'choice':
      return ['valueCoding']
    case 'open-choice':
      return ['valueCoding', 'valueString']
    case 'attachment':
      return ['valueAttachment']
    case 'quantity':
      return ['valueQuantity']
    case 'display':
    case 'group':
      return []
  }
}

const codingPart = (value: unknown, property: string): unknown =>
  typeof value === 'object' && value !== null ?
    Reflect.get(value, property)
  : undefined

const quantityIdentity = (value: unknown): readonly unknown[] | undefined => {
  const numericValue = codingPart(value, 'value')
  const system = codingPart(value, 'system')
  const code = codingPart(value, 'code')
  return typeof numericValue === 'number' ?
      [numericValue, system, code]
    : undefined
}

const valuesMatch = (
  key: AnswerKey,
  optionValue: unknown,
  answerValue: unknown,
): boolean => {
  if (key !== 'valueCoding') return Object.is(optionValue, answerValue)
  const optionCode = codingPart(optionValue, 'code')
  const answerCode = codingPart(answerValue, 'code')
  return (
    typeof optionCode === 'string' &&
    typeof answerCode === 'string' &&
    codingPart(optionValue, 'system') === codingPart(answerValue, 'system') &&
    optionCode === answerCode
  )
}

const semanticValuesMatch = (left: unknown, right: unknown): boolean => {
  const leftCode = codingPart(left, 'code')
  const rightCode = codingPart(right, 'code')
  if (leftCode !== undefined || rightCode !== undefined) {
    return (
      typeof leftCode === 'string' &&
      typeof rightCode === 'string' &&
      codingPart(left, 'system') === codingPart(right, 'system') &&
      leftCode === rightCode
    )
  }
  const leftQuantity = quantityIdentity(left)
  const rightQuantity = quantityIdentity(right)
  if (leftQuantity !== undefined || rightQuantity !== undefined) {
    return (
      leftQuantity !== undefined &&
      rightQuantity !== undefined &&
      leftQuantity.every((value, index) =>
        Object.is(value, rightQuantity[index]),
      )
    )
  }
  return Object.is(left, right)
}

const enableAnswerKeys = {
  answerBoolean: 'valueBoolean',
  answerCoding: 'valueCoding',
  answerDate: 'valueDate',
  answerDateTime: 'valueDateTime',
  answerDecimal: 'valueDecimal',
  answerInteger: 'valueInteger',
  answerQuantity: 'valueQuantity',
  answerString: 'valueString',
  answerTime: 'valueTime',
} as const

type EnableAnswerKey = keyof typeof enableAnswerKeys

const enableExpectedValue = (
  condition: NonNullable<QuestionnaireItemInput['enableWhen']>[number],
): readonly [AnswerKey, unknown] | undefined => {
  const key = (Object.keys(enableAnswerKeys) as EnableAnswerKey[]).find(
    (candidate) => Reflect.get(condition, candidate) !== undefined,
  )
  return key === undefined ? undefined : (
      [enableAnswerKeys[key], Reflect.get(condition, key)]
    )
}

const responseAnswers = (
  items: readonly QuestionnaireResponseItemInput[],
  values: Map<string, unknown[]> = new Map(),
): ReadonlyMap<string, readonly unknown[]> => {
  for (const item of items) {
    const bucket = values.get(item.linkId) ?? []
    values.set(item.linkId, bucket)
    for (const answer of item.answer ?? []) {
      const key = populatedAnswerKeys(answer)[0]
      if (key !== undefined) bucket.push(Reflect.get(answer, key))
      responseAnswers(answer.item ?? [], values)
    }
    responseAnswers(item.item ?? [], values)
  }
  return values
}

const compare = (
  left: unknown,
  right: unknown,
  operator: '<' | '<=' | '>' | '>=',
): boolean | undefined => {
  if (
    (typeof left !== 'number' || typeof right !== 'number') &&
    (typeof left !== 'string' || typeof right !== 'string')
  ) {
    return undefined
  }
  switch (operator) {
    case '<':
      return left < right
    case '<=':
      return left <= right
    case '>':
      return left > right
    case '>=':
      return left >= right
  }
}

const isRelationalOperator = (
  value: string,
): value is '<' | '<=' | '>' | '>=' =>
  value === '<' || value === '<=' || value === '>' || value === '>='

const evaluateEnableWhen = (
  item: QuestionnaireItemInput,
  answers: ReadonlyMap<string, readonly unknown[]>,
): boolean | undefined => {
  if ((item.enableWhen?.length ?? 0) === 0) return true
  const outcomes: boolean[] = []
  for (const condition of item.enableWhen ?? []) {
    const expected = enableExpectedValue(condition)
    if (expected === undefined) return undefined
    const actualValues = answers.get(condition.question) ?? []
    if (condition.operator === 'exists') {
      if (typeof expected[1] !== 'boolean') return undefined
      outcomes.push(actualValues.length > 0 === expected[1])
    } else if (condition.operator === '=') {
      outcomes.push(
        actualValues.some((value) => semanticValuesMatch(value, expected[1])),
      )
    } else if (condition.operator === '!=') {
      outcomes.push(
        actualValues.some((value) => !semanticValuesMatch(value, expected[1])),
      )
    } else {
      if (!isRelationalOperator(condition.operator)) return undefined
      const operator = condition.operator
      const comparisons = actualValues.map((value) =>
        compare(value, expected[1], operator),
      )
      if (comparisons.includes(undefined)) return undefined
      outcomes.push(comparisons.includes(true))
    }
  }
  return item.enableBehavior === 'any' ?
      outcomes.includes(true)
    : outcomes.every(Boolean)
}

const hasEnableWhenExpression = (item: QuestionnaireItemInput): boolean =>
  item.extension?.some(
    (extension) => extension.url === ENABLE_WHEN_EXPRESSION,
  ) === true

type ResolvedValueSet = NonNullable<
  QuestionnairePreflightOptions['valueSets']
>[number]

interface PreflightContext {
  readonly completed: boolean
  readonly answers: ReadonlyMap<string, readonly unknown[]>
  readonly valueSets: ReadonlyMap<string, ResolvedValueSet>
}

const valueSetMembership = (
  canonical: string,
  coding: unknown,
  context: PreflightContext,
): boolean | undefined => {
  const valueSet = context.valueSets.get(canonical)
  const system = codingPart(coding, 'system')
  const code = codingPart(coding, 'code')
  if (
    valueSet === undefined ||
    typeof system !== 'string' ||
    typeof code !== 'string'
  ) {
    return undefined
  }
  return valueSet.concepts.some(
    (concept) => concept.system === system && concept.code === code,
  )
}

const optionMatches = (
  item: QuestionnaireItemInput,
  answer: QuestionnaireResponseAnswerInput,
): boolean => {
  if (item.answerOption === undefined || item.answerOption.length === 0) {
    return true
  }
  const key = populatedAnswerKeys(answer)[0]
  if (
    key === undefined ||
    (item.type === 'open-choice' && key === 'valueString')
  ) {
    return true
  }

  const answerValue = Reflect.get(answer, key)
  return item.answerOption.some((option) =>
    valuesMatch(key, Reflect.get(option, key), answerValue),
  )
}

const indexQuestionnaireItems = (
  items: readonly QuestionnaireItemInput[],
  index: Map<string, QuestionnaireItemInput>,
  path: ReadonlyArray<number | string> = ['item'],
): readonly Issue[] => {
  const failures: Issue[] = []
  for (const [itemIndex, item] of items.entries()) {
    const itemPath = [...path, itemIndex]
    if (index.has(item.linkId)) {
      failures.push(
        issue(
          'duplicate-identifier',
          [...itemPath, 'linkId'],
          `Questionnaire linkId ${item.linkId} is duplicated.`,
        ),
      )
    } else {
      index.set(item.linkId, item)
    }
    failures.push(
      ...indexQuestionnaireItems(item.item ?? [], index, [...itemPath, 'item']),
    )
  }
  return failures
}

const validateEnableWhenReferences = (
  items: readonly QuestionnaireItemInput[],
  index: ReadonlyMap<string, QuestionnaireItemInput>,
  path: ReadonlyArray<number | string> = ['item'],
): readonly Issue[] => {
  const failures: Issue[] = []
  for (const [itemIndex, item] of items.entries()) {
    const itemPath = [...path, itemIndex]
    for (const [enableIndex, condition] of (item.enableWhen ?? []).entries()) {
      if (!index.has(condition.question)) {
        failures.push(
          issue(
            'invalid-reference',
            [...itemPath, 'enableWhen', enableIndex, 'question'],
            `enableWhen refers to unknown linkId ${condition.question}.`,
          ),
        )
      }
    }
    failures.push(
      ...validateEnableWhenReferences(item.item ?? [], index, [
        ...itemPath,
        'item',
      ]),
    )
  }
  return failures
}

const validateAnswer = (
  questionnaireItem: QuestionnaireItemInput,
  answer: QuestionnaireResponseAnswerInput,
  context: PreflightContext,
  path: ReadonlyArray<number | string>,
): readonly Issue[] => {
  const populated = populatedAnswerKeys(answer)
  const expected = expectedAnswerKeys(questionnaireItem.type)
  const failures: Issue[] = []
  const actual = populated[0]
  if (
    populated.length !== 1 ||
    actual === undefined ||
    !expected.includes(actual)
  ) {
    failures.push(
      issue(
        'invalid-type',
        path,
        `Answer for ${questionnaireItem.linkId} does not match item type ${questionnaireItem.type}.`,
      ),
    )
  } else if (!optionMatches(questionnaireItem, answer)) {
    failures.push(
      issue(
        'value-mismatch',
        path,
        `Answer for ${questionnaireItem.linkId} is not an admitted answerOption.`,
      ),
    )
  } else if (
    actual === 'valueCoding' &&
    questionnaireItem.answerValueSet !== undefined
  ) {
    const membership = valueSetMembership(
      questionnaireItem.answerValueSet,
      Reflect.get(answer, actual),
      context,
    )
    if (membership === undefined) {
      failures.push(
        issue(
          'external-validation-required',
          path,
          `Resolved concepts are required for ${questionnaireItem.answerValueSet}.`,
        ),
      )
    } else if (!membership) {
      failures.push(
        issue(
          'value-mismatch',
          path,
          `Answer for ${questionnaireItem.linkId} is not in its resolved ValueSet.`,
        ),
      )
    }
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
    if (context.completed && hasEnableWhenExpression(questionnaireItem)) {
      failures.push(
        issue(
          'external-validation-required',
          path,
          `FHIRPath enablement must be evaluated for ${questionnaireItem.linkId}.`,
        ),
      )
    }
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
        'Answered response item text must exactly match Questionnaire.item.text.',
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
 * repeats, required unconditional items, and response text fidelity.
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

  const failures: Issue[] = []
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
    completed: completedStatuses.has(response.value.status),
    answers: responseAnswers(response.value.item ?? []),
    valueSets,
  }

  const questionnaireIndex = new Map<string, QuestionnaireItemInput>()
  failures.push(
    ...indexQuestionnaireItems(questionnaire.value.item, questionnaireIndex),
  )
  failures.push(
    ...validateEnableWhenReferences(
      questionnaire.value.item,
      questionnaireIndex,
    ),
  )
  failures.push(
    ...validateResponseItems(
      questionnaire.value.item,
      response.value.item ?? [],
      context,
    ),
  )

  return failures.length === 0 ?
      ok({ questionnaire: questionnaire.value, response: response.value })
    : issues(failures)
}
