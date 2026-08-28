//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  QUESTIONNAIRE_EXTENSIONS,
  expectedAnswerOptionKeys,
  expectedQuestionnaireAnswerKeys,
  extensionValue,
  extensionsFor,
  firstExtensionValue,
  issue,
  populatedQuestionnaireAnswerKey,
  temporalValidatorForItem,
  validateBoundPair,
  validateExpressionScope,
  type ExtensionElement,
} from './questionnaire-extensions.js'
import type {
  QuestionnaireItemInput,
  QuestionnaireResponseAnswerInput,
  QuestionnaireResponseItemInput,
} from './types.js'
import type { Issue } from '../core/index.js'
import type { Extension } from '../r4/index.js'

export {
  QUESTIONNAIRE_EXTENSIONS,
  boundIsOrdered,
  expectedQuestionnaireAnswerKeys,
  extensionValue,
  extensionsFor,
  firstExtensionValue,
  type ExtensionValue,
  type QuestionnaireAnswerValueKey,
} from './questionnaire-extensions.js'

const extensionCount = (item: ExtensionElement, url: string): number =>
  extensionsFor(item, url).length

interface KnownExtensionRule {
  readonly url: string
  readonly valueKeys: readonly string[]
  readonly repeatable?: boolean
}

const knownItemExtensionRules: readonly KnownExtensionRule[] = [
  {
    url: QUESTIONNAIRE_EXTENSIONS.hidden,
    valueKeys: ['valueBoolean'],
  },
  {
    url: QUESTIONNAIRE_EXTENSIONS.enableWhenExpression,
    valueKeys: ['valueExpression'],
  },
  {
    url: QUESTIONNAIRE_EXTENSIONS.initialExpression,
    valueKeys: ['valueExpression'],
  },
  {
    url: QUESTIONNAIRE_EXTENSIONS.calculatedExpression,
    valueKeys: ['valueExpression'],
  },
  {
    url: QUESTIONNAIRE_EXTENSIONS.maxDecimalPlaces,
    valueKeys: ['valueInteger'],
  },
  { url: QUESTIONNAIRE_EXTENSIONS.minLength, valueKeys: ['valueInteger'] },
  {
    url: QUESTIONNAIRE_EXTENSIONS.minValue,
    valueKeys: [
      'valueDate',
      'valueDateTime',
      'valueDecimal',
      'valueInteger',
      'valueTime',
    ],
  },
  {
    url: QUESTIONNAIRE_EXTENSIONS.maxValue,
    valueKeys: [
      'valueDate',
      'valueDateTime',
      'valueDecimal',
      'valueInteger',
      'valueTime',
    ],
  },
  {
    url: QUESTIONNAIRE_EXTENSIONS.minQuantity,
    valueKeys: ['valueQuantity'],
  },
  {
    url: QUESTIONNAIRE_EXTENSIONS.maxQuantity,
    valueKeys: ['valueQuantity'],
  },
  {
    url: QUESTIONNAIRE_EXTENSIONS.questionnaireUnit,
    valueKeys: ['valueCoding'],
  },
  {
    url: QUESTIONNAIRE_EXTENSIONS.unitOption,
    valueKeys: ['valueCoding'],
    repeatable: true,
  },
  {
    url: QUESTIONNAIRE_EXTENSIONS.unitValueSet,
    valueKeys: ['valueCanonical'],
  },
  {
    url: QUESTIONNAIRE_EXTENSIONS.mimeType,
    valueKeys: ['valueCode'],
    repeatable: true,
  },
  { url: QUESTIONNAIRE_EXTENSIONS.maxSize, valueKeys: ['valueDecimal'] },
  { url: QUESTIONNAIRE_EXTENSIONS.minOccurs, valueKeys: ['valueInteger'] },
  { url: QUESTIONNAIRE_EXTENSIONS.maxOccurs, valueKeys: ['valueInteger'] },
]

