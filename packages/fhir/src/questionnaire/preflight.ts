//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  boundIsOrdered,
  extensionValue,
  expectedQuestionnaireAnswerKeys,
  extensionsFor,
  firstExtensionValue,
  QUESTIONNAIRE_EXTENSIONS,
  validateQuestionnaireContract,
} from './contract.js'
import { parseQuestionnaire, parseQuestionnaireResponse } from './parse.js'
import { compareR4Temporal, type R4TemporalKind } from './temporal.js'
import type {
  QuestionnaireItemInput,
  QuestionnairePair,
  QuestionnairePreflightOptions,
  QuestionnaireResponseAnswerInput,
  QuestionnaireResponseItemInput,
} from './types.js'
import {
  issues,
  ok,
  parseAbsoluteUri,
  parseCanonical,
  parseSemVer,
  type Issue,
  type Result,
} from '../core/index.js'
import type { Extension } from '../r4/index.js'

/* eslint-disable sonarjs/no-clear-text-protocols -- FHIR R4 canonicals are normative HTTP URIs. */

const completedStatuses = new Set(['amended', 'completed'])
const VERSION_ALGORITHM =
  'http://hl7.org/fhir/StructureDefinition/artifact-versionAlgorithm'
const VERSION_ALGORITHM_SYSTEM = 'http://hl7.org/fhir/version-algorithm'
const COMPLETION_MODE =
  'http://hl7.org/fhir/StructureDefinition/questionnaireresponse-completionMode'
const PARTICIPATION_MODE =
  'http://terminology.hl7.org/CodeSystem/v3-ParticipationMode'

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

const warning = (
  code: Issue['code'],
  path: Issue['path'],
  message: string,
): Issue => ({ severity: 'warning', code, path, message })

const prefixed = (
  entries: readonly Issue[],
  prefix: string,
): readonly Issue[] =>
  entries.map((entry) => ({ ...entry, path: [prefix, ...entry.path] }))

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
  if (
    !parseCanonical(response.questionnaire).ok ||
    !/^[^|#]+\|[^|#]+$/u.test(response.questionnaire) ||
    !parseSemVer(response.questionnaire.split('|')[1]).ok
  ) {
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

const populatedAnswerKeys = (
  answer: QuestionnaireResponseAnswerInput,
): readonly AnswerKey[] =>
  answerKeys.filter((key) => Reflect.get(answer, key) !== undefined)

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

const temporalKindForAnswer = (key: AnswerKey): R4TemporalKind | undefined => {
  switch (key) {
    case 'valueDate':
      return 'date'
    case 'valueDateTime':
      return 'dateTime'
    case 'valueTime':
      return 'time'
    default:
      return undefined
  }
}

const questionnaireItemTemporalKind = (
  type: QuestionnaireItemInput['type'],
): R4TemporalKind | undefined =>
  type === 'date' || type === 'dateTime' || type === 'time' ? type : undefined

const semanticValuesMatch = (
  left: unknown,
  right: unknown,
  key?: AnswerKey,
): boolean => {
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
  const temporalKind =
    key === undefined ? undefined : temporalKindForAnswer(key)
  if (temporalKind !== undefined) {
    return compareR4Temporal(left, right, temporalKind) === 0
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
  key: AnswerKey,
): boolean | undefined => {
  const temporalKind = temporalKindForAnswer(key)
  if (temporalKind !== undefined) {
    const comparison = compareR4Temporal(left, right, temporalKind)
    if (comparison === undefined) return undefined
    switch (operator) {
      case '<':
        return comparison < 0
      case '<=':
        return comparison <= 0
      case '>':
        return comparison > 0
      case '>=':
        return comparison >= 0
    }
  }
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
        actualValues.some((value) =>
          semanticValuesMatch(value, expected[1], expected[0]),
        ),
      )
    } else if (condition.operator === '!=') {
      outcomes.push(
        actualValues.some(
          (value) => !semanticValuesMatch(value, expected[1], expected[0]),
        ),
      )
    } else {
      if (!isRelationalOperator(condition.operator)) return undefined
      const operator = condition.operator
      const comparisons = actualValues.map((value) =>
        compare(value, expected[1], operator, expected[0]),
      )
      if (comparisons.includes(undefined)) return undefined
      outcomes.push(comparisons.includes(true))
    }
  }
  return item.enableBehavior === 'any' ?
      outcomes.includes(true)
    : outcomes.every(Boolean)
}

type ResolvedValueSet = NonNullable<
  QuestionnairePreflightOptions['valueSets']
>[number]

interface PreflightContext {
  readonly completed: boolean
  readonly answers: ReadonlyMap<string, readonly unknown[]>
  readonly valueSets: ReadonlyMap<string, ResolvedValueSet>
}

const targetConstraintKey = (extension: Extension): string => {
  const keyPart = extension.extension?.find((part) => part.url === 'key')
  const key = extensionValue(keyPart)
  return key?.key === 'valueId' && typeof key.value === 'string' ?
      key.value
    : 'targetConstraint'
}

