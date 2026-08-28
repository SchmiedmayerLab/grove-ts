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
  url,
} from './questionnaire-test-support.js'
import {
  buildQuestionnaire,
  buildQuestionnaireResponse,
  parseAbsoluteUri,
  parseCanonical,
  preflightQuestionnairePair,
} from '../src/index.js'

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

  it('requires the typed response subject to be admitted by Questionnaire.subjectType', () => {
    const mismatched = buildQuestionnaireResponse({
      ...responseInput(),
      subject: { type: 'Observation', reference: 'Observation/example' },
    })
    expect(mismatched.ok).toBe(true)
    if (!mismatched.ok) return
    const result = preflightQuestionnairePair(questionnaire, mismatched.value)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: 'value-mismatch',
          path: ['response', 'subject', 'type'],
        }),
      )
    }
  })

  it('resolves literal and contained subject types against Questionnaire subjectType', () => {
    expect(
      preflightQuestionnairePair(questionnaire, {
        ...response,
        subject: { reference: 'Patient/example/_history/2' },
      }).ok,
    ).toBe(true)
    expect(
      preflightQuestionnairePair(questionnaire, {
        ...response,
        contained: [{ resourceType: 'Patient', id: 'contained-subject' }],
        subject: { reference: '#contained-subject' },
      }).ok,
    ).toBe(true)
    expect(
      preflightQuestionnairePair(questionnaire, {
        ...response,
        subject: { type: 'Observation', reference: 'Patient/example' },
      }).ok,
    ).toBe(false)
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
})
