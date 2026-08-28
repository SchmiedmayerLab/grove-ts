//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { expectTypeOf } from 'expect-type'
import { assert, property, string } from 'fast-check'
import {
  buildQuestionnaire,
  buildQuestionnaireResponse,
  parseAbsoluteUri,
  parseCanonical,
  parseFhirId,
  parseFhirInstant,
  parsePatientReference,
  parseQuestionnaire,
  parseQuestionnaireResponse,
  parseSemVer,
  preflightQuestionnairePair,
  type GroveQuestionnaire,
  type QuestionnaireInput,
  type QuestionnairePreflightOptions,
  type QuestionnaireResponseAnswerInput,
  type QuestionnaireResponseInput,
  type Result,
} from '../src/index.js'
import {
  compareR4Temporal,
  isR4Date,
  isR4DateTime,
  isR4Time,
} from '../src/questionnaire/temporal.js'

/* eslint-disable sonarjs/no-clear-text-protocols -- FHIR R4 canonicals are normative HTTP URIs. */

const unwrap = <T>(result: Result<T>): T => {
  if (!result.ok) {
    throw new Error(result.issues.map((entry) => entry.message).join('\n'))
  }
  return result.value
}

const url = unwrap(
  parseAbsoluteUri('https://example.org/fhir/Questionnaire/pain'),
)
const version = unwrap(parseSemVer('2.0.0'))
const questionnaireCanonical = unwrap(parseCanonical(`${url}|${version}`))
const authored = unwrap(parseFhirInstant('2026-08-20T12:00:00-07:00'))
const subject = unwrap(parsePatientReference('Patient/example'))
const codingSystem = unwrap(
  parseAbsoluteUri('https://example.org/CodeSystem/pain'),
)

