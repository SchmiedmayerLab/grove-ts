//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  compareR4Temporal,
  isR4Date,
  isR4DateTime,
  isR4Time,
  type R4TemporalKind,
} from './temporal.js'
import type { QuestionnaireItemInput } from './types.js'
import type { Issue } from '../core/index.js'
import type { Extension } from '../r4/index.js'

export const QUESTIONNAIRE_EXTENSIONS = {
  calculatedExpression:
    'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression',
  enableWhenExpression:
    'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-enableWhenExpression',
  initialExpression:
    'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-initialExpression',
  hidden: 'http://hl7.org/fhir/StructureDefinition/questionnaire-hidden',
  itemWeight: 'http://hl7.org/fhir/StructureDefinition/itemWeight',
  maxDecimalPlaces: 'http://hl7.org/fhir/StructureDefinition/maxDecimalPlaces',
  maxOccurs: 'http://hl7.org/fhir/StructureDefinition/questionnaire-maxOccurs',
  maxQuantity:
    'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-maxQuantity',
  maxSize: 'http://hl7.org/fhir/StructureDefinition/maxSize',
  maxValue: 'http://hl7.org/fhir/StructureDefinition/maxValue',
  mimeType: 'http://hl7.org/fhir/StructureDefinition/mimeType',
  minLength: 'http://hl7.org/fhir/StructureDefinition/minLength',
  minOccurs: 'http://hl7.org/fhir/StructureDefinition/questionnaire-minOccurs',
  minQuantity:
    'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-minQuantity',
  minValue: 'http://hl7.org/fhir/StructureDefinition/minValue',
  optionExclusive:
    'http://hl7.org/fhir/StructureDefinition/questionnaire-optionExclusive',
  questionnaireUnit:
    'http://hl7.org/fhir/StructureDefinition/questionnaire-unit',
  styleSensitive:
    'http://hl7.org/fhir/StructureDefinition/rendering-styleSensitive',
  targetConstraint: 'http://hl7.org/fhir/StructureDefinition/targetConstraint',
  unitOption:
    'http://hl7.org/fhir/StructureDefinition/questionnaire-unitOption',
  unitValueSet:
    'http://hl7.org/fhir/StructureDefinition/questionnaire-unitValueSet',
  variable: 'http://hl7.org/fhir/StructureDefinition/variable',
} as const

export interface ExtensionElement {
  readonly extension?: readonly Extension[]
}

export interface ExtensionValue {
  readonly key: string
  readonly value: unknown
}

export type QuestionnaireAnswerValueKey =
  | 'valueAttachment'
  | 'valueBoolean'
  | 'valueCoding'
  | 'valueDate'
  | 'valueDateTime'
  | 'valueDecimal'
  | 'valueInteger'
  | 'valueQuantity'
  | 'valueString'
  | 'valueTime'
  | 'valueUri'