const validateKnownExtensionRule = (
  element: ExtensionElement,
  path: ReadonlyArray<number | string>,
  rule: KnownExtensionRule,
): readonly Issue[] => {
  const failures: Issue[] = []
  const matching = extensionsFor(element, rule.url)
  if (rule.repeatable !== true && matching.length > 1) {
    failures.push(
      issue(
        'duplicate-identifier',
        [...path, 'extension'],
        `Extension ${rule.url} may occur at most once.`,
      ),
    )
  }
  for (const [index, extension] of matching.entries()) {
    const value = extensionValue(extension)
    if (value === undefined || !rule.valueKeys.includes(value.key)) {
      failures.push(
        issue(
          'invalid-type',
          [...path, 'extension', index],
          `Extension ${rule.url} requires ${rule.valueKeys.join(' or ')}.`,
        ),
      )
    }
  }
  return failures
}

const itemWeightRule: KnownExtensionRule = {
  url: QUESTIONNAIRE_EXTENSIONS.itemWeight,
  valueKeys: ['valueDecimal'],
}

const optionExclusiveRule: KnownExtensionRule = {
  url: QUESTIONNAIRE_EXTENSIONS.optionExclusive,
  valueKeys: ['valueBoolean'],
}

const validateKnownItemExtensions = (
  item: QuestionnaireItemInput,
  path: ReadonlyArray<number | string>,
): readonly Issue[] => {
  const failures: Issue[] = []
  for (const rule of knownItemExtensionRules) {
    failures.push(...validateKnownExtensionRule(item, path, rule))
  }

  for (const [optionIndex, option] of (item.answerOption ?? []).entries()) {
    const optionPath = [...path, 'answerOption', optionIndex]
    failures.push(
      ...validateKnownExtensionRule(option, optionPath, optionExclusiveRule),
      ...validateKnownExtensionRule(option, optionPath, itemWeightRule),
    )
    const coding: unknown = Reflect.get(option, 'valueCoding')
    if (typeof coding === 'object' && coding !== null) {
      failures.push(
        ...validateKnownExtensionRule(
          coding,
          [...optionPath, 'valueCoding'],
          itemWeightRule,
        ),
      )
    }
  }
  return failures
}

const validateAuthoredItemValues = (
  item: QuestionnaireItemInput,
  path: ReadonlyArray<number | string>,
): readonly Issue[] => {
  const failures: Issue[] = []
  const initialKeys = expectedQuestionnaireAnswerKeys(item.type)
  for (const [index, initial] of (item.initial ?? []).entries()) {
    const key = populatedQuestionnaireAnswerKey(initial)
    if (key === undefined || !initialKeys.includes(key)) {
      failures.push(
        issue(
          'invalid-type',
          [...path, 'initial', index],
          `Initial value does not match item type ${item.type}.`,
        ),
      )
    }
  }

  const optionKeys = expectedAnswerOptionKeys(item.type)
  for (const [index, option] of (item.answerOption ?? []).entries()) {
    const key = populatedQuestionnaireAnswerKey(option)
    if (key === undefined || !optionKeys.includes(key)) {
      failures.push(
        issue(
          'invalid-type',
          [...path, 'answerOption', index],
          `answerOption value does not match item type ${item.type}.`,
        ),
      )
    }
  }
  return failures
}

