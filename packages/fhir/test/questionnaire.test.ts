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
  parseFhirInstant,
  parsePatientReference,
  parseQuestionnaire,
  parseSemVer,
  preflightQuestionnairePair,
  type GroveQuestionnaire,
  type QuestionnaireInput,
  type QuestionnaireResponseAnswerInput,
  type QuestionnaireResponseInput,
  type Result,
} from '../src/index.js'

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
})

describe('Questionnaire pair preflight', () => {
  it('accepts an exact, nested Questionnaire/Response pair', () => {
    const result = preflightQuestionnairePair(questionnaire, response)
    expect(result.ok).toBe(true)
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
        property(string(), (value) => {
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