const questionnaireExtensions = {
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

const targetConstraint = (
  key: string,
  severity: 'error' | 'warning' = 'error',
) => ({
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

const questionnaireInput = {
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
} as const satisfies QuestionnaireInput

const responseInput = (note = 'Rest helps.') =>
  ({
    questionnaire: questionnaireCanonical,
    identifier: {
      system: unwrap(parseAbsoluteUri('https://example.org/submissions')),
      value: 'submission-1',
    },
    status: 'completed',
    subject,
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
  }) as const satisfies QuestionnaireResponseInput

const questionnaire = unwrap(buildQuestionnaire(questionnaireInput))
const response = unwrap(buildQuestionnaireResponse(responseInput()))

const preflightItems = (
  questionnaireItems: ReadonlyArray<Readonly<Record<string, unknown>>>,
  responseItems: ReadonlyArray<Readonly<Record<string, unknown>>>,
  options: QuestionnairePreflightOptions = {},
  status: 'amended' | 'completed' | 'in-progress' = 'completed',
) =>
  preflightQuestionnairePair(
    { ...questionnaire, item: questionnaireItems },
    { ...response, status, item: responseItems },
    options,
  )

describe('Questionnaire R4 builders', () => {
  it('stamps the exact Grove profiles and owned extensions', () => {
    expect(questionnaire.meta?.profile).toEqual([
      'https://grovealliance.org/fhir/questionnaire/StructureDefinition/grove-questionnaire',
    ])
    expect(questionnaire.extension).toEqual([
      {
        url: 'http://hl7.org/fhir/StructureDefinition/artifact-versionAlgorithm',
        valueCoding: {
          system: 'http://hl7.org/fhir/version-algorithm',
          code: 'semver',
        },
      },
    ])
    expect(response.meta?.profile).toEqual([
      'https://grovealliance.org/fhir/questionnaire/StructureDefinition/grove-questionnaire-response',
    ])
    expect(response.extension).toEqual([
      {
        url: 'http://hl7.org/fhir/StructureDefinition/questionnaireresponse-completionMode',
        valueCodeableConcept: {
          coding: [
            {
              system:
                'http://terminology.hl7.org/CodeSystem/v3-ParticipationMode',
              code: 'ELECTRONIC',
            },
          ],
        },
      },
    ])
  })

  it('returns immutable, plain R4 JSON', () => {
    expect(Object.isFrozen(questionnaire)).toBe(true)
    expect(Object.isFrozen(questionnaire.item[0]?.item)).toBe(true)
    expect(Object.isFrozen(response)).toBe(true)
    expect(JSON.parse(JSON.stringify(questionnaire))).toEqual(questionnaire)
    expectTypeOf(questionnaire).toExtend<GroveQuestionnaire>()
  })

  it('preserves admitted FHIR primitive metadata at every supported level', () => {
    const input = {
      ...questionnaire,
      _title: {
        extension: [
          {
            url: 'https://example.org/fhir/StructureDefinition/localized-value',
            valueString: 'en-US',
          },
        ],
      },
      item: questionnaire.item.map((item, index) =>
        index === 0 ?
          {
            ...item,
            _text: { id: 'health-text-metadata' },
          }
        : item,
      ),
    }

    const parsed = parseQuestionnaire(input)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value._title).toEqual(input._title)
    expect(parsed.value.item[0]?._text).toEqual({
      id: 'health-text-metadata',
    })
  })

  it('rejects unknown fields and reference questions instead of stripping them', () => {
    expect(
      parseQuestionnaire({ ...questionnaire, vendorPayload: true }).ok,
    ).toBe(false)
    const referenceQuestionnaire = {
      ...questionnaire,
      item: [{ linkId: 'person', text: 'Person', type: 'reference' }],
    }
    expect(parseQuestionnaire(referenceQuestionnaire).ok).toBe(false)
  })

  it('rejects caller attempts to replace owned profile extensions', () => {
    const result = buildQuestionnaire({
      ...questionnaireInput,
      extensions: [
        {
          url: 'http://hl7.org/fhir/StructureDefinition/artifact-versionAlgorithm',
          valueCoding: {
            system: 'http://hl7.org/fhir/version-algorithm',
            code: 'semver',
          },
        },
      ],
    })
    expect(result.ok).toBe(false)
  })

  it('rejects duplicated linkIds before construction', () => {
    const result = buildQuestionnaire({
      ...questionnaireInput,
      items: [questionnaireInput.items[0], questionnaireInput.items[0]],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'duplicate-identifier' }),
      ]),
    )
  })

  it('returns Result failures for malformed JavaScript inputs without throwing', () => {
    const malformedQuestionnaires = [
      undefined,
      null,
      {},
      { ...questionnaireInput, unknownRootField: true },
      {
        ...questionnaireInput,
        items: [
          {
            linkId: 'strict-item',
            text: 'Strict item',
            type: 'string',
            unknownItemField: true,
          },
        ],
      },
    ]
    for (const candidate of malformedQuestionnaires) {
      const invoke = () => buildQuestionnaire(candidate as QuestionnaireInput)
      expect(invoke).not.toThrow()
      expect(invoke().ok).toBe(false)
    }

    const malformedResponses = [
      undefined,
      null,
      {},
      { ...responseInput(), unknownRootField: true },
      {
        ...responseInput(),
        items: [
          {
            linkId: 'strict-item',
            text: 'Strict item',
            answer: [{ valueString: 'answer', unknownAnswerField: true }],
          },
        ],
      },
    ]
    for (const candidate of malformedResponses) {
      const invoke = () =>
        buildQuestionnaireResponse(candidate as QuestionnaireResponseInput)
      expect(invoke).not.toThrow()
      expect(invoke().ok).toBe(false)
    }
  })

  it.each([
    [
      'an empty group',
      { linkId: 'empty-group', text: 'Empty group', type: 'group' },
    ],
    [
      'required on a display item',
      {
        linkId: 'required-display',
        text: 'Display',
        type: 'display',
        required: false,
      },
    ],
    [
      'children on a display item',
      {
        linkId: 'parent-display',
        text: 'Display',
        type: 'display',
        item: [{ linkId: 'child', text: 'Child', type: 'string' }],
      },
    ],
    [
      'answerOption together with initial',
      {
        linkId: 'choice',
        text: 'Choice',
        type: 'choice',
        answerOption: [
          { valueCoding: { system: codingSystem, code: 'option' } },
        ],
        initial: [{ valueCoding: { system: codingSystem, code: 'option' } }],
      },
    ],
  ] as const)('rejects %s', (_name, item) => {
    const result = buildQuestionnaire({
      ...questionnaireInput,
      items: [item],
    } as unknown as QuestionnaireInput)
    expect(result.ok).toBe(false)
  })

  it('enforces base R4 Questionnaire and response item invariants when parsing', () => {
    expect(
      parseQuestionnaire({
        ...questionnaire,
        item: [{ linkId: 'empty-group', type: 'group' }],
      }).ok,
    ).toBe(false)
    expect(
      parseQuestionnaire({
        ...questionnaire,
        item: [
          {
            linkId: 'display',
            text: 'Display',
            type: 'display',
            required: false,
          },
        ],
      }).ok,
    ).toBe(false)
    expect(
      parseQuestionnaire({
        ...questionnaire,
        item: [
          {
            linkId: 'choice',
            text: 'Choice',
            type: 'choice',
            answerOption: [{ valueString: 'option' }],
            initial: [{ valueString: 'option' }],
          },
        ],
      }).ok,
    ).toBe(false)

    const mixedItem = {
      linkId: 'mixed',
      text: 'Mixed',
      answer: [{ valueString: 'answer' }],
      item: [{ linkId: 'child', text: 'Child' }],
    }
    expect(
      parseQuestionnaireResponse({ ...response, item: [mixedItem] }).ok,
    ).toBe(false)
    expect(
      buildQuestionnaireResponse({
        ...responseInput(),
        items: [mixedItem],
      }).ok,
    ).toBe(false)
  })

  it('requires the exact Grove profiles at every public parse boundary', () => {
    const unprofiledQuestionnaire = { ...questionnaire, meta: undefined }
    const unprofiledResponse = { ...response, meta: undefined }
    expect(parseQuestionnaire(unprofiledQuestionnaire).ok).toBe(false)
    expect(parseQuestionnaireResponse(unprofiledResponse).ok).toBe(false)
    expect(
      parseQuestionnaire({
        ...questionnaire,
        meta: {
          profile: [
            ...(questionnaire.meta?.profile ?? []),
            'https://example.org/fhir/StructureDefinition/extra',
          ],
        },
      }).ok,
    ).toBe(false)
    expect(
      parseQuestionnaireResponse({
        ...response,
        meta: {
          profile: [
            ...(response.meta?.profile ?? []),
            'https://example.org/fhir/StructureDefinition/extra',
          ],
        },
      }).ok,
    ).toBe(false)
    expect(
      preflightQuestionnairePair(unprofiledQuestionnaire, response).ok,
    ).toBe(false)
    expect(
      preflightQuestionnairePair(questionnaire, unprofiledResponse).ok,
    ).toBe(false)
  })

  it.each([
    [
      'code on display',
      {
        linkId: 'display-code',
        text: 'Display',
        type: 'display',
        code: [{ system: codingSystem, code: 'display' }],
      },
    ],
    [
      'readOnly on display',
      {
        linkId: 'display-read-only',
        text: 'Display',
        type: 'display',
        readOnly: false,
      },
    ],
    [
      'answerOption on boolean',
      {
        linkId: 'boolean-options',
        text: 'Boolean',
        type: 'boolean',
        answerOption: [{ valueString: 'not-admitted' }],
      },
    ],
    [
      'answerValueSet on attachment',
      {
        linkId: 'attachment-value-set',
        text: 'Attachment',
        type: 'attachment',
        answerValueSet: 'https://example.org/fhir/ValueSet/not-admitted',
      },
    ],
    [
      'a non-boolean exists operand',
      {
        linkId: 'exists',
        text: 'Exists',
        type: 'string',
        enableWhen: [
          {
            question: 'exists',
            operator: 'exists',
            answerString: 'true',
          },
        ],
      },
    ],
    [
      'initial on group',
      {
        linkId: 'group-initial',
        text: 'Group',
        type: 'group',
        initial: [{ valueString: 'not-admitted' }],
        item: [{ linkId: 'child', text: 'Child', type: 'string' }],
      },
    ],
    [
      'multiple initial values without repeats',
      {
        linkId: 'multiple-initial',
        text: 'Multiple initial',
        type: 'string',
        initial: [{ valueString: 'one' }, { valueString: 'two' }],
      },
    ],
    [
      'a linkId longer than 255 code points',
      {
        linkId: '😀'.repeat(256),
        text: 'Long linkId',
        type: 'string',
      },
    ],
  ] as const)('enforces %s', (_name, item) => {
    expect(
      buildQuestionnaire({
        ...questionnaireInput,
        items: [item],
      } as unknown as QuestionnaireInput).ok,
    ).toBe(false)
  })

  it('requires authored initial and answerOption values to match item type', () => {
    for (const item of [
      {
        linkId: 'integer-initial',
        text: 'Integer initial',
        type: 'integer',
        initial: [{ valueString: '1' }],
      },
      {
        linkId: 'date-initial',
        text: 'Date initial',
        type: 'date',
        initial: [{ valueTime: '12:00:00' }],
      },
      {
        linkId: 'choice-option',
        text: 'Choice option',
        type: 'choice',
        answerOption: [{ valueString: 'uncoded' }],
      },
      {
        linkId: 'integer-option',
        text: 'Integer option',
        type: 'integer',
        answerOption: [{ valueDate: '2026-08-20' }],
      },
    ] as const) {
      expect(
        buildQuestionnaire({
          ...questionnaireInput,
          items: [item],
        } as unknown as QuestionnaireInput).ok,
      ).toBe(false)
    }

    expect(
      buildQuestionnaire({
        ...questionnaireInput,
        items: [
          {
            linkId: 'open-choice-option',
            text: 'Open choice option',
            type: 'open-choice',
            answerOption: [{ valueString: 'uncoded' }],
          },
          {
            linkId: 'integer-initial',
            text: 'Integer initial',
            type: 'integer',
            initial: [{ valueInteger: 1 }],
          },
        ],
      }).ok,
    ).toBe(true)
  })

  it('limits answerValueSet to choice and open-choice items', () => {
    for (const type of ['integer', 'date', 'string'] as const) {
      expect(
        buildQuestionnaire({
          ...questionnaireInput,
          items: [
            {
              linkId: `${type}-value-set`,
              text: `${type} value set`,
              type,
              answerValueSet: 'https://example.org/fhir/ValueSet/options',
            },
          ],
        }).ok,
      ).toBe(false)
    }

    for (const type of ['choice', 'open-choice'] as const) {
      expect(
        buildQuestionnaire({
          ...questionnaireInput,
          items: [
            {
              linkId: `${type}-value-set`,
              text: `${type} value set`,
              type,
              answerValueSet: 'https://example.org/fhir/ValueSet/options',
            },
          ],
        }).ok,
      ).toBe(true)
    }

    expect(
      parseQuestionnaire({
        ...questionnaire,
        item: [
          {
            linkId: 'string-value-set',
            text: 'String value set',
            type: 'string',
            answerValueSet: 'https://example.org/fhir/ValueSet/options',
          },
        ],
      }).ok,
    ).toBe(false)
  })

  it('rejects valueless Extension objects throughout builder inputs', () => {
    expect(
      buildQuestionnaire({
        ...questionnaireInput,
        extensions: [
          { url: 'https://example.org/fhir/StructureDefinition/empty' },
        ],
      }).ok,
    ).toBe(false)
    expect(
      buildQuestionnaire({
        ...questionnaireInput,
        items: [
          {
            linkId: 'empty-extension',
            text: 'Empty extension',
            type: 'string',
            extension: [
              { url: 'https://example.org/fhir/StructureDefinition/empty' },
            ],
          },
        ],
      }).ok,
    ).toBe(false)
    expect(
      buildQuestionnaireResponse({
        ...responseInput(),
        extensions: [
          { url: 'https://example.org/fhir/StructureDefinition/empty' },
        ],
      }).ok,
    ).toBe(false)
  })

  it('enforces R4 ResourceType subject codes and signed integer bounds', () => {
    expect(
      buildQuestionnaire({
        ...questionnaireInput,
        subjectTypes: ['Banana'],
      }).ok,
    ).toBe(false)
    expect(
      parseQuestionnaire({
        ...questionnaire,
        subjectType: ['Banana'],
      }).ok,
    ).toBe(false)

    for (const valueInteger of [2_147_483_648, -2_147_483_649]) {
      expect(
        preflightItems(
          [{ linkId: 'integer', text: 'Integer', type: 'integer' }],
          [
            {
              linkId: 'integer',
              text: 'Integer',
              answer: [{ valueInteger }],
            },
          ],
        ).ok,
      ).toBe(false)
    }
    expect(
      buildQuestionnaire({
        ...questionnaireInput,
        items: [
          {
            linkId: 'integer-option',
            text: 'Integer option',
            type: 'integer',
            answerOption: [{ valueInteger: 2_147_483_648 }],
          },
        ],
      }).ok,
    ).toBe(false)
    expect(
      buildQuestionnaire({
        ...questionnaireInput,
        items: [
          {
            linkId: 'long-text',
            text: 'Long text',
            type: 'string',
            maxLength: 2_147_483_648,
          },
        ],
      }).ok,
    ).toBe(false)
  })

  it('enforces hidden and itemWeight slice cardinality and value types', () => {
    expect(
      buildQuestionnaire({
        ...questionnaireInput,
        items: [
          {
            linkId: 'duplicate-hidden',
            text: 'Duplicate hidden',
            type: 'string',
            extension: [
              { url: questionnaireExtensions.hidden, valueBoolean: true },
              { url: questionnaireExtensions.hidden, valueBoolean: false },
            ],
          },
        ],
      }).ok,
    ).toBe(false)
    expect(
      buildQuestionnaire({
        ...questionnaireInput,
        items: [
          {
            linkId: 'wrong-hidden',
            text: 'Wrong hidden',
            type: 'string',
            extension: [
              { url: questionnaireExtensions.hidden, valueString: 'true' },
            ],
          },
        ],
      }).ok,
    ).toBe(false)

    expect(
      buildQuestionnaireResponse({
        ...responseInput(),
        items: [
          {
            linkId: 'answer-weight',
            text: 'Answer weight',
            answer: [
              {
                extension: [
                  {
                    url: questionnaireExtensions.itemWeight,
                    valueInteger: 1,
                  },
                ],
                valueCoding: { system: codingSystem, code: 'answer-weight' },
              },
            ],
          },
        ],
      }).ok,
    ).toBe(false)
    expect(
      buildQuestionnaireResponse({
        ...responseInput(),
        items: [
          {
            linkId: 'duplicate-answer-weight',
            text: 'Duplicate answer weight',
            answer: [
              {
                extension: [
                  {
                    url: questionnaireExtensions.itemWeight,
                    valueDecimal: 1,
                  },
                  {
                    url: questionnaireExtensions.itemWeight,
                    valueDecimal: 2,
                  },
                ],
                valueCoding: {
                  system: codingSystem,
                  code: 'duplicate-answer-weight',
                },
              },
            ],
          },
        ],
      }).ok,
    ).toBe(false)

    const weightedCoding = {
      system: codingSystem,
      code: 'weighted',
      extension: [{ url: questionnaireExtensions.itemWeight, valueInteger: 1 }],
    }
    const duplicateWeightedCoding = {
      system: codingSystem,
      code: 'duplicate-weight',
      extension: [
        { url: questionnaireExtensions.itemWeight, valueDecimal: 1 },
        { url: questionnaireExtensions.itemWeight, valueDecimal: 2 },
      ],
    }
    expect(
      buildQuestionnaire({
        ...questionnaireInput,
        items: [
          {
            linkId: 'wrong-weight',
            text: 'Wrong weight',
            type: 'choice',
            answerOption: [{ valueCoding: weightedCoding }],
          },
        ],
      }).ok,
    ).toBe(false)
    expect(
      buildQuestionnaireResponse({
        ...responseInput(),
        items: [
          {
            linkId: 'weighted',
            text: 'Weighted',
            answer: [{ valueCoding: weightedCoding }],
          },
        ],
      }).ok,
    ).toBe(false)
    expect(
      buildQuestionnaireResponse({
        ...responseInput(),
        items: [
          {
            linkId: 'duplicate-weight',
            text: 'Duplicate weight',
            answer: [{ valueCoding: duplicateWeightedCoding }],
          },
        ],
      }).ok,
    ).toBe(false)
  })

  it('rejects empty answer value elements', () => {
    for (const [type, answer] of [
      ['string', { valueString: '' }],
      ['url', { valueUri: '' }],
      ['choice', { valueCoding: {} }],
      ['quantity', { valueQuantity: {} }],
      ['attachment', { valueAttachment: {} }],
    ] as const) {
      expect(
        preflightItems(
          [{ linkId: 'empty', text: 'Empty', type }],
          [{ linkId: 'empty', text: 'Empty', answer: [answer] }],
        ).ok,
      ).toBe(false)
    }
  })

  it('enforces answered text and qrs-2 outside pair preflight', () => {
    const duplicateAnswers = [
      {
        linkId: 'duplicate',
        text: 'Duplicate',
        answer: [{ valueString: 'one' }],
      },
      {
        linkId: 'duplicate',
        text: 'Duplicate',
        answer: [{ valueString: 'two' }],
      },
    ]
    expect(
      buildQuestionnaireResponse({
        ...responseInput(),
        items: duplicateAnswers,
      }).ok,
    ).toBe(false)
    expect(
      parseQuestionnaireResponse({
        ...response,
        item: duplicateAnswers,
      }).ok,
    ).toBe(false)

    expect(
      parseQuestionnaireResponse({
        ...response,
        item: [
          {
            linkId: 'answered-without-text',
            answer: [{ valueString: 'answer' }],
          },
        ],
      }).ok,
    ).toBe(false)
  })

  it('validates authored and answer temporal values as R4 primitives', () => {
    for (const invalidAuthored of [
      '2026-08-20',
      '2026-08-20T12:00:00',
      '2026-02-29T12:00:00Z',
      '2026-08-20T24:00:00Z',
    ]) {
      expect(
        parseQuestionnaireResponse({
          ...response,
          authored: invalidAuthored,
        }).ok,
      ).toBe(false)
    }

    for (const [type, answer] of [
      ['date', { valueDate: '2026-02-29' }],
      ['dateTime', { valueDateTime: '2026-08-20T12:00:00' }],
      ['dateTime', { valueDateTime: '2026-13' }],
      ['time', { valueTime: '24:00:00' }],
    ] as const) {
      expect(
        preflightItems(
          [{ linkId: 'temporal', text: 'Temporal', type }],
          [
            {
              linkId: 'temporal',
              text: 'Temporal',
              answer: [answer],
            },
          ],
        ).ok,
      ).toBe(false)
    }

    expect(
      preflightItems(
        [
          { linkId: 'partial-date', text: 'Date', type: 'date' },
          {
            linkId: 'partial-date-time',
            text: 'Date time',
            type: 'dateTime',
          },
        ],
        [
          {
            linkId: 'partial-date',
            text: 'Date',
            answer: [{ valueDate: '2026-08' }],
          },
          {
            linkId: 'partial-date-time',
            text: 'Date time',
            answer: [{ valueDateTime: '2026' }],
          },
        ],
      ).ok,
    ).toBe(true)
  })

  it('covers R4 temporal validation and comparison boundaries', () => {
    for (const candidate of [
      '0000',
      '2026-00',
      '2026-13',
      '2026-02-29',
      '2024-04-31',
      'not-a-date',
    ]) {
      expect(isR4Date(candidate)).toBe(false)
    }
    for (const candidate of [
      '2026',
      '2026-08',
      '2024-02-29',
      '2026-04-30',
      '2026-01-31',
    ]) {
      expect(isR4Date(candidate)).toBe(true)
    }
    expect(isR4Date(undefined)).toBe(false)

    for (const candidate of ['24:00:00', '12:60:00', '12:00:61', '12:00']) {
      expect(isR4Time(candidate)).toBe(false)
    }
    expect(isR4Time(null)).toBe(false)
    expect(isR4Time('00:00:00')).toBe(true)
    expect(isR4Time('23:59:60.123')).toBe(true)

    expect(isR4DateTime(null)).toBe(false)
    expect(isR4DateTime('2026-08')).toBe(true)
    expect(isR4DateTime('2026-02-29T12:00:00Z')).toBe(false)
    expect(isR4DateTime('2026-08-20T12:00:00+14:01')).toBe(false)
    expect(isR4DateTime('2026-08-20T12:00:00Z')).toBe(true)

    expect(compareR4Temporal('bad', '2026', 'date')).toBeUndefined()
    expect(compareR4Temporal('2026', 'bad', 'date')).toBeUndefined()
    expect(compareR4Temporal('2026', '2027', 'date')).toBe(-1)
    expect(compareR4Temporal('2027', '2026', 'date')).toBe(1)
    expect(compareR4Temporal('2026', '2026', 'date')).toBe(0)
    expect(compareR4Temporal('2026-02', '2026-03', 'date')).toBe(-1)
    expect(compareR4Temporal('2026-03', '2026-02', 'date')).toBe(1)
    expect(compareR4Temporal('2026-02-02', '2026-02-01', 'date')).toBe(1)
    expect(compareR4Temporal('2026-02-01', '2026-02-01', 'date')).toBe(0)
    expect(compareR4Temporal('2026', '2026-01', 'date')).toBeUndefined()

    expect(compareR4Temporal('bad', '12:00:00', 'time')).toBeUndefined()
    expect(compareR4Temporal('12:00:00', 'bad', 'time')).toBeUndefined()
    expect(compareR4Temporal('11:00:00', '12:00:00', 'time')).toBe(-1)
    expect(compareR4Temporal('12:01:00', '12:00:00', 'time')).toBe(1)
    expect(compareR4Temporal('12:00:01', '12:00:00', 'time')).toBe(1)
    expect(compareR4Temporal('12:00:00.01', '12:00:00.1', 'time')).toBe(-1)
    expect(compareR4Temporal('12:00:00.10', '12:00:00.1', 'time')).toBe(0)

    const instant = '2026-08-20T12:00:00Z'
    expect(compareR4Temporal('bad', instant, 'dateTime')).toBeUndefined()
    expect(compareR4Temporal(instant, 'bad', 'dateTime')).toBeUndefined()
    expect(compareR4Temporal('2026-08', instant, 'dateTime')).toBeUndefined()
    expect(compareR4Temporal(instant, '2026-08', 'dateTime')).toBeUndefined()
    expect(
      compareR4Temporal(
        '2026-08-20T12:00:00+02:00',
        '2026-08-20T10:30:00Z',
        'dateTime',
      ),
    ).toBe(-1)
    expect(compareR4Temporal(instant, instant, 'dateTime')).toBe(0)
    expect(compareR4Temporal('2026-08', '2026-09', 'dateTime')).toBe(-1)
    expect(compareR4Temporal('2026', '2026-08', 'dateTime')).toBeUndefined()
  })

  it('validates Questionnaire lifecycle dates and effectivePeriod locally', () => {
    expect(
      parseQuestionnaire({ ...questionnaire, date: '2026-02-29' }).ok,
    ).toBe(false)
    expect(
      parseQuestionnaire({
        ...questionnaire,
        approvalDate: '2026-02-29',
      }).ok,
    ).toBe(false)
    expect(
      parseQuestionnaire({
        ...questionnaire,
        lastReviewDate: '2026-08-20T12:00:00Z',
      }).ok,
    ).toBe(false)
    expect(
      parseQuestionnaire({
        ...questionnaire,
        effectivePeriod: { start: 'not-a-date-time' },
      }).ok,
    ).toBe(false)
    expect(
      parseQuestionnaire({
        ...questionnaire,
        effectivePeriod: {
          start: '2026-08-20T12:00:00Z',
          end: '2026-08-20T13:00:00+02:00',
        },
      }).ok,
    ).toBe(false)
    expect(
      parseQuestionnaire({
        ...questionnaire,
        date: '2026-08',
        approvalDate: '2026-08-20',
        lastReviewDate: '2026-08',
        effectivePeriod: {
          start: '2026-08-20T12:00:00+02:00',
          end: '2026-08-20T11:00:00Z',
        },
      }).ok,
    ).toBe(true)
  })

  it('rejects duplicate and wrong-typed portable constraint extensions', () => {
    const duplicate = buildQuestionnaire({
      ...questionnaireInput,
      items: [
        {
          linkId: 'duplicate-minimum',
          text: 'Duplicate minimum',
          type: 'string',
          extension: [
            { url: questionnaireExtensions.minLength, valueInteger: 1 },
            { url: questionnaireExtensions.minLength, valueInteger: 2 },
          ],
        },
      ],
    })
    expect(duplicate.ok).toBe(false)
    if (!duplicate.ok) {
      expect(duplicate.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'duplicate-identifier' }),
        ]),
      )
    }

    for (const item of [
      {
        linkId: 'wrong-minimum-length',
        text: 'Wrong minimum length',
        type: 'string',
        extension: [
          { url: questionnaireExtensions.minLength, valueString: '1' },
        ],
      },
      {
        linkId: 'wrong-value-bound',
        text: 'Wrong value bound',
        type: 'integer',
        extension: [
          { url: questionnaireExtensions.minValue, valueString: '1' },
        ],
      },
      {
        linkId: 'wrong-maximum-size',
        text: 'Wrong maximum size',
        type: 'attachment',
        extension: [
          { url: questionnaireExtensions.maxSize, valueInteger: 1024 },
        ],
      },
      {
        linkId: 'wrong-unit-option',
        text: 'Wrong unit option',
        type: 'quantity',
        extension: [
          { url: questionnaireExtensions.unitOption, valueString: 'kg' },
        ],
      },
      {
        linkId: 'wrong-exclusive-option',
        text: 'Wrong exclusive option',
        type: 'choice',
        answerOption: [
          {
            extension: [
              {
                url: questionnaireExtensions.optionExclusive,
                valueString: 'true',
              },
            ],
            valueCoding: { system: codingSystem, code: 'none' },
          },
        ],
      },
    ] as const) {
      const result = buildQuestionnaire({
        ...questionnaireInput,
        items: [item],
      } as unknown as QuestionnaireInput)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ code: 'invalid-type' }),
          ]),
        )
      }
    }
  })

  it('accepts the complete portable constraint and expression surface', () => {
    const result = buildQuestionnaire({
      ...questionnaireInput,
      extensions: [
        {
          url: questionnaireExtensions.variable,
          valueExpression: {
            language: 'text/fhirpath',
            name: 'rootScore',
            expression: '0',
          },
        },
        targetConstraint('root-valid'),
      ],
      items: [
        {
          linkId: 'text',
          text: 'Text',
          type: 'text',
          maxLength: 8,
          extension: [
            { url: questionnaireExtensions.minLength, valueInteger: 2 },
          ],
        },
        {
          linkId: 'decimal',
          text: 'Decimal',
          type: 'decimal',
          extension: [
            { url: questionnaireExtensions.minValue, valueDecimal: 1 },
            { url: questionnaireExtensions.maxValue, valueDecimal: 5 },
            {
              url: questionnaireExtensions.maxDecimalPlaces,
              valueInteger: 2,
            },
          ],
        },
        {
          linkId: 'quantity',
          text: 'Quantity',
          type: 'quantity',
          extension: [
            {
              url: questionnaireExtensions.minQuantity,
              valueQuantity: {
                value: 1,
                system: 'http://unitsofmeasure.org',
                code: 'kg',
              },
            },
            {
              url: questionnaireExtensions.maxQuantity,
              valueQuantity: {
                value: 5,
                system: 'http://unitsofmeasure.org',
                code: 'kg',
              },
            },
            {
              url: questionnaireExtensions.unitOption,
              valueCoding: {
                system: 'http://unitsofmeasure.org',
                code: 'kg',
              },
            },
          ],
        },
        {
          linkId: 'attachment',
          text: 'Attachment',
          type: 'attachment',
          repeats: true,
          extension: [
            { url: questionnaireExtensions.mimeType, valueCode: 'image/png' },
            { url: questionnaireExtensions.maxSize, valueDecimal: 1024 },
            { url: questionnaireExtensions.minOccurs, valueInteger: 1 },
            { url: questionnaireExtensions.maxOccurs, valueInteger: 2 },
            {
              url: questionnaireExtensions.variable,
              valueExpression: {
                language: 'text/fhirpath',
                name: 'localScore',
                expression: '0',
              },
            },
            targetConstraint('item-valid'),
          ],
        },
      ],
    })
    expect(result.ok).toBe(true)
  })

  it.each([
    [
      'text length placement',
      {
        linkId: 'invalid',
        text: 'Invalid',
        type: 'boolean',
        extension: [
          { url: questionnaireExtensions.minLength, valueInteger: 1 },
        ],
      },
      'invalid-choice',
    ],
    [
      'text bound order',
      {
        linkId: 'invalid',
        text: 'Invalid',
        type: 'string',
        maxLength: 2,
        extension: [
          { url: questionnaireExtensions.minLength, valueInteger: 3 },
        ],
      },
      'out-of-range',
    ],
    [
      'decimal placement',
      {
        linkId: 'invalid',
        text: 'Invalid',
        type: 'integer',
        extension: [
          {
            url: questionnaireExtensions.maxDecimalPlaces,
            valueInteger: 2,
          },
        ],
      },
      'invalid-choice',
    ],
    [
      'value bound datatype',
      {
        linkId: 'invalid',
        text: 'Invalid',
        type: 'date',
        extension: [{ url: questionnaireExtensions.minValue, valueInteger: 1 }],
      },
      'invalid-type',
    ],
    [
      'quantity bound order',
      {
        linkId: 'invalid',
        text: 'Invalid',
        type: 'quantity',
        extension: [
          {
            url: questionnaireExtensions.minQuantity,
            valueQuantity: {
              value: 5,
              system: 'http://unitsofmeasure.org',
              code: 'kg',
            },
          },
          {
            url: questionnaireExtensions.maxQuantity,
            valueQuantity: {
              value: 1,
              system: 'http://unitsofmeasure.org',
              code: 'kg',
            },
          },
        ],
      },
      'out-of-range',
    ],
    [
      'unit placement',
      {
        linkId: 'invalid',
        text: 'Invalid',
        type: 'string',
        extension: [
          {
            url: questionnaireExtensions.unitOption,
            valueCoding: {
              system: 'http://unitsofmeasure.org',
              code: 'kg',
            },
          },
        ],
      },
      'invalid-choice',
    ],
    [
      'attachment placement',
      {
        linkId: 'invalid',
        text: 'Invalid',
        type: 'string',
        extension: [
          { url: questionnaireExtensions.mimeType, valueCode: 'image/png' },
        ],
      },
      'invalid-choice',
    ],
    [
      'occurrence placement',
      {
        linkId: 'invalid',
        text: 'Invalid',
        type: 'choice',
        extension: [
          { url: questionnaireExtensions.minOccurs, valueInteger: 1 },
        ],
      },
      'invalid-choice',
    ],
  ] as const)('rejects invalid %s constraints', (_name, item, code) => {
    const result = buildQuestionnaire({
      ...questionnaireInput,
      items: [item],
    } as unknown as QuestionnaireInput)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code })]),
    )
  })

  it('rejects malformed expressions, reserved variables, and duplicate target keys', () => {
    const result = buildQuestionnaire({
      ...questionnaireInput,
      extensions: [
        {
          url: questionnaireExtensions.variable,
          valueExpression: {
            language: 'text/fhirpath',
            name: 'context',
            expression: '0',
          },
        },
        targetConstraint('duplicate-key'),
      ],
      items: [
        {
          linkId: 'invalid-expression',
          text: 'Invalid expression',
          type: 'string',
          extension: [
            {
              url: questionnaireExtensions.calculatedExpression,
              valueExpression: {
                language: 'text/cql',
                expression: ' ',
              },
            },
            targetConstraint('duplicate-key'),
          ],
        },
      ],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(new Set(result.issues.map(({ code }) => code))).toEqual(
      new Set(['invalid-code', 'invalid-type', 'duplicate-identifier']),
    )
  })

  it('reports the complete bounded Questionnaire input validation surface', () => {
    const result = buildQuestionnaire({
      ...questionnaireInput,
      url: '/relative',
      version: '01.0.0',
      id: 'invalid/id',
      date: 'not-an-instant',
      subjectTypes: ['Patient', ''],
      extensions: [
        {
          url: 'http://hl7.org/fhir/StructureDefinition/rendering-styleSensitive',
          valueBoolean: true,
        },
      ],
      items: [
        { linkId: '', type: 'string', repeats: true },
        {
          linkId: 'exclusive',
          text: 'Exclusive rules',
          type: 'choice',
          enableWhen: [
            { question: 'a', operator: 'exists', answerBoolean: true },
            { question: 'b', operator: 'exists', answerBoolean: true },
          ],
          initial: [{ valueString: 'initial' }],
          answerOption: [{ valueString: 'option' }],
          answerValueSet: 'https://example.org/ValueSet/options',
          extension: [
            {
              url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-enableWhenExpression',
              valueExpression: {
                language: 'text/fhirpath',
                expression: 'true',
              },
            },
            {
              url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-initialExpression',
              valueExpression: {
                language: 'text/fhirpath',
                expression: "'x'",
              },
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/rendering-styleSensitive',
              valueBoolean: true,
            },
          ],
        },
      ],
    } as unknown as QuestionnaireInput)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(new Set(result.issues.map(({ code }) => code))).toEqual(
      new Set([
        'invalid-uri',
        'invalid-code',
        'invalid-type',
        'invalid-identifier',
        'invalid-date-time',
        'missing-required',
        'invalid-choice',
        'invalid-reference',
      ]),
    )
  })

  it('preserves every admitted optional Questionnaire and response field', () => {
    const fullQuestionnaire = buildQuestionnaire({
      ...questionnaireInput,
      id: unwrap(parseFhirId('questionnaire-1')),
      date: authored,
      description: 'A complete test instrument.',
      purpose: 'Coverage of bounded optional fields.',
      extensions: [
        {
          url: 'https://example.org/fhir/StructureDefinition/instrument-note',
          valueString: 'note',
        },
      ],
    })
    expect(fullQuestionnaire.ok).toBe(true)
    if (!fullQuestionnaire.ok) return
    expect(fullQuestionnaire.value.id).toBe('questionnaire-1')
    expect(fullQuestionnaire.value.description).toBe(
      'A complete test instrument.',
    )

    const fullResponse = buildQuestionnaireResponse({
      ...responseInput(),
      id: unwrap(parseFhirId('response-1')),
      authorReference: 'Practitioner/author',
      sourceReference: 'Patient/example',
      extensions: [
        {
          url: 'https://example.org/fhir/StructureDefinition/response-note',
          valueString: 'note',
        },
      ],
    })
    expect(fullResponse.ok).toBe(true)
    if (!fullResponse.ok) return
    expect(fullResponse.value.author?.reference).toBe('Practitioner/author')
    expect(fullResponse.value.source?.reference).toBe('Patient/example')
  })

  it('reports the complete bounded QuestionnaireResponse input validation surface', () => {
    const result = buildQuestionnaireResponse({
      questionnaire: 'https://example.org/Questionnaire/pain',
      identifier: { system: '/relative', value: ' ' },
      status: 'completed',
      id: 'invalid/id',
      subject: 'Patient/example/_history/2',
      authored: 'not-an-instant',
      authorReference: ' ',
      sourceReference: '',
      extensions: [
        {
          url: 'http://hl7.org/fhir/StructureDefinition/questionnaireresponse-completionMode',
          valueCodeableConcept: { text: 'duplicate' },
        },
      ],
      items: [
        {
          linkId: 'parent',
          item: [
            {
              linkId: 'direct-child',
              answer: [{ valueString: 'missing repeated text' }],
            },
          ],
          answer: [
            {
              valueString: 'parent answer',
              item: [
                {
                  linkId: 'answer-child',
                  answer: [{ valueString: 'also missing repeated text' }],
                },
              ],
            },
          ],
        },
      ],
    } as unknown as QuestionnaireResponseInput)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(new Set(result.issues.map(({ code }) => code))).toEqual(
      new Set([
        'invalid-uri',
        'invalid-code',
        'invalid-identifier',
        'invalid-date-time',
        'invalid-reference',
        'duplicate-identifier',
        'missing-required',
      ]),
    )
  })
})

