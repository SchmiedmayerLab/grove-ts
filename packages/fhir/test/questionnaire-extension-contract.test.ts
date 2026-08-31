//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  codingSystem,
  preflightItems,
  questionnaire,
  questionnaireExtensions,
  questionnaireInput,
  response,
  responseInput,
  targetConstraint,
} from './questionnaire-test-support.js'
import {
  buildQuestionnaire,
  buildQuestionnaireResponse,
  parseQuestionnaire,
  parseQuestionnaireResponse,
  type QuestionnaireInput,
} from '../src/index.js'
import {
  compareR4Temporal,
  isR4Date,
  isR4DateTime,
  isR4Time,
} from '../src/questionnaire/temporal.js'

describe('Questionnaire R4 builders', () => {
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
})