const targetConstraintSeverity = (extension: Extension) => {
  const severityPart = extension.extension?.find(
    (part) => part.url === 'severity',
  )
  const severity = extensionValue(severityPart)
  return severity?.key === 'valueCode' && severity.value === 'warning' ?
      'warning'
    : 'error'
}

const validateExpressionEngineRequirements = (
  rootExtensions: readonly Extension[] | undefined,
  items: readonly QuestionnaireItemInput[],
): readonly Issue[] => {
  const failures: Issue[] = []
  const checkExtensions = (
    extensions: readonly Extension[] | undefined,
    path: ReadonlyArray<number | string>,
    linkId?: string,
  ) => {
    for (const extension of extensions ?? []) {
      if (extension.url === QUESTIONNAIRE_EXTENSIONS.targetConstraint) {
        const createFinding =
          targetConstraintSeverity(extension) === 'warning' ? warning : issue
        failures.push(
          createFinding(
            'external-validation-required',
            path,
            `FHIRPath must evaluate ${targetConstraintKey(extension)} before a completed or amended response can be accepted.`,
          ),
        )
      }
      if (extension.url === QUESTIONNAIRE_EXTENSIONS.enableWhenExpression) {
        failures.push(
          issue(
            'external-validation-required',
            path,
            `FHIRPath enablement must be evaluated for ${linkId ?? 'this item'}.`,
          ),
        )
      }
      if (extension.url === QUESTIONNAIRE_EXTENSIONS.calculatedExpression) {
        failures.push(
          issue(
            'external-validation-required',
            path,
            `calculatedExpression output for ${linkId ?? 'this element'} must be recomputed by a conforming SDC FHIRPath engine.`,
          ),
        )
      }
    }
  }
  checkExtensions(rootExtensions, ['response'])
  const visit = (
    candidates: readonly QuestionnaireItemInput[],
    path: ReadonlyArray<number | string>,
  ) => {
    for (const [index, item] of candidates.entries()) {
      const itemPath = [...path, index]
      checkExtensions(item.extension, itemPath, item.linkId)
      visit(item.item ?? [], [...itemPath, 'item'])
    }
  }
  visit(items, ['questionnaire', 'item'])
  return failures
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

const selectedInlineOption = (
  item: QuestionnaireItemInput,
  answer: QuestionnaireResponseAnswerInput,
) => {
  const key = populatedAnswerKeys(answer)[0]
  if (key === undefined) return undefined
  const answerValue = Reflect.get(answer, key)
  return item.answerOption?.find((option) =>
    valuesMatch(key, Reflect.get(option, key), answerValue),
  )
}

const optionIsExclusive = (option: {
  readonly extension?: readonly unknown[]
}) =>
  (option.extension ?? []).some((candidate) => {
    if (typeof candidate !== 'object' || candidate === null) return false
    if (
      Reflect.get(candidate, 'url') !== QUESTIONNAIRE_EXTENSIONS.optionExclusive
    ) {
      return false
    }
    return Reflect.get(candidate, 'valueBoolean') === true
  })

const codeAndSystemMatch = (left: unknown, right: unknown): boolean =>
  typeof codingPart(left, 'code') === 'string' &&
  codingPart(left, 'system') === codingPart(right, 'system') &&
  codingPart(left, 'code') === codingPart(right, 'code')

const decimalPlaces = (value: number): number => {
  const representation = value.toString().toLowerCase()
  const [coefficient = '', exponentText = '0'] = representation.split('e')
  const exponent = Number(exponentText)
  const fractionLength = coefficient.split('.')[1]?.length ?? 0
  return Math.max(0, fractionLength - exponent)
}

const textLength = (value: string): number => Array.from(value).length

const validateTextLength = (
  item: QuestionnaireItemInput,
  value: unknown,
  path: ReadonlyArray<number | string>,
): readonly Issue[] => {
  if (typeof value !== 'string') return []
  const minimum = firstExtensionValue(
    item,
    QUESTIONNAIRE_EXTENSIONS.minLength,
  )?.value
  const length = textLength(value)
  const failures: Issue[] = []
  if (typeof minimum === 'number' && length < minimum) {
    failures.push(
      issue('out-of-range', path, 'Answer is shorter than minLength.'),
    )
  }
  if (item.maxLength !== undefined && length > item.maxLength) {
    failures.push(issue('out-of-range', path, 'Answer exceeds maxLength.'))
  }
  return failures
}

const validateDecimalPlaces = (
  item: QuestionnaireItemInput,
  value: unknown,
  path: ReadonlyArray<number | string>,
): readonly Issue[] => {
  const maximum = firstExtensionValue(
    item,
    QUESTIONNAIRE_EXTENSIONS.maxDecimalPlaces,
  )?.value
  return (
      typeof value === 'number' &&
        typeof maximum === 'number' &&
        decimalPlaces(value) > maximum
    ) ?
      [issue('out-of-range', path, 'Answer exceeds maxDecimalPlaces.')]
    : []
}

const validateBounds = (
  item: QuestionnaireItemInput,
  value: unknown,
  path: ReadonlyArray<number | string>,
): readonly Issue[] => {
  const failures: Issue[] = []
  for (const [url, direction, label] of [
    [QUESTIONNAIRE_EXTENSIONS.minValue, 'minimum', 'value'],
    [QUESTIONNAIRE_EXTENSIONS.maxValue, 'maximum', 'value'],
    [QUESTIONNAIRE_EXTENSIONS.minQuantity, 'minimum', 'quantity'],
    [QUESTIONNAIRE_EXTENSIONS.maxQuantity, 'maximum', 'quantity'],
  ] as const) {
    const bound = firstExtensionValue(item, url)?.value
    if (bound === undefined) continue
    const valid =
      direction === 'minimum' ?
        boundIsOrdered(bound, value, questionnaireItemTemporalKind(item.type))
      : boundIsOrdered(value, bound, questionnaireItemTemporalKind(item.type))
    if (valid !== true) {
      failures.push(
        issue(
          'out-of-range',
          path,
          `Answer violates the ${direction} ${label} bound or uses an incomparable unit.`,
        ),
      )
    }
  }
  return failures
}

const validateQuantityUnits = (
  item: QuestionnaireItemInput,
  value: unknown,
  context: PreflightContext,
  path: ReadonlyArray<number | string>,
): readonly Issue[] => {
  const failures: Issue[] = []
  const options = extensionsFor(
    item,
    QUESTIONNAIRE_EXTENSIONS.unitOption,
  ).flatMap((extension) => {
    const option = extensionValue(extension)
    return option?.key === 'valueCoding' ? [option.value] : []
  })
  if (
    options.length > 0 &&
    !options.some((option) => codeAndSystemMatch(value, option))
  ) {
    failures.push(
      issue('value-mismatch', path, 'Quantity unit is not one of unitOption.'),
    )
  }
  const valueSet = firstExtensionValue(
    item,
    QUESTIONNAIRE_EXTENSIONS.unitValueSet,
  )
  if (
    valueSet?.key === 'valueCanonical' &&
    typeof valueSet.value === 'string'
  ) {
    const membership = valueSetMembership(
      valueSet.value,
      {
        system: codingPart(value, 'system'),
        code: codingPart(value, 'code'),
      },
      context,
    )
    if (membership === undefined) {
      failures.push(
        issue(
          'external-validation-required',
          path,
          `Resolved concepts are required for ${valueSet.value}.`,
        ),
      )
    } else if (!membership) {
      failures.push(
        issue(
          'value-mismatch',
          path,
          'Quantity unit is not certified by unitValueSet.',
        ),
      )
    }
  }
  return failures
}

const validateAttachment = (
  item: QuestionnaireItemInput,
  value: unknown,
  path: ReadonlyArray<number | string>,
): readonly Issue[] => {
  const failures: Issue[] = []
  const allowedTypes = new Set(
    extensionsFor(item, QUESTIONNAIRE_EXTENSIONS.mimeType).flatMap(
      (extension) => {
        const allowed = extensionValue(extension)
        return (
            allowed?.key === 'valueCode' && typeof allowed.value === 'string'
          ) ?
            [allowed.value]
          : []
      },
    ),
  )
  const contentType = codingPart(value, 'contentType')
  if (allowedTypes.size > 0 && !allowedTypes.has(String(contentType))) {
    failures.push(
      issue('value-mismatch', path, 'Attachment contentType is not allowed.'),
    )
  }
  const maximumSize = firstExtensionValue(
    item,
    QUESTIONNAIRE_EXTENSIONS.maxSize,
  )?.value
  const size = codingPart(value, 'size')
  if (
    typeof maximumSize === 'number' &&
    (typeof size !== 'number' || !Number.isInteger(size) || size > maximumSize)
  ) {
    failures.push(
      issue(
        'out-of-range',
        path,
        'Attachment exceeds maxSize or does not declare size.',
      ),
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
  const expected = expectedQuestionnaireAnswerKeys(questionnaireItem.type)
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
    return failures
  }

  const value = Reflect.get(answer, actual)
  if (!optionMatches(questionnaireItem, answer)) {
    failures.push(
      issue(
        'value-mismatch',
        path,
        `Answer for ${questionnaireItem.linkId} is not an admitted answerOption.`,
      ),
    )
  }
  if (
    actual === 'valueCoding' &&
    questionnaireItem.answerValueSet !== undefined
  ) {
    const membership = valueSetMembership(
      questionnaireItem.answerValueSet,
      value,
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
  if (actual === 'valueString' || actual === 'valueUri') {
    failures.push(...validateTextLength(questionnaireItem, value, path))
  }
  if (actual === 'valueDecimal') {
    failures.push(...validateDecimalPlaces(questionnaireItem, value, path))
  }
  failures.push(...validateBounds(questionnaireItem, value, path))
  if (actual === 'valueQuantity') {
    failures.push(
      ...validateQuantityUnits(questionnaireItem, value, context, path),
    )
  }
  if (actual === 'valueAttachment') {
    failures.push(...validateAttachment(questionnaireItem, value, path))
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
