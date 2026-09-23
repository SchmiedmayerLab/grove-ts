//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  codingSystem,
  questionnaire,
  questionnaireInput,
  response,
  responseInput,
  unwrap,
} from './questionnaire-test-support.js'
import {
  buildQuestionnaire,
  buildQuestionnaireResponse,
  parseQuestionnaire,
  parseQuestionnaireResponse,
  preflightQuestionnairePair,
  type Issue,
  type Result,
} from '../src/index.js'

const translation = (lang: string, content: string) => ({
  url: 'http://hl7.org/fhir/StructureDefinition/translation',
  extension: [
    { url: 'lang', valueCode: lang },
    { url: 'content', valueString: content },
  ],
})

const inSpanish = (content: string) => ({
  extension: [translation('es', content)],
})

const multilingual = unwrap(
  buildQuestionnaire({
    ...questionnaireInput,
    _title: inSpanish('Cuestionario de dolor'),
    description: 'How pain affects you.',
    _description: inSpanish('Cómo le afecta el dolor.'),
    items: [
      {
        linkId: 'has-pain',
        prefix: '1.',
        _prefix: inSpanish('1.ª'),
        text: 'Are you in pain?',
        _text: inSpanish('¿Tiene dolor?'),
        type: 'boolean',
      },
      {
        linkId: 'location',
        text: 'Where?',
        _text: inSpanish('¿Dónde?'),
        type: 'string',
        answerOption: [
          { valueString: 'Head', _valueString: inSpanish('Cabeza') },
          { valueString: 'Back', _valueString: inSpanish('Espalda') },
        ],
      },
      {
        linkId: 'severity',
        text: 'How severe?',
        type: 'choice',
        answerOption: [
          {
            valueCoding: {
              system: codingSystem,
              code: 'mild',
              display: 'Mild',
              _display: inSpanish('Leve'),
            },
          },
        ],
      },
    ],
  }),
)

const answers = {
  ...responseInput(),
  items: [
    { linkId: 'has-pain', answer: [{ valueBoolean: true }] },
    { linkId: 'location', answer: [{ valueString: 'Head' }] },
  ],
}

const withoutLanguage = (value: object): unknown => {
  const copy = { ...value }
  Reflect.deleteProperty(copy, 'language')
  return copy
}

const codes = (result: Result<unknown>): ReadonlySet<Issue['code']> =>
  new Set(result.ok ? [] : result.issues.map(({ code }) => code))

