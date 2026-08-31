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
  questionnaireExtensions,
  questionnaireInput,
  unwrap,
} from './questionnaire-test-support.js'
import {
  buildQuestionnaire,
  parseAbsoluteUri,
  parseCanonical,
} from '../src/index.js'

describe('Questionnaire pair preflight', () => {
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
})