const validateItemIdentityAndStructure = (
  item: QuestionnaireItemInput,
  path: ReadonlyArray<number | string>,
  seenLinkIds: Set<string>,
): readonly Issue[] => {
  const failures: Issue[] = []
  if (item.linkId.trim() === '') {
    failures.push(
      issue(
        'missing-required',
        [...path, 'linkId'],
        'Questionnaire linkId is required.',
      ),
    )
  } else if (seenLinkIds.has(item.linkId)) {
    failures.push(
      issue(
        'duplicate-identifier',
        [...path, 'linkId'],
        `Questionnaire linkId ${item.linkId} is duplicated.`,
      ),
    )
  } else {
    seenLinkIds.add(item.linkId)
  }
  if (Array.from(item.linkId).length > 255) {
    failures.push(
      issue(
        'out-of-range',
        [...path, 'linkId'],
        'Questionnaire linkId cannot exceed 255 Unicode code points.',
      ),
    )
  }
  if (item.type !== 'group' && (item.text?.trim() ?? '') === '') {
    failures.push(
      issue(
        'missing-required',
        [...path, 'text'],
        'Every non-group item requires text.',
      ),
    )
  }
  if (item.type === 'group' && (item.item?.length ?? 0) === 0) {
    failures.push(
      issue(
        'missing-required',
        [...path, 'item'],
        'A group Questionnaire item requires at least one nested item.',
      ),
    )
  }
  if (item.type === 'display' && (item.item?.length ?? 0) > 0) {
    failures.push(
      issue(
        'invalid-choice',
        [...path, 'item'],
        'A display Questionnaire item cannot have nested items.',
      ),
    )
  }
  if (
    item.type === 'display' &&
    (item.required !== undefined || item.repeats !== undefined)
  ) {
    failures.push(
      issue(
        'invalid-choice',
        path,
        'A display Questionnaire item cannot declare required or repeats.',
      ),
    )
  }
  if (item.type === 'display' && (item.code?.length ?? 0) > 0) {
    failures.push(
      issue(
        'invalid-choice',
        [...path, 'code'],
        'A display Questionnaire item cannot declare code.',
      ),
    )
  }
  if (item.type === 'display' && item.readOnly !== undefined) {
    failures.push(
      issue(
        'invalid-choice',
        [...path, 'readOnly'],
        'A display Questionnaire item cannot declare readOnly.',
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
        'Only choice, open-choice, and attachment items may repeat.',
      ),
    )
  }
  return failures
}

const validateItemEnablement = (
  item: QuestionnaireItemInput,
  path: ReadonlyArray<number | string>,
): readonly Issue[] => {
  const failures: Issue[] = []
  if ((item.enableWhen?.length ?? 0) > 1 && item.enableBehavior === undefined) {
    failures.push(
      issue(
        'missing-required',
        [...path, 'enableBehavior'],
        'Multiple enableWhen rules require enableBehavior.',
      ),
    )
  }
  for (const [index, condition] of (item.enableWhen ?? []).entries()) {
    if (
      condition.operator === 'exists' &&
      Reflect.get(condition, 'answerBoolean') === undefined
    ) {
      failures.push(
        issue(
          'invalid-type',
          [...path, 'enableWhen', index],
          'The exists enableWhen operator requires answerBoolean.',
        ),
      )
    }
  }
  if (
    (item.enableWhen?.length ?? 0) > 0 &&
    extensionCount(item, QUESTIONNAIRE_EXTENSIONS.enableWhenExpression) > 0
  ) {
    failures.push(
      issue(
        'invalid-choice',
        path,
        'Use either enableWhen or enableWhenExpression.',
      ),
    )
  }
  if (
    (item.initial?.length ?? 0) > 0 &&
    extensionCount(item, QUESTIONNAIRE_EXTENSIONS.initialExpression) > 0
  ) {
    failures.push(
      issue('invalid-choice', path, 'Use either initial or initialExpression.'),
    )
  }
  return failures
}