describe('Questionnaire localization', () => {
  it('keeps the base language and every translation in one Questionnaire', () => {
    expect(multilingual.language).toBe('en-US')
    expect(multilingual._title).toEqual(inSpanish('Cuestionario de dolor'))
    expect(multilingual._description).toEqual(
      inSpanish('Cómo le afecta el dolor.'),
    )
    expect(multilingual.item[0]?._text).toEqual(inSpanish('¿Tiene dolor?'))
    expect(multilingual.item[0]?._prefix).toEqual(inSpanish('1.ª'))
    expect(multilingual.item[1]?.answerOption?.[0]).toEqual({
      valueString: 'Head',
      _valueString: inSpanish('Cabeza'),
    })
    expect(
      multilingual.item[2]?.answerOption?.[0]?.valueCoding?._display,
    ).toEqual(inSpanish('Leve'))
    expect(parseQuestionnaire(multilingual)).toEqual({
      ok: true,
      value: multilingual,
    })
  })

  it('requires a BCP 47 base language on both resources', () => {
    expect(codes(parseQuestionnaire(withoutLanguage(questionnaire)))).toEqual(
      new Set(['schema-invalid']),
    )
    expect(
      codes(parseQuestionnaireResponse(withoutLanguage(response))),
    ).toEqual(new Set(['schema-invalid']))
    expect(
      codes(parseQuestionnaire({ ...questionnaire, language: 'en_US' })),
    ).toEqual(new Set(['invalid-code']))
    expect(
      codes(parseQuestionnaireResponse({ ...response, language: 'en US' })),
    ).toEqual(new Set(['invalid-code']))
    expect(
      codes(buildQuestionnaire({ ...questionnaireInput, language: '' })),
    ).toEqual(new Set(['invalid-code']))
  })

  it('rejects malformed and ambiguous translations', () => {
    const withTitleExtensions = (extension: readonly object[]) =>
      parseQuestionnaire({ ...questionnaire, _title: { extension } })
    expect(
      codes(
        withTitleExtensions([
          {
            url: 'http://hl7.org/fhir/StructureDefinition/translation',
            extension: [{ url: 'lang', valueCode: 'es' }],
          },
        ]),
      ),
    ).toEqual(new Set(['invalid-type']))
    expect(
      codes(withTitleExtensions([translation('not a tag', 'Dolor')])),
    ).toEqual(new Set(['invalid-type']))
    const duplicated = withTitleExtensions([
      translation('es', 'Dolor'),
      translation('ES', 'Dolores'),
      translation('en-us', 'Pain'),
    ])
    expect(duplicated.ok).toBe(false)
    if (duplicated.ok) return
    expect(duplicated.issues).toEqual([
      expect.objectContaining({
        code: 'duplicate-identifier',
        path: ['_title', 'extension', 1],
      }),
      expect.objectContaining({
        code: 'duplicate-identifier',
        path: ['_title', 'extension', 2],
      }),
    ])
  })

  it('admits _valueString only beside a valueString option', () => {
    expect(
      buildQuestionnaire({
        ...questionnaireInput,
        items: [
          {
            linkId: 'severity',
            text: 'How severe?',
            type: 'choice',
            answerOption: [
              {
                valueCoding: { system: codingSystem, code: 'mild' },
                _valueString: inSpanish('Leve'),
              },
            ],
          },
        ],
      }).ok,
    ).toBe(false)
  })

  it('writes response text only for the base language', () => {
    const base = unwrap(buildQuestionnaireResponse(answers, multilingual))
    expect(base.language).toBe('en-US')
    expect(base.questionnaire).toBe(
      `${multilingual.url}|${multilingual.version}`,
    )
    expect(base.item?.map(({ text }) => text)).toEqual([
      'Are you in pain?',
      'Where?',
    ])

    const translated = unwrap(
      buildQuestionnaireResponse({ ...answers, language: 'es' }, multilingual),
    )
    expect(translated.language).toBe('es')
    expect(translated.item?.some((item) => 'text' in item)).toBe(false)
    expect(translated.item?.[1]?.answer).toEqual([{ valueString: 'Head' }])

    for (const pair of [base, translated]) {
      expect(preflightQuestionnairePair(multilingual, pair).ok).toBe(true)
    }

    // BCP 47 tags compare case-insensitively.
    const recased = unwrap(
      buildQuestionnaireResponse(
        { ...answers, language: 'EN-us' },
        multilingual,
      ),
    )
    expect(recased.item?.[0]?.text).toBe('Are you in pain?')
    expect(
      preflightQuestionnairePair(multilingual, {
        ...translated,
        language: 'ES',
      }).ok,
    ).toBe(true)
  })

  it('writes nested group and answer-child text from the base Questionnaire', () => {
    expect(response.item?.[0]?.text).toBe('Health')
    expect(response.item?.[0]?.item?.[0]?.text).toBe('Are you in pain?')
    expect(response.item?.[0]?.item?.[0]?.answer?.[0]?.item?.[0]?.text).toBe(
      'How severe is the pain?',
    )
  })

  it('rejects a response language or linkId the Questionnaire does not offer', () => {
    const unoffered = buildQuestionnaireResponse(
      { ...answers, language: 'es-MX' },
      multilingual,
    )
    expect(unoffered.ok).toBe(false)
    if (unoffered.ok) return
    expect(unoffered.issues).toEqual([
      expect.objectContaining({ code: 'value-mismatch', path: ['language'] }),
    ])

    const undeclared = buildQuestionnaireResponse(
      {
        ...answers,
        items: [
          {
            linkId: 'has-pain',
            answer: [
              {
                valueBoolean: true,
                item: [{ linkId: 'undeclared', answer: [{ valueInteger: 1 }] }],
              },
            ],
          },
        ],
      },
      multilingual,
    )
    expect(undeclared.ok).toBe(false)
    if (undeclared.ok) return
    expect(undeclared.issues).toEqual([
      expect.objectContaining({
        code: 'invalid-reference',
        path: ['items', 0, 'answer', 0, 'item', 0, 'linkId'],
      }),
    ])

    expect(
      codes(
        buildQuestionnaireResponse(
          answers,
          withoutLanguage(multilingual) as typeof multilingual,
        ),
      ),
    ).toEqual(new Set(['schema-invalid']))
  })

  it('reports translated response text and an unoffered language as pair errors', () => {
    const translated = unwrap(
      buildQuestionnaireResponse({ ...answers, language: 'es' }, multilingual),
    )
    const result = preflightQuestionnairePair(multilingual, {
      ...translated,
      language: 'fr',
      item: [
        {
          linkId: 'has-pain',
          text: '¿Tiene dolor?',
          answer: [{ valueBoolean: true }],
        },
        { linkId: 'location', answer: [{ valueString: 'Cabeza' }] },
      ],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(
      result.issues.map(({ code, path }) => [code, path.join('.')]),
    ).toEqual(
      expect.arrayContaining([
        ['value-mismatch', 'response.language'],
        ['value-mismatch', 'response.item.0.text'],
        ['value-mismatch', 'response.item.1.answer.0'],
      ]),
    )
  })
})
