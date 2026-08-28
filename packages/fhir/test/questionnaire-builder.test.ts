//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { expectTypeOf } from 'expect-type'
import {
  codingSystem,
  preflightItems,
  questionnaire,
  questionnaireInput,
  response,
  responseInput,
  url,
} from './questionnaire-test-support.js'
import {
  buildQuestionnaire,
  buildQuestionnaireResponse,
  parseQuestionnaire,
  parseQuestionnaireResponse,
  preflightQuestionnairePair,
  type GroveQuestionnaire,
  type QuestionnaireInput,
  type QuestionnaireResponseInput,
} from '../src/index.js'
/* eslint-disable sonarjs/no-clear-text-protocols -- FHIR R4 canonicals are normative HTTP URIs. */

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
            _text: {
              extension: [
                {
                  url: 'https://example.org/fhir/StructureDefinition/localized-value',
                  valueString: 'en-US',
                },
              ],
            },
          }
        : item,
      ),
    }

    const parsed = parseQuestionnaire(input)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value._title).toEqual(input._title)
    expect(parsed.value.item[0]?._text).toEqual(input.item[0]?._text)
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

  it('requires an HTTP(S) versioned instrument canonical and complete response Identifier', () => {
    expect(
      parseQuestionnaireResponse({
        ...response,
        questionnaire: 'urn:example:questionnaire|2.0.0',
      }).ok,
    ).toBe(false)
    expect(
      parseQuestionnaireResponse({
        ...response,
        questionnaire: `${url}#fragment|2.0.0`,
      }).ok,
    ).toBe(false)
    expect(
      parseQuestionnaireResponse({
        ...response,
        identifier: { value: 'response-1' },
      }).ok,
    ).toBe(false)
    expect(
      parseQuestionnaireResponse({
        ...response,
        identifier: {
          system: 'https://例え.example/questionnaire-responses',
          value: 'response-1',
        },
      }).ok,
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
      } as unknown as QuestionnaireInput).ok,
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
})