const validateItemAnswerSources = (
  item: QuestionnaireItemInput,
  path: ReadonlyArray<number | string>,
  targetKeys: Set<string>,
): readonly Issue[] => {
  const failures: Issue[] = []
  if (
    (item.answerOption?.length ?? 0) > 0 &&
    item.answerValueSet !== undefined
  ) {
    failures.push(
      issue(
        'invalid-choice',
        path,
        'Use answerOption or answerValueSet, not both.',
      ),
    )
  }
  if (
    (item.answerOption?.length ?? 0) > 0 &&
    ![
      'choice',
      'date',
      'dateTime',
      'decimal',
      'integer',
      'open-choice',
      'quantity',
      'string',
      'time',
    ].includes(item.type)
  ) {
    failures.push(
      issue(
        'invalid-choice',
        [...path, 'answerOption'],
        'answerOption does not match this item type.',
      ),
    )
  }
  if (
    item.answerValueSet !== undefined &&
    !['choice', 'open-choice'].includes(item.type)
  ) {
    failures.push(
      issue(
        'invalid-choice',
        [...path, 'answerValueSet'],
        'answerValueSet is only permitted for choice and open-choice items.',
      ),
    )
  }
  if ((item.answerOption?.length ?? 0) > 0 && (item.initial?.length ?? 0) > 0) {
    failures.push(
      issue('invalid-choice', path, 'Use answerOption or initial, not both.'),
    )
  }
  if (
    ['display', 'group'].includes(item.type) &&
    (item.initial?.length ?? 0) > 0
  ) {
    failures.push(
      issue(
        'invalid-choice',
        [...path, 'initial'],
        'Group and display items cannot declare initial values.',
      ),
    )
  }
  if ((item.initial?.length ?? 0) > 1 && item.repeats !== true) {
    failures.push(
      issue(
        'invalid-choice',
        [...path, 'initial'],
        'Multiple initial values require repeats=true.',
      ),
    )
  }
  if (extensionCount(item, QUESTIONNAIRE_EXTENSIONS.styleSensitive) > 0) {
    failures.push(
      issue(
        'invalid-code',
        [...path, 'extension'],
        'styleSensitive is not supported.',
      ),
    )
  }
  failures.push(...validateExpressionScope(item, path, targetKeys))
  return failures
}

const validateTextAndDecimalConstraints = (
  item: QuestionnaireItemInput,
  path: ReadonlyArray<number | string>,
): readonly Issue[] => {
  const failures: Issue[] = []
  const minimumLength = firstExtensionValue(
    item,
    QUESTIONNAIRE_EXTENSIONS.minLength,
  )
  const hasLength = item.maxLength !== undefined || minimumLength !== undefined
  if (
    hasLength &&
    !['open-choice', 'string', 'text', 'url'].includes(item.type)
  ) {
    failures.push(
      issue(
        'invalid-choice',
        path,
        'Length constraints require a textual item.',
      ),
    )
  }
  if (
    minimumLength !== undefined &&
    (minimumLength.key !== 'valueInteger' ||
      typeof minimumLength.value !== 'number' ||
      !Number.isInteger(minimumLength.value) ||
      minimumLength.value < 0 ||
      (item.maxLength !== undefined && minimumLength.value > item.maxLength))
  ) {
    failures.push(
      issue(
        'out-of-range',
        path,
        'Text length bounds are invalid or reversed.',
      ),
    )
  }
  const decimalPlaces = firstExtensionValue(
    item,
    QUESTIONNAIRE_EXTENSIONS.maxDecimalPlaces,
  )
  if (decimalPlaces !== undefined && item.type !== 'decimal') {
    failures.push(
      issue(
        'invalid-choice',
        path,
        'maxDecimalPlaces requires a decimal item.',
      ),
    )
  }
  if (
    decimalPlaces !== undefined &&
    (decimalPlaces.key !== 'valueInteger' ||
      typeof decimalPlaces.value !== 'number' ||
      !Number.isInteger(decimalPlaces.value) ||
      decimalPlaces.value < 0)
  ) {
    failures.push(
      issue(
        'out-of-range',
        path,
        'maxDecimalPlaces must be a non-negative integer.',
      ),
    )
  }
  return failures
}