/** Expected Questionnaire/Response value[x] discriminators for an item type. */
export const expectedQuestionnaireAnswerKeys = (
  type: QuestionnaireItemInput['type'],
): readonly QuestionnaireAnswerValueKey[] => {
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

export const expectedAnswerOptionKeys = (
  type: QuestionnaireItemInput['type'],
): readonly QuestionnaireAnswerValueKey[] => {
  switch (type) {
    case 'integer':
      return ['valueInteger']
    case 'date':
      return ['valueDate']
    case 'time':
      return ['valueTime']
    case 'string':
      return ['valueString']
    case 'choice':
      return ['valueCoding']
    case 'open-choice':
      return ['valueCoding', 'valueString']
    default:
      return []
  }
}

const questionnaireAnswerValueKeys: readonly QuestionnaireAnswerValueKey[] = [
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
]

export const populatedQuestionnaireAnswerKey = (
  value: object,
): QuestionnaireAnswerValueKey | undefined =>
  questionnaireAnswerValueKeys.find(
    (key) => Reflect.get(value, key) !== undefined,
  )

export const issue = (
  code: Issue['code'],
  path: Issue['path'],
  message: string,
): Issue => ({ severity: 'error', code, path, message })

export const extensionsFor = (
  element: ExtensionElement,
  url: string,
): readonly Extension[] =>
  (element.extension ?? []).filter((extension) => extension.url === url)

export const extensionValue = (
  extension: Extension | undefined,
): ExtensionValue | undefined => {
  if (extension === undefined) return undefined
  const values = Object.entries(extension).filter(
    ([key]) => key.startsWith('value') && key !== 'valueSet',
  )
  return values.length === 1 ?
      { key: values[0]?.[0] ?? '', value: values[0]?.[1] }
    : undefined
}

export const firstExtensionValue = (
  element: ExtensionElement,
  url: string,
): ExtensionValue | undefined => {
  const first = extensionsFor(element, url)[0]
  return first === undefined ? undefined : extensionValue(first)
}

const expressionPart = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ?
    Reflect.get(value, key)
  : undefined

const isValidFhirPathExpression = (
  value: unknown,
  requireName = false,
): boolean =>
  expressionPart(value, 'language') === 'text/fhirpath' &&
  typeof expressionPart(value, 'expression') === 'string' &&
  (expressionPart(value, 'expression') as string).trim() !== '' &&
  (!requireName ||
    (typeof expressionPart(value, 'name') === 'string' &&
      (expressionPart(value, 'name') as string).trim() !== ''))

const expressionUrls = new Set<string>([
  QUESTIONNAIRE_EXTENSIONS.variable,
  QUESTIONNAIRE_EXTENSIONS.enableWhenExpression,
  QUESTIONNAIRE_EXTENSIONS.initialExpression,
  QUESTIONNAIRE_EXTENSIONS.calculatedExpression,
])

const variableName = /^[A-Za-z]\w*$/u
const reservedVariableNames = new Set([
  'context',
  'definition',
  'loinc',
  'qitem',
  'questionnaire',
  'resource',
  'rootResource',
  'sct',
  'target',
  'ucum',
])

const targetParts = (
  extension: Extension,
  name: string,
): readonly Extension[] =>
  extension.extension?.filter((part) => part.url === name) ?? []

const validateVariableName = (
  value: unknown,
  names: Set<string>,
  path: ReadonlyArray<number | string>,
): readonly Issue[] => {
  const name = expressionPart(value, 'name')
  if (typeof name !== 'string' || name === '') return []
  const failures: Issue[] = []
  if (!variableName.test(name) || reservedVariableNames.has(name)) {
    failures.push(
      issue(
        'invalid-code',
        [...path, 'valueExpression', 'name'],
        `FHIRPath variable name ${name} is invalid or reserved.`,
      ),
    )
  }
  if (names.has(name)) {
    failures.push(
      issue(
        'duplicate-identifier',
        [...path, 'valueExpression', 'name'],
        `FHIRPath variable name ${name} is duplicated in this scope.`,
      ),
    )
  }
  names.add(name)
  return failures
}

const validateExpressionExtension = (
  extension: Extension,
  names: Set<string>,
  path: ReadonlyArray<number | string>,
): readonly Issue[] => {
  if (extension.url === undefined || !expressionUrls.has(extension.url)) {
    return []
  }
  const value = extensionValue(extension)?.value
  const isVariable = extension.url === QUESTIONNAIRE_EXTENSIONS.variable
  const failures: Issue[] = []
  if (!isValidFhirPathExpression(value, isVariable)) {
    failures.push(
      issue(
        'invalid-type',
        path,
        'Expression extensions require a non-empty text/fhirpath expression and variables also require a name.',
      ),
    )
  }
  if (isVariable) failures.push(...validateVariableName(value, names, path))
  return failures
}

const validateTargetConstraint = (
  extension: Extension,
  targetKeys: Set<string>,
  path: ReadonlyArray<number | string>,
): readonly Issue[] => {
  if (extension.url !== QUESTIONNAIRE_EXTENSIONS.targetConstraint) return []
  const failures: Issue[] = []
  const values = new Map<string, Extension | undefined>()
  for (const name of ['key', 'severity', 'human', 'expression']) {
    const matching = targetParts(extension, name)
    if (matching.length !== 1) {
      failures.push(
        issue(
          matching.length === 0 ? 'missing-required' : 'duplicate-identifier',
          path,
          `targetConstraint requires exactly one ${name} part.`,
        ),
      )
    }
    values.set(name, matching.length === 1 ? matching[0] : undefined)
  }
  if (
    (extension.extension ?? []).some(
      (part) => part.url === undefined || !values.has(part.url),
    )
  ) {
    failures.push(
      issue(
        'invalid-choice',
        path,
        'targetConstraint contains an unsupported nested part.',
      ),
    )
  }
  const key = extensionValue(values.get('key'))
  const severity = extensionValue(values.get('severity'))
  const human = extensionValue(values.get('human'))
  const expression = extensionValue(values.get('expression'))
  if (
    key?.key !== 'valueId' ||
    typeof key.value !== 'string' ||
    key.value.trim() === ''
  ) {
    failures.push(
      issue(
        'missing-required',
        path,
        'targetConstraint requires a non-empty valueId key.',
      ),
    )
  } else if (targetKeys.has(key.value)) {
    failures.push(
      issue(
        'duplicate-identifier',
        path,
        `targetConstraint key ${key.value} is not unique.`,
      ),
    )
  } else {
    targetKeys.add(key.value)
  }
  if (
    severity?.key !== 'valueCode' ||
    !['error', 'warning'].includes(String(severity.value))
  ) {
    failures.push(
      issue(
        'invalid-code',
        path,
        'targetConstraint severity must be error or warning.',
      ),
    )
  }
  if (
    human?.key !== 'valueString' ||
    typeof human.value !== 'string' ||
    human.value.trim() === ''
  ) {
    failures.push(
      issue(
        'missing-required',
        path,
        'targetConstraint requires non-empty human guidance.',
      ),
    )
  }
  if (
    expression?.key !== 'valueExpression' ||
    !isValidFhirPathExpression(expression.value)
  ) {
    failures.push(
      issue(
        'invalid-type',
        path,
        'targetConstraint requires a non-empty text/fhirpath expression.',
      ),
    )
  }
  return failures
}

export const validateExpressionScope = (
  element: ExtensionElement,
  path: ReadonlyArray<number | string>,
  targetKeys: Set<string>,
): readonly Issue[] => {
  const failures: Issue[] = []
  const names = new Set<string>()
  for (const [index, extension] of (element.extension ?? []).entries()) {
    const extensionPath = [...path, 'extension', index]
    failures.push(
      ...validateExpressionExtension(extension, names, extensionPath),
    )
    failures.push(
      ...validateTargetConstraint(extension, targetKeys, extensionPath),
    )
  }
  return failures
}

const comparableQuantity = (
  value: unknown,
): readonly [number, string, string] | undefined => {
  if (typeof value !== 'object' || value === null) return undefined
  const quantity = value as Readonly<Record<string, unknown>>
  const quantityValue = quantity.value
  const system = quantity.system
  const code = quantity.code
  return (
      typeof quantityValue === 'number' &&
        Number.isFinite(quantityValue) &&
        typeof system === 'string' &&
        typeof code === 'string'
    ) ?
      [quantityValue, system, code]
    : undefined
}

/** Returns whether left is less than or equal to a comparable right value. */
export const boundIsOrdered = (
  left: unknown,
  right: unknown,
  temporalKind?: R4TemporalKind,
): boolean | undefined => {
  if (typeof left === 'number' && typeof right === 'number') {
    return Number.isFinite(left) && Number.isFinite(right) ?
        left <= right
      : undefined
  }
  if (typeof left === 'string' && typeof right === 'string') {
    if (temporalKind === undefined) return left <= right
    const comparison = compareR4Temporal(left, right, temporalKind)
    return comparison === undefined ? undefined : comparison <= 0
  }
  const leftQuantity = comparableQuantity(left)
  const rightQuantity = comparableQuantity(right)
  if (leftQuantity === undefined || rightQuantity === undefined)
    return undefined
  return (
      leftQuantity[1] === rightQuantity[1] &&
        leftQuantity[2] === rightQuantity[2]
    ) ?
      leftQuantity[0] <= rightQuantity[0]
    : undefined
}

const temporalKindForItem = (
  type: QuestionnaireItemInput['type'],
): R4TemporalKind | undefined => {
  if (type === 'date' || type === 'dateTime' || type === 'time') return type
  return undefined
}

export const temporalValidatorForItem = (
  type: QuestionnaireItemInput['type'],
): ((value: unknown) => boolean) | undefined => {
  switch (type) {
    case 'date':
      return isR4Date
    case 'dateTime':
      return isR4DateTime
    case 'time':
      return isR4Time
    default:
      return undefined
  }
}

export const validateBoundPair = (
  item: QuestionnaireItemInput,
  path: ReadonlyArray<number | string>,
  minimumUrl: string,
  maximumUrl: string,
): readonly Issue[] => {
  const minimum = firstExtensionValue(item, minimumUrl)
  const maximum = firstExtensionValue(item, maximumUrl)
  if (minimum === undefined || maximum === undefined) return []
  return (
      minimum.key === maximum.key &&
        boundIsOrdered(
          minimum.value,
          maximum.value,
          temporalKindForItem(item.type),
        ) === true
    ) ?
      []
    : [
        issue(
          'out-of-range',
          path,
          'Minimum and maximum must use comparable values and minimum must not exceed maximum.',
        ),
      ]
}