describe('Questionnaire pair preflight', () => {
  it('accepts an exact, nested Questionnaire/Response pair', () => {
    const result = preflightQuestionnairePair(questionnaire, response)
    expect(result.ok).toBe(true)
  })

  it('requires the authoritative version and completion envelopes', () => {
    const incompleteQuestionnaire = {
      ...questionnaire,
      version: 'not-semver',
      extension: [],
    }
    const incompleteResponse = {
      ...response,
      questionnaire: `${url}|not-semver`,
      extension: [],
    }

    const result = preflightQuestionnairePair(
      incompleteQuestionnaire,
      incompleteResponse,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(new Set(result.issues.map(({ code }) => code))).toEqual(
      new Set(['invalid-code', 'invalid-uri', 'missing-required']),
    )
    expect(
      result.issues.some(
        ({ path, message }) =>
          path.join('.') === 'questionnaire.extension' &&
          message.includes('version-algorithm'),
      ),
    ).toBe(true)
    expect(
      result.issues.some(
        ({ path, message }) =>
          path.join('.') === 'response.extension' &&
          message.includes('completion-mode'),
      ),
    ).toBe(true)
  })

  it('rejects a mismatched instrument version', () => {
    const result = preflightQuestionnairePair(questionnaire, {
      ...response,
      questionnaire: `${url}|2.0.1`,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'value-mismatch' }),
      ]),
    )
  })

  it('rejects an answer with the wrong datatype', () => {
    const raw = structuredClone(response)
    const answer = raw.item?.[0]?.item?.[0]?.answer?.[0]
    if (answer === undefined) throw new Error('Missing test answer.')
    const invalid = { ...answer, valueString: 'yes' }
    const result = preflightQuestionnairePair(questionnaire, {
      ...raw,
      item: [
        {
          ...raw.item?.[0],
          item: [
            {
              ...raw.item?.[0]?.item?.[0],
              answer: [invalid],
            },
          ],
        },
      ],
    })
    expect(result.ok).toBe(false)
  })

  it('rejects question children placed outside their answer context', () => {
    const hasPain = response.item?.[0]?.item?.[0]
    const nested = hasPain?.answer?.[0]?.item
    if (hasPain === undefined || nested === undefined) {
      throw new Error('Missing nested test items.')
    }
    const invalidResponse = {
      ...response,
      item: [
        {
          ...response.item?.[0],
          item: [
            {
              ...hasPain,
              answer: [{ valueBoolean: true }],
              item: nested,
            },
          ],
        },
        response.item?.[1],
      ],
    }
    expect(preflightQuestionnairePair(questionnaire, invalidResponse).ok).toBe(
      false,
    )
  })

  it('rejects answers outside inline options', () => {
    const health = response.item?.[0]
    const hasPain = health?.item?.[0]
    const hasPainAnswer = hasPain?.answer?.[0]
    const severity = hasPainAnswer?.item?.[0]
    const severityAnswer = severity?.answer?.[0]
    const coding = severityAnswer?.valueCoding
    if (
      health === undefined ||
      hasPain === undefined ||
      hasPainAnswer === undefined ||
      severity === undefined ||
      severityAnswer === undefined ||
      coding === undefined
    ) {
      throw new Error('Missing coded test answer.')
    }
    const invalidResponse = {
      ...response,
      item: [
        {
          ...health,
          item: [
            {
              ...hasPain,
              answer: [
                {
                  ...hasPainAnswer,
                  item: [
                    {
                      ...severity,
                      answer: [
                        {
                          ...severityAnswer,
                          valueCoding: { ...coding, code: 'moderate' },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        response.item?.[1],
      ],
    }
    expect(preflightQuestionnairePair(questionnaire, invalidResponse).ok).toBe(
      false,
    )
  })

  it('requires enabled items in completed and amended responses', () => {
    const missing = { ...response, item: response.item?.slice(1) }
    expect(preflightQuestionnairePair(questionnaire, missing).ok).toBe(false)
    expect(
      preflightQuestionnairePair(questionnaire, {
        ...missing,
        status: 'amended',
      }).ok,
    ).toBe(false)
    expect(
      preflightQuestionnairePair(questionnaire, {
        ...missing,
        status: 'in-progress',
      }).ok,
    ).toBe(true)
  })

  it('evaluates conditional enablement and rejects disabled answers', () => {
    const health = response.item?.[0]
    const hasPain = health?.item?.[0]
    if (health === undefined || hasPain === undefined) {
      throw new Error('Missing conditional test items.')
    }
    const noPain = {
      ...response,
      item: [
        {
          ...health,
          item: [
            {
              ...hasPain,
              answer: [{ valueBoolean: false }],
            },
          ],
        },
        response.item?.[1],
      ],
    }
    expect(preflightQuestionnairePair(questionnaire, noPain).ok).toBe(true)

    const disabledAnswer = {
      ...noPain,
      item: [
        {
          ...noPain.item[0],
          item: [
            {
              ...noPain.item[0]?.item?.[0],
              answer: [
                {
                  valueBoolean: false,
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
        noPain.item[1],
      ],
    }
    expect(preflightQuestionnairePair(questionnaire, disabledAnswer).ok).toBe(
      false,
    )
  })

  it('fails closed for unresolved ValueSets and accepts normalized expansions', () => {
    const valueSetCanonical = unwrap(
      parseCanonical('https://example.org/fhir/ValueSet/mood|1.0.0'),
    )
    const moodSystem = unwrap(
      parseAbsoluteUri('https://example.org/fhir/CodeSystem/mood'),
    )
    const valueSetQuestionnaire = unwrap(
      buildQuestionnaire({
        ...questionnaireInput,
        items: [
          {
            linkId: 'mood',
            text: 'Mood',
            type: 'choice',
            required: true,
            answerValueSet: valueSetCanonical,
          },
        ],
      }),
    )
    const valueSetResponse = unwrap(
      buildQuestionnaireResponse({
        ...responseInput(),
        items: [
          {
            linkId: 'mood',
            text: 'Mood',
            answer: [{ valueCoding: { system: moodSystem, code: 'calm' } }],
          },
        ],
      }),
    )
    expect(
      preflightQuestionnairePair(valueSetQuestionnaire, valueSetResponse).ok,
    ).toBe(false)
    expect(
      preflightQuestionnairePair(valueSetQuestionnaire, valueSetResponse, {
        valueSets: [
          {
            canonical: valueSetCanonical,
            concepts: [{ system: moodSystem, code: 'calm' }],
          },
        ],
      }).ok,
    ).toBe(true)
  })

  it('enforces text length and decimal precision constraints', () => {
    const textItem = {
      linkId: 'text',
      text: 'Text',
      type: 'text',
      maxLength: 4,
      extension: [{ url: questionnaireExtensions.minLength, valueInteger: 2 }],
    } as const
    expect(
      preflightItems(
        [textItem],
        [{ linkId: 'text', text: 'Text', answer: [{ valueString: 'x' }] }],
      ).ok,
    ).toBe(false)
    expect(
      preflightItems(
        [textItem],
        [
          {
            linkId: 'text',
            text: 'Text',
            answer: [{ valueString: '12345' }],
          },
        ],
      ).ok,
    ).toBe(false)

    const oneCodePointItem = {
      linkId: 'unicode',
      text: 'Unicode',
      type: 'string',
      maxLength: 1,
      extension: [{ url: questionnaireExtensions.minLength, valueInteger: 1 }],
    } as const
    expect(
      preflightItems(
        [oneCodePointItem],
        [
          {
            linkId: 'unicode',
            text: 'Unicode',
            answer: [{ valueString: '😀' }],
          },
        ],
      ).ok,
    ).toBe(true)
    expect(
      preflightItems(
        [oneCodePointItem],
        [
          {
            linkId: 'unicode',
            text: 'Unicode',
            answer: [{ valueString: '😀x' }],
          },
        ],
      ).ok,
    ).toBe(false)

    const decimalItem = {
      linkId: 'decimal',
      text: 'Decimal',
      type: 'decimal',
      extension: [
        {
          url: questionnaireExtensions.maxDecimalPlaces,
          valueInteger: 2,
        },
      ],
    } as const
    expect(
      preflightItems(
        [decimalItem],
        [
          {
            linkId: 'decimal',
            text: 'Decimal',
            answer: [{ valueDecimal: 1.234 }],
          },
        ],
      ).ok,
    ).toBe(false)
    expect(
      preflightItems(
        [decimalItem],
        [
          {
            linkId: 'decimal',
            text: 'Decimal',
            answer: [{ valueDecimal: 1.25 }],
          },
        ],
      ).ok,
    ).toBe(true)
  })

  it('orders dateTime bounds by instant and time bounds by clock value', () => {
    const dateTimeItem = {
      linkId: 'date-time',
      text: 'Date time',
      type: 'dateTime',
      extension: [
        {
          url: questionnaireExtensions.minValue,
          valueDateTime: '2026-08-20T12:00:00+02:00',
        },
        {
          url: questionnaireExtensions.maxValue,
          valueDateTime: '2026-08-20T11:00:00Z',
        },
      ],
    } as const
    expect(
      buildQuestionnaire({
        ...questionnaireInput,
        items: [dateTimeItem],
      }).ok,
    ).toBe(true)
    expect(
      preflightItems(
        [dateTimeItem],
        [
          {
            linkId: 'date-time',
            text: 'Date time',
            answer: [{ valueDateTime: '2026-08-20T10:30:00Z' }],
          },
        ],
      ).ok,
    ).toBe(true)

    const timeItem = {
      linkId: 'time',
      text: 'Time',
      type: 'time',
      extension: [
        {
          url: questionnaireExtensions.minValue,
          valueTime: '12:00:00.0',
        },
        {
          url: questionnaireExtensions.maxValue,
          valueTime: '12:00:00',
        },
      ],
    } as const
    expect(
      buildQuestionnaire({
        ...questionnaireInput,
        items: [timeItem],
      }).ok,
    ).toBe(true)
    expect(
      preflightItems(
        [timeItem],
        [
          {
            linkId: 'time',
            text: 'Time',
            answer: [{ valueTime: '12:00:00.000' }],
          },
        ],
      ).ok,
    ).toBe(true)
  })

  it('evaluates temporal enableWhen values semantically', () => {
    expect(
      preflightItems(
        [
          { linkId: 'source', text: 'Source', type: 'dateTime' },
          {
            linkId: 'dependent',
            text: 'Dependent',
            type: 'string',
            enableWhen: [
              {
                question: 'source',
                operator: '>',
                answerDateTime: '2026-08-20T12:00:00+02:00',
              },
            ],
          },
        ],
        [
          {
            linkId: 'source',
            text: 'Source',
            answer: [{ valueDateTime: '2026-08-20T10:30:00Z' }],
          },
          {
            linkId: 'dependent',
            text: 'Dependent',
            answer: [{ valueString: 'enabled' }],
          },
        ],
      ).ok,
    ).toBe(true)

    expect(
      preflightItems(
        [
          { linkId: 'source', text: 'Source', type: 'time' },
          {
            linkId: 'dependent',
            text: 'Dependent',
            type: 'string',
            enableWhen: [
              {
                question: 'source',
                operator: '=',
                answerTime: '12:00:00.0',
              },
            ],
          },
        ],
        [
          {
            linkId: 'source',
            text: 'Source',
            answer: [{ valueTime: '12:00:00' }],
          },
          {
            linkId: 'dependent',
            text: 'Dependent',
            answer: [{ valueString: 'enabled' }],
          },
        ],
      ).ok,
    ).toBe(true)
  })

  it('enforces scalar and comparable quantity bounds', () => {
    expect(
      preflightItems(
        [
          {
            linkId: 'integer',
            text: 'Integer',
            type: 'integer',
            extension: [
              { url: questionnaireExtensions.minValue, valueInteger: 2 },
              { url: questionnaireExtensions.maxValue, valueInteger: 4 },
            ],
          },
        ],
        [
          {
            linkId: 'integer',
            text: 'Integer',
            answer: [{ valueInteger: 5 }],
          },
        ],
      ).ok,
    ).toBe(false)

    const quantityItem = {
      linkId: 'quantity',
      text: 'Quantity',
      type: 'quantity',
      extension: [
        {
          url: questionnaireExtensions.minQuantity,
          valueQuantity: {
            value: 1,
            system: 'http://unitsofmeasure.org',
            code: 'kg',
          },
        },
        {
          url: questionnaireExtensions.maxQuantity,
          valueQuantity: {
            value: 5,
            system: 'http://unitsofmeasure.org',
            code: 'kg',
          },
        },
      ],
    } as const
    expect(
      preflightItems(
        [quantityItem],
        [
          {
            linkId: 'quantity',
            text: 'Quantity',
            answer: [
              {
                valueQuantity: {
                  value: 3,
                  system: 'http://unitsofmeasure.org',
                  code: 'lb',
                },
              },
            ],
          },
        ],
      ).ok,
    ).toBe(false)
    expect(
      preflightItems(
        [quantityItem],
        [
          {
            linkId: 'quantity',
            text: 'Quantity',
            answer: [
              {
                valueQuantity: {
                  value: 3,
                  system: 'http://unitsofmeasure.org',
                  code: 'kg',
                },
              },
            ],
          },
        ],
      ).ok,
    ).toBe(true)
  })

  it('enforces inline and ValueSet-certified quantity units', () => {
    const unitValueSet = unwrap(
      parseCanonical('https://example.org/fhir/ValueSet/units|1.0.0'),
    )
    const quantityAnswer = [
      {
        linkId: 'quantity',
        text: 'Quantity',
        answer: [
          {
            valueQuantity: {
              value: 3,
              system: 'http://unitsofmeasure.org',
              code: 'kg',
            },
          },
        ],
      },
    ] as const
    const inline = [
      {
        linkId: 'quantity',
        text: 'Quantity',
        type: 'quantity',
        extension: [
          {
            url: questionnaireExtensions.unitOption,
            valueCoding: {
              system: 'http://unitsofmeasure.org',
              code: 'lb',
            },
          },
        ],
      },
    ] as const
    expect(preflightItems(inline, quantityAnswer).ok).toBe(false)

    const valueSet = [
      {
        linkId: 'quantity',
        text: 'Quantity',
        type: 'quantity',
        extension: [
          {
            url: questionnaireExtensions.unitValueSet,
            valueCanonical: unitValueSet,
          },
        ],
      },
    ] as const
    expect(preflightItems(valueSet, quantityAnswer).ok).toBe(false)
    expect(
      preflightItems(valueSet, quantityAnswer, {
        valueSets: [
          {
            canonical: unitValueSet,
            concepts: [
              {
                system: unwrap(parseAbsoluteUri('http://unitsofmeasure.org')),
                code: 'kg',
              },
            ],
          },
        ],
      }).ok,
    ).toBe(true)
  })

  it('enforces attachment MIME type and declared maximum size', () => {
    const item = {
      linkId: 'attachment',
      text: 'Attachment',
      type: 'attachment',
      extension: [
        { url: questionnaireExtensions.mimeType, valueCode: 'image/png' },
        { url: questionnaireExtensions.maxSize, valueDecimal: 4 },
      ],
    } as const
    expect(
      preflightItems(
        [item],
        [
          {
            linkId: 'attachment',
            text: 'Attachment',
            answer: [
              {
                valueAttachment: {
                  contentType: 'text/plain',
                  size: 5,
                  data: 'dGVzdA==',
                },
              },
            ],
          },
        ],
      ).ok,
    ).toBe(false)
    expect(
      preflightItems(
        [item],
        [
          {
            linkId: 'attachment',
            text: 'Attachment',
            answer: [
              {
                valueAttachment: {
                  contentType: 'image/png',
                  size: 4,
                  data: 'dGVzdA==',
                },
              },
            ],
          },
        ],
      ).ok,
    ).toBe(true)
  })

  it('enforces answer occurrence limits and exclusive options', () => {
    const item = {
      linkId: 'choice',
      text: 'Choice',
      type: 'choice',
      repeats: true,
      extension: [
        { url: questionnaireExtensions.minOccurs, valueInteger: 2 },
        { url: questionnaireExtensions.maxOccurs, valueInteger: 2 },
      ],
      answerOption: [
        {
          extension: [
            {
              url: questionnaireExtensions.optionExclusive,
              valueBoolean: true,
            },
          ],
          valueCoding: { system: codingSystem, code: 'none' },
        },
        { valueCoding: { system: codingSystem, code: 'pain' } },
        { valueCoding: { system: codingSystem, code: 'fatigue' } },
      ],
    } as const
    const responseItem = (codes: readonly string[]) => [
      {
        linkId: 'choice',
        text: 'Choice',
        answer: codes.map((code) => ({
          valueCoding: { system: codingSystem, code },
        })),
      },
    ]
    expect(preflightItems([item], responseItem(['pain'])).ok).toBe(false)
    expect(
      preflightItems([item], responseItem(['pain', 'fatigue', 'pain'])).ok,
    ).toBe(false)
    expect(preflightItems([item], responseItem(['none', 'pain'])).ok).toBe(
      false,
    )
    expect(preflightItems([item], responseItem(['pain', 'fatigue'])).ok).toBe(
      true,
    )
  })

  it('returns non-blocking warnings for warning target constraints', () => {
    const warningQuestionnaire = {
      ...questionnaire,
      extension: [
        ...(questionnaire.extension ?? []),
        targetConstraint('warning-constraint', 'warning'),
      ],
    }
    const result = preflightQuestionnairePair(warningQuestionnaire, response)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.warnings).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'external-validation-required',
      }),
    ])
  })

  it('fails closed for calculated expressions while preserving mixed warnings', () => {
    const expressionQuestionnaire = {
      ...questionnaire,
      extension: [
        ...(questionnaire.extension ?? []),
        targetConstraint('warning-constraint', 'warning'),
        targetConstraint('blocking-constraint'),
      ],
      item: questionnaire.item.map((item, index) =>
        index === 1 ?
          {
            ...item,
            extension: [
              {
                url: questionnaireExtensions.calculatedExpression,
                valueExpression: {
                  language: 'text/fhirpath',
                  expression: "'calculated'",
                },
              },
            ],
          }
        : item,
      ),
    }
    expect(
      preflightQuestionnairePair(expressionQuestionnaire, response).ok,
    ).toBe(false)
    const mixed = preflightQuestionnairePair(expressionQuestionnaire, response)
    if (mixed.ok) return
    expect(new Set(mixed.issues.map(({ severity }) => severity))).toEqual(
      new Set(['error', 'warning']),
    )
    expect(
      preflightQuestionnairePair(expressionQuestionnaire, {
        ...response,
        status: 'in-progress',
      }).ok,
    ).toBe(true)
  })

  it('does not treat initialExpression population as completed validation', () => {
    const initialExpressionItem = {
      linkId: 'populated',
      text: 'Populated',
      type: 'string',
      extension: [
        {
          url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-initialExpression',
          valueExpression: {
            language: 'text/fhirpath',
            expression: "'suggested'",
          },
        },
      ],
    } as const
    expect(preflightItems([initialExpressionItem], []).ok).toBe(true)
    expect(
      preflightItems([{ ...initialExpressionItem, required: true }], []).ok,
    ).toBe(false)
  })

  it.each([
    ['boolean', { valueBoolean: false }],
    ['decimal', { valueDecimal: 1.25 }],
    ['integer', { valueInteger: 2 }],
    ['date', { valueDate: '2026-08-20' }],
    ['dateTime', { valueDateTime: '2026-08-20T12:00:00-07:00' }],
    ['time', { valueTime: '12:00:00' }],
    ['string', { valueString: 'short answer' }],
    ['text', { valueString: 'long answer' }],
    ['url', { valueUri: 'https://example.org/answer' }],
    ['choice', { valueCoding: { system: codingSystem, code: 'coded-answer' } }],
    [
      'open-choice',
      { valueCoding: { system: codingSystem, code: 'coded-answer' } },
    ],
    ['open-choice', { valueString: 'free text' }],
    [
      'attachment',
      {
        valueAttachment: {
          contentType: 'text/plain',
          data: 'YW5zd2Vy',
          title: 'answer.txt',
        },
      },
    ],
    [
      'quantity',
      {
        valueQuantity: {
          value: 3,
          system: 'http://unitsofmeasure.org',
          code: 'kg',
        },
      },
    ],
  ] as const)(
    'accepts the supported %s answer representation',
    (type, answer) => {
      const result = preflightItems(
        [{ linkId: 'answer', text: 'Answer', type }],
        [{ linkId: 'answer', text: 'Answer', answer: [answer] }],
      )
      expect(result.ok).toBe(true)
    },
  )

  it('admits free text for open-choice despite closed coded options', () => {
    const result = preflightItems(
      [
        {
          linkId: 'answer',
          text: 'Answer',
          type: 'open-choice',
          answerOption: [
            { valueCoding: { system: codingSystem, code: 'coded-answer' } },
          ],
        },
      ],
      [
        {
          linkId: 'answer',
          text: 'Answer',
          answer: [{ valueString: 'free text' }],
        },
      ],
    )
    expect(result.ok).toBe(true)
  })

  it.each([
    ['<', 6],
    ['<=', 5],
    ['>', 4],
    ['>=', 5],
    ['!=', 4],
  ] as const)('evaluates the %s enableWhen operator', (operator, expected) => {
    const result = preflightItems(
      [
        { linkId: 'source', text: 'Source', type: 'integer' },
        {
          linkId: 'dependent',
          text: 'Dependent',
          type: 'string',
          enableWhen: [
            { question: 'source', operator, answerInteger: expected },
          ],
        },
      ],
      [
        {
          linkId: 'source',
          text: 'Source',
          answer: [{ valueInteger: 5 }],
        },
        {
          linkId: 'dependent',
          text: 'Dependent',
          answer: [{ valueString: 'enabled' }],
        },
      ],
    )
    expect(result.ok).toBe(true)
  })

  it('compares Coding and Quantity enableWhen values semantically', () => {
    const quantity = {
      value: 3,
      system: 'http://unitsofmeasure.org',
      code: 'kg',
    }
    const result = preflightItems(
      [
        { linkId: 'coded', text: 'Coded', type: 'choice' },
        { linkId: 'quantity', text: 'Quantity', type: 'quantity' },
        {
          linkId: 'dependent',
          text: 'Dependent',
          type: 'string',
          enableBehavior: 'all',
          enableWhen: [
            {
              question: 'coded',
              operator: '=',
              answerCoding: { system: codingSystem, code: 'yes' },
            },
            {
              question: 'quantity',
              operator: '=',
              answerQuantity: quantity,
            },
          ],
        },
      ],
      [
        {
          linkId: 'coded',
          text: 'Coded',
          answer: [{ valueCoding: { system: codingSystem, code: 'yes' } }],
        },
        {
          linkId: 'quantity',
          text: 'Quantity',
          answer: [{ valueQuantity: quantity }],
        },
        {
          linkId: 'dependent',
          text: 'Dependent',
          answer: [{ valueString: 'enabled' }],
        },
      ],
    )
    expect(result.ok).toBe(true)
  })

  it('supports exists and any enablement without treating absence as data', () => {
    const result = preflightItems(
      [
        { linkId: 'present', text: 'Present', type: 'boolean' },
        { linkId: 'absent', text: 'Absent', type: 'boolean' },
        {
          linkId: 'dependent',
          text: 'Dependent',
          type: 'string',
          enableBehavior: 'any',
          enableWhen: [
            {
              question: 'present',
              operator: 'exists',
              answerBoolean: false,
            },
            {
              question: 'absent',
              operator: 'exists',
              answerBoolean: false,
            },
          ],
        },
      ],
      [
        {
          linkId: 'present',
          text: 'Present',
          answer: [{ valueBoolean: true }],
        },
        {
          linkId: 'dependent',
          text: 'Dependent',
          answer: [{ valueString: 'enabled' }],
        },
      ],
    )
    expect(result.ok).toBe(true)
  })

  it('fails closed when enableWhen cannot be evaluated', () => {
    const invalidExists = preflightItems(
      [
        { linkId: 'source', text: 'Source', type: 'string' },
        {
          linkId: 'dependent',
          text: 'Dependent',
          type: 'string',
          enableWhen: [
            {
              question: 'source',
              operator: 'exists',
              answerString: 'not-a-boolean',
            },
          ],
        },
      ],
      [],
    )
    expect(invalidExists.ok).toBe(false)

    const incomparable = preflightItems(
      [
        { linkId: 'source', text: 'Source', type: 'string' },
        {
          linkId: 'dependent',
          text: 'Dependent',
          type: 'string',
          enableWhen: [{ question: 'source', operator: '>', answerInteger: 2 }],
        },
      ],
      [
        {
          linkId: 'source',
          text: 'Source',
          answer: [{ valueString: 'two' }],
        },
      ],
    )
    expect(incomparable.ok).toBe(false)
    expect(
      preflightItems(
        [
          { linkId: 'source', text: 'Source', type: 'string' },
          {
            linkId: 'dependent',
            text: 'Dependent',
            type: 'string',
            enableWhen: [
              { question: 'source', operator: '>', answerInteger: 2 },
            ],
          },
        ],
        [],
        {},
        'in-progress',
      ).ok,
    ).toBe(true)
  })

  it('requires external evaluation of completed FHIRPath enablement', () => {
    const items = [
      {
        linkId: 'conditional',
        text: 'Conditional',
        type: 'string',
        extension: [
          {
            url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-enableWhenExpression',
            valueExpression: {
              language: 'text/fhirpath',
              expression: "%resource.status = 'completed'",
            },
          },
        ],
      },
    ] as const
    expect(preflightItems(items, []).ok).toBe(false)
    expect(preflightItems(items, [], {}, 'in-progress').ok).toBe(true)
  })

  it('reports duplicate and invalid questionnaire topology', () => {
    const duplicateAndUnknown = [
      { linkId: 'duplicate', text: 'First', type: 'string' },
      {
        linkId: 'duplicate',
        text: 'Second',
        type: 'string',
        enableWhen: [
          { question: 'missing', operator: '=', answerString: 'yes' },
        ],
      },
    ] as const
    const result = preflightItems(duplicateAndUnknown, [])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(new Set(result.issues.map(({ code }) => code))).toEqual(
      new Set(['duplicate-identifier', 'invalid-reference']),
    )
  })

  it('reports response text, cardinality, grouping, and nesting failures', () => {
    const result = preflightItems(
      [
        { linkId: 'single', text: 'Single', type: 'string' },
        {
          linkId: 'group',
          text: 'Group',
          type: 'group',
          item: [{ linkId: 'child', text: 'Child', type: 'string' }],
        },
      ],
      [
        {
          linkId: 'single',
          text: 'Wrong text',
          answer: [{ valueString: 'one' }, { valueString: 'two' }],
        },
        {
          linkId: 'group',
          text: 'Group',
          answer: [{ valueString: 'not admitted' }],
        },
        { linkId: 'unknown', text: 'Unknown' },
        { linkId: 'single', text: 'Single' },
      ],
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(new Set(result.issues.map(({ code }) => code))).toEqual(
      new Set([
        'duplicate-identifier',
        'invalid-reference',
        'invalid-type',
        'out-of-range',
        'value-mismatch',
      ]),
    )
  })

  it('rejects a resolved ValueSet nonmember and duplicate expansions', () => {
    const valueSetCanonical = unwrap(
      parseCanonical('https://example.org/fhir/ValueSet/mood|1.0.0'),
    )
    const items = [
      {
        linkId: 'mood',
        text: 'Mood',
        type: 'choice',
        answerValueSet: valueSetCanonical,
      },
    ] as const
    const responseItems = [
      {
        linkId: 'mood',
        text: 'Mood',
        answer: [
          { valueCoding: { system: codingSystem, code: 'not-admitted' } },
        ],
      },
    ] as const
    const expansion = {
      canonical: valueSetCanonical,
      concepts: [{ system: codingSystem, code: 'admitted' }],
    }
    const result = preflightItems(items, responseItems, {
      valueSets: [expansion, expansion],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(new Set(result.issues.map(({ code }) => code))).toEqual(
      new Set(['duplicate-identifier', 'value-mismatch']),
    )
  })

  it('rejects entered-in-error answer data', () => {
    expect(
      preflightQuestionnairePair(questionnaire, {
        ...response,
        status: 'entered-in-error',
      }).ok,
    ).toBe(false)
  })

  it('preserves arbitrary textual answers under property testing', () => {
    expect(() =>
      assert(
        property(string({ minLength: 1 }), (value) => {
          const candidate = unwrap(
            buildQuestionnaireResponse(responseInput(value)),
          )
          const result = preflightQuestionnairePair(questionnaire, candidate)
          return result.ok
        }),
      ),
    ).not.toThrow()
  })
})

describe('Questionnaire type contract', () => {
  it('requires exactly one answer value at compile time', () => {
    const answer: QuestionnaireResponseAnswerInput = { valueBoolean: true }
    expect(answer.valueBoolean).toBe(true)

    // @ts-expect-error Multiple value[x] members are not a valid answer.
    const invalid: QuestionnaireResponseAnswerInput = {
      valueBoolean: true,
      valueString: 'true',
    }
    expect(invalid).toBeDefined()
  })

  it.each([
    '0.0.0',
    '1.2.3-alpha.1',
    '1.2.3+build.0042',
    '1.2.3-alpha.1+build.0042',
  ])('accepts SemVer %s', (candidate) => {
    expect(parseSemVer(candidate).ok).toBe(true)
  })

  it.each(['1.2', '01.2.3', '1.02.3', '1.2.3-01', '1.2.3+'])(
    'rejects non-SemVer %s',
    (candidate) => {
      expect(parseSemVer(candidate).ok).toBe(false)
    },
  )
})