const validatePrimitiveValueBounds = (
  item: QuestionnaireItemInput,
  path: ReadonlyArray<number | string>,
): readonly Issue[] => {
  const failures: Issue[] = []
  const minimumValue = firstExtensionValue(
    item,
    QUESTIONNAIRE_EXTENSIONS.minValue,
  )
  const maximumValue = firstExtensionValue(
    item,
    QUESTIONNAIRE_EXTENSIONS.maxValue,
  )
  if (
    (minimumValue !== undefined || maximumValue !== undefined) &&
    !['date', 'dateTime', 'decimal', 'integer', 'time'].includes(item.type)
  ) {
    failures.push(
      issue(
        'invalid-choice',
        path,
        'Generic value bounds do not match the item type.',
      ),
    )
  }
  const boundKeyByType: Partial<
    Record<QuestionnaireItemInput['type'], string>
  > = {
    date: 'valueDate',
    dateTime: 'valueDateTime',
    decimal: 'valueDecimal',
    integer: 'valueInteger',
    time: 'valueTime',
  }
  const expectedBoundKey = boundKeyByType[item.type]
  if (
    expectedBoundKey !== undefined &&
    [minimumValue, maximumValue].some(
      (entry) => entry !== undefined && entry.key !== expectedBoundKey,
    )
  ) {
    failures.push(
      issue('invalid-type', path, 'Bound datatype must match the item type.'),
    )
    return failures
  }
  const temporalValidator = temporalValidatorForItem(item.type)
  if (
    temporalValidator !== undefined &&
    [minimumValue, maximumValue].some(
      (entry) => entry !== undefined && !temporalValidator(entry.value),
    )
  ) {
    failures.push(
      issue(
        'invalid-date-time',
        path,
        `Temporal bounds must be valid FHIR R4 ${item.type} primitives.`,
      ),
    )
  }
  failures.push(
    ...validateBoundPair(
      item,
      path,
      QUESTIONNAIRE_EXTENSIONS.minValue,
      QUESTIONNAIRE_EXTENSIONS.maxValue,
    ),
  )
  return failures
}

const validateQuantityAndUnitConstraints = (
  item: QuestionnaireItemInput,
  path: ReadonlyArray<number | string>,
): readonly Issue[] => {
  const failures: Issue[] = []
  const minimumQuantity = firstExtensionValue(
    item,
    QUESTIONNAIRE_EXTENSIONS.minQuantity,
  )
  const maximumQuantity = firstExtensionValue(
    item,
    QUESTIONNAIRE_EXTENSIONS.maxQuantity,
  )
  if (
    (minimumQuantity !== undefined || maximumQuantity !== undefined) &&
    item.type !== 'quantity'
  ) {
    failures.push(
      issue('invalid-choice', path, 'Quantity bounds require a quantity item.'),
    )
  }
  if (
    [minimumQuantity, maximumQuantity].some(
      (entry) => entry !== undefined && entry.key !== 'valueQuantity',
    )
  ) {
    failures.push(
      issue('invalid-type', path, 'Quantity bounds require valueQuantity.'),
    )
  } else {
    failures.push(
      ...validateBoundPair(
        item,
        path,
        QUESTIONNAIRE_EXTENSIONS.minQuantity,
        QUESTIONNAIRE_EXTENSIONS.maxQuantity,
      ),
    )
  }
  const fixedUnits = extensionsFor(
    item,
    QUESTIONNAIRE_EXTENSIONS.questionnaireUnit,
  )
  const unitOptions = extensionsFor(item, QUESTIONNAIRE_EXTENSIONS.unitOption)
  const unitValueSets = extensionsFor(
    item,
    QUESTIONNAIRE_EXTENSIONS.unitValueSet,
  )
  if (fixedUnits.length > 0 && !['decimal', 'integer'].includes(item.type)) {
    failures.push(
      issue(
        'invalid-choice',
        path,
        'A fixed unit requires an integer or decimal item.',
      ),
    )
  }
  if (
    (unitOptions.length > 0 || unitValueSets.length > 0) &&
    item.type !== 'quantity'
  ) {
    failures.push(
      issue(
        'invalid-choice',
        path,
        'Selectable units require a quantity item.',
      ),
    )
  }
  if (unitOptions.length > 0 && unitValueSets.length > 0) {
    failures.push(
      issue(
        'invalid-choice',
        path,
        'Use unitOption or unitValueSet, not both.',
      ),
    )
  }
  return failures
}

