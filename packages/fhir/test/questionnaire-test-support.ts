//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  buildQuestionnaire,
  buildQuestionnaireResponse,
  parseAbsoluteUri,
  parseCanonical,
  parseFhirInstant,
  parsePatientReference,
  parseSemVer,
  preflightQuestionnairePair,
  type AbsoluteUri,
  type Canonical,
  type FhirInstant,
  type GroveQuestionnaire,
  type GroveQuestionnaireResponse,
  type QuestionnaireInput,
  type QuestionnaireItemInput,
  type QuestionnairePair,
  type QuestionnairePreflightOptions,
  type QuestionnaireResponseInput,
  type Result,
  type SemVer,
} from '../src/index.js'

export const unwrap = <T>(result: Result<T>): T => {
  if (!result.ok) {
    throw new Error(result.issues.map((entry) => entry.message).join('\n'))
  }
  return result.value
}

export const url: AbsoluteUri = unwrap(
  parseAbsoluteUri('https://example.org/fhir/Questionnaire/pain'),
)
export const version: SemVer = unwrap(parseSemVer('2.0.0'))
export const questionnaireCanonical: Canonical = unwrap(
  parseCanonical(`${url}|${version}`),
)
export const authored: FhirInstant = unwrap(
  parseFhirInstant('2026-08-20T12:00:00-07:00'),
)
export const subject: string = unwrap(parsePatientReference('Patient/example'))
export const codingSystem: AbsoluteUri = unwrap(
  parseAbsoluteUri('https://example.org/CodeSystem/pain'),
)

type QuestionnaireExtensionInput = NonNullable<
  QuestionnaireItemInput['extension']
>[number]

export const questionnaireExtensions: Readonly<
  Record<
    | 'calculatedExpression'
    | 'hidden'
    | 'itemWeight'
    | 'maxDecimalPlaces'
    | 'maxOccurs'
    | 'maxQuantity'
    | 'maxSize'
    | 'maxValue'
    | 'mimeType'
    | 'minLength'
    | 'minOccurs'
    | 'minQuantity'
    | 'minValue'
    | 'optionExclusive'
    | 'targetConstraint'
    | 'unitOption'
    | 'unitValueSet'
    | 'variable',
    string
  >
> = {
  calculatedExpression:
    'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression',
  maxDecimalPlaces: 'http://hl7.org/fhir/StructureDefinition/maxDecimalPlaces',
  maxOccurs: 'http://hl7.org/fhir/StructureDefinition/questionnaire-maxOccurs',
  maxQuantity:
    'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-maxQuantity',
  maxSize: 'http://hl7.org/fhir/StructureDefinition/maxSize',
  maxValue: 'http://hl7.org/fhir/StructureDefinition/maxValue',
  hidden: 'http://hl7.org/fhir/StructureDefinition/questionnaire-hidden',
  itemWeight: 'http://hl7.org/fhir/StructureDefinition/itemWeight',
  mimeType: 'http://hl7.org/fhir/StructureDefinition/mimeType',
  minLength: 'http://hl7.org/fhir/StructureDefinition/minLength',
  minOccurs: 'http://hl7.org/fhir/StructureDefinition/questionnaire-minOccurs',
  minQuantity:
    'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-minQuantity',
  minValue: 'http://hl7.org/fhir/StructureDefinition/minValue',
  optionExclusive:
    'http://hl7.org/fhir/StructureDefinition/questionnaire-optionExclusive',
  targetConstraint: 'http://hl7.org/fhir/StructureDefinition/targetConstraint',
  unitOption:
    'http://hl7.org/fhir/StructureDefinition/questionnaire-unitOption',
  unitValueSet:
    'http://hl7.org/fhir/StructureDefinition/questionnaire-unitValueSet',
  variable: 'http://hl7.org/fhir/StructureDefinition/variable',
} as const

export const targetConstraint = (
  key: string,
  severity: 'error' | 'warning' = 'error',
): QuestionnaireExtensionInput => ({
  url: questionnaireExtensions.targetConstraint,
  extension: [
    { url: 'key', valueId: key },
    { url: 'severity', valueCode: severity },
    { url: 'human', valueString: `Satisfy ${key}.` },
    {
      url: 'expression',
      valueExpression: {
        language: 'text/fhirpath',
        expression: 'true',
      },
    },
  ],
})

export const questionnaireInput: QuestionnaireInput = {
  url,
  version,
  name: 'PainQuestionnaire',
  title: 'Pain Questionnaire',
  status: 'active',
  subjectTypes: ['Patient'],
  items: [
    {
      linkId: 'health',
      text: 'Health',
      type: 'group',
      required: true,
      item: [
        {
          linkId: 'has-pain',
          text: 'Are you in pain?',
          type: 'boolean',
          required: true,
          item: [
            {
              linkId: 'pain-severity',
              text: 'How severe is the pain?',
              type: 'choice',
              required: true,
              enableWhen: [
                {
                  question: 'has-pain',
                  operator: '=',
                  answerBoolean: true,
                },
              ],
              answerOption: [
                { valueCoding: { system: codingSystem, code: 'mild' } },
                { valueCoding: { system: codingSystem, code: 'severe' } },
              ],
            },
          ],
        },
      ],
    },
    {
      linkId: 'notes',
      text: 'Additional notes',
      type: 'text',
    },
  ],
}

export const responseInput = (
  note = 'Rest helps.',
): QuestionnaireResponseInput => ({
  questionnaire: questionnaireCanonical,
  identifier: {
    system: unwrap(parseAbsoluteUri('https://example.org/submissions')),
    value: 'submission-1',
  },
  status: 'completed',
  subject: { type: 'Patient', reference: subject },
  authored,
  items: [
    {
      linkId: 'health',
      text: 'Health',
      item: [
        {
          linkId: 'has-pain',
          text: 'Are you in pain?',
          answer: [
            {
              valueBoolean: true,
              item: [
                {
                  linkId: 'pain-severity',
                  text: 'How severe is the pain?',
                  answer: [
                    {
                      valueCoding: { system: codingSystem, code: 'mild' },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      linkId: 'notes',
      text: 'Additional notes',
      answer: [{ valueString: note }],
    },
  ],
})

export const questionnaire: GroveQuestionnaire = unwrap(
  buildQuestionnaire(questionnaireInput),
)
export const response: GroveQuestionnaireResponse = unwrap(
  buildQuestionnaireResponse(responseInput()),
)

export const preflightItems = (
  questionnaireItems: ReadonlyArray<Readonly<Record<string, unknown>>>,
  responseItems: ReadonlyArray<Readonly<Record<string, unknown>>>,
  options: QuestionnairePreflightOptions = {},
  status: 'amended' | 'completed' | 'in-progress' = 'completed',
): Result<QuestionnairePair> =>
  preflightQuestionnairePair(
    { ...questionnaire, item: questionnaireItems },
    { ...response, status, item: responseItems },
    options,
  )
