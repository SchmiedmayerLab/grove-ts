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
} from './contract.js'
import { issue, warning } from './preflight-diagnostics.js'
import { compareR4Temporal, type R4TemporalKind } from './temporal.js'
import type {
  QuestionnaireItemInput,
  QuestionnairePreflightOptions,
  QuestionnaireResponseAnswerInput,
  QuestionnaireResponseItemInput,
} from './types.js'
import type { Issue } from '../core/index.js'
import type { Extension } from '../r4/index.js'

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

const populatedAnswerKeys = (
  answer: QuestionnaireResponseAnswerInput,
): readonly AnswerKey[] =>
  answerKeys.filter((key) => Reflect.get(answer, key) !== undefined)

export const codingPart = (value: unknown, property: string): unknown =>
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

export const responseAnswers = (
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

export const evaluateEnableWhen = (
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

export type ResolvedValueSet = NonNullable<
  QuestionnairePreflightOptions['valueSets']
>[number]

export interface PreflightContext {
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

export const validateExpressionEngineRequirements = (
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

type QuestionnaireAnswerOption = NonNullable<
  QuestionnaireItemInput['answerOption']
>[number]

export const selectedInlineOption = (
  item: QuestionnaireItemInput,
  answer: QuestionnaireResponseAnswerInput,
): QuestionnaireAnswerOption | undefined => {
  const key = populatedAnswerKeys(answer)[0]
  if (key === undefined) return undefined
  const answerValue = Reflect.get(answer, key)
  return item.answerOption?.find((option) =>
    valuesMatch(key, Reflect.get(option, key), answerValue),
  )
}

export const optionIsExclusive = (option: {
  readonly extension?: readonly unknown[]
}): boolean =>
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

export const validateAnswer = (
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