const validateAttachmentAndOccurrenceConstraints = (
  item: QuestionnaireItemInput,
  path: ReadonlyArray<number | string>,
): readonly Issue[] => {
  const failures: Issue[] = []
  const mimeTypes = extensionsFor(item, QUESTIONNAIRE_EXTENSIONS.mimeType)
  const maximumSize = firstExtensionValue(
    item,
    QUESTIONNAIRE_EXTENSIONS.maxSize,
  )
  if (
    (mimeTypes.length > 0 || maximumSize !== undefined) &&
    item.type !== 'attachment'
  ) {
    failures.push(
      issue(
        'invalid-choice',
        path,
        'Attachment constraints require an attachment item.',
      ),
    )
  }
  if (
    maximumSize !== undefined &&
    (maximumSize.key !== 'valueDecimal' ||
      typeof maximumSize.value !== 'number' ||
      !Number.isFinite(maximumSize.value) ||
      maximumSize.value <= 0)
  ) {
    failures.push(
      issue('out-of-range', path, 'Maximum attachment size must be positive.'),
    )
  }
  const minimumOccurs = firstExtensionValue(
    item,
    QUESTIONNAIRE_EXTENSIONS.minOccurs,
  )
  const maximumOccurs = firstExtensionValue(
    item,
    QUESTIONNAIRE_EXTENSIONS.maxOccurs,
  )
  if (
    (minimumOccurs !== undefined || maximumOccurs !== undefined) &&
    item.repeats !== true
  ) {
    failures.push(
      issue(
        'invalid-choice',
        path,
        'Occurrence constraints require repeats=true.',
      ),
    )
  }
  const minimumOccursValue = minimumOccurs?.value
  const maximumOccursValue = maximumOccurs?.value
  if (
    (minimumOccurs !== undefined &&
      (minimumOccurs.key !== 'valueInteger' ||
        typeof minimumOccursValue !== 'number' ||
        !Number.isInteger(minimumOccursValue) ||
        minimumOccursValue < 0)) ||
    (maximumOccurs !== undefined &&
      (maximumOccurs.key !== 'valueInteger' ||
        typeof maximumOccursValue !== 'number' ||
        !Number.isInteger(maximumOccursValue) ||
        maximumOccursValue < 1)) ||
    (typeof minimumOccursValue === 'number' &&
      typeof maximumOccursValue === 'number' &&
      minimumOccursValue > maximumOccursValue)
  ) {
    failures.push(
      issue('out-of-range', path, 'Occurrence bounds are invalid or reversed.'),
    )
  }
  return failures
}

const validateItem = (
  item: QuestionnaireItemInput,
  path: ReadonlyArray<number | string>,
  seenLinkIds: Set<string>,
  targetKeys: Set<string>,
): readonly Issue[] => {
  const failures: Issue[] = []
  failures.push(...validateKnownItemExtensions(item, path))
  failures.push(...validateAuthoredItemValues(item, path))
  failures.push(...validateItemIdentityAndStructure(item, path, seenLinkIds))
  failures.push(...validateItemEnablement(item, path))
  failures.push(...validateItemAnswerSources(item, path, targetKeys))
  failures.push(...validateTextAndDecimalConstraints(item, path))
  failures.push(...validatePrimitiveValueBounds(item, path))
  failures.push(...validateQuantityAndUnitConstraints(item, path))
  failures.push(...validateAttachmentAndOccurrenceConstraints(item, path))
  for (const [index, child] of (item.item ?? []).entries()) {
    failures.push(
      ...validateItem(child, [...path, 'item', index], seenLinkIds, targetKeys),
    )
  }
  return failures
}

