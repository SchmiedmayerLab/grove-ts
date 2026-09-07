//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { assert, property, string } from 'fast-check'
import {
  codingSystem,
  preflightItems,
  questionnaire,
  questionnaireExtensions,
  response,
  responseInput,
  targetConstraint,
  unwrap,
} from './questionnaire-test-support.js'
import {
  buildQuestionnaireResponse,
  parseCanonical,
  preflightQuestionnairePair,
  type QuestionnaireItemInput,
} from '../src/index.js'
import { evaluateEnableWhen } from '../src/questionnaire/preflight-answer-validation.js'

describe('Questionnaire pair preflight', () => {
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

  it('matches any repeated answer for != and treats no answers as false', () => {
    const dependent = {
      linkId: 'dependent',
      text: 'Dependent',
      type: 'string',
      enableWhen: [{ question: 'source', operator: '!=', answerInteger: 5 }],
    } as const satisfies QuestionnaireItemInput

    expect(evaluateEnableWhen(dependent, new Map([['source', [5, 6]]]))).toBe(
      true,
    )
    expect(evaluateEnableWhen(dependent, new Map())).toBe(false)
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