const validateQuestionnaireResponseAnswerContract = (
  answer: QuestionnaireResponseAnswerInput,
  path: ReadonlyArray<number | string>,
): readonly Issue[] => {
  const failures: Issue[] = [
    ...validateKnownExtensionRule(answer, path, itemWeightRule),
  ]
  const coding: unknown = Reflect.get(answer, 'valueCoding')
  if (typeof coding === 'object' && coding !== null) {
    failures.push(
      ...validateKnownExtensionRule(
        coding,
        [...path, 'valueCoding'],
        itemWeightRule,
      ),
    )
  }
  failures.push(
    ...validateQuestionnaireResponseItemContract(answer.item ?? [], [
      ...path,
      'item',
    ]),
  )
  return failures
}

/** Standalone invariants owned by the Grove QuestionnaireResponse profile. */
export const validateQuestionnaireResponseItemContract = (
  items: readonly QuestionnaireResponseItemInput[],
  path: ReadonlyArray<number | string> = ['item'],
): readonly Issue[] => {
  const failures: Issue[] = []
  const answeredLinkIds = new Set<string>()
  for (const [itemIndex, item] of items.entries()) {
    const itemPath = [...path, itemIndex]
    const answered = (item.answer?.length ?? 0) > 0
    if (answered && (item.text?.trim() ?? '') === '') {
      failures.push(
        issue(
          'missing-required',
          [...itemPath, 'text'],
          'Every answered response item must repeat the question text.',
        ),
      )
    }
    if (answered && answeredLinkIds.has(item.linkId)) {
      failures.push(
        issue(
          'duplicate-identifier',
          [...itemPath, 'linkId'],
          `Repeated answers for ${item.linkId} must share one answer array.`,
        ),
      )
    } else if (answered) {
      answeredLinkIds.add(item.linkId)
    }

    failures.push(
      ...validateQuestionnaireResponseItemContract(item.item ?? [], [
        ...itemPath,
        'item',
      ]),
    )
    for (const [answerIndex, answer] of (item.answer ?? []).entries()) {
      const answerPath = [...itemPath, 'answer', answerIndex]
      failures.push(
        ...validateQuestionnaireResponseAnswerContract(answer, answerPath),
      )
    }
  }
  return failures
}

/** Static rules shared by the builder and pair preflight. */
export const validateQuestionnaireContract = (
  extension: readonly Extension[] | undefined,
  items: readonly QuestionnaireItemInput[],
): readonly Issue[] => {
  const root: ExtensionElement = extension === undefined ? {} : { extension }
  const failures: Issue[] = []
  if (extensionCount(root, QUESTIONNAIRE_EXTENSIONS.styleSensitive) > 0) {
    failures.push(
      issue('invalid-code', ['extension'], 'styleSensitive is not supported.'),
    )
  }
  const targetKeys = new Set<string>()
  failures.push(...validateExpressionScope(root, [], targetKeys))
  const seenLinkIds = new Set<string>()
  for (const [index, item] of items.entries()) {
    failures.push(
      ...validateItem(item, ['item', index], seenLinkIds, targetKeys),
    )
  }
  for (const [index, item] of items.entries()) {
    const visit = (
      candidate: QuestionnaireItemInput,
      path: ReadonlyArray<number | string>,
    ) => {
      for (const [conditionIndex, condition] of (
        candidate.enableWhen ?? []
      ).entries()) {
        if (!seenLinkIds.has(condition.question)) {
          failures.push(
            issue(
              'invalid-reference',
              [...path, 'enableWhen', conditionIndex, 'question'],
              `enableWhen refers to unknown linkId ${condition.question}.`,
            ),
          )
        }
      }
      for (const [childIndex, child] of (candidate.item ?? []).entries()) {
        visit(child, [...path, 'item', childIndex])
      }
    }
    visit(item, ['item', index])
  }
  return failures
}
