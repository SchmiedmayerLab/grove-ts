//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  authored,
  questionnaireInput,
  responseInput,
  unwrap,
} from './questionnaire-test-support.js'
import {
  buildQuestionnaire,
  buildQuestionnaireResponse,
  parseAbsoluteUri,
  parseFhirId,
  parseQuestionnaireResponse,
  type QuestionnaireInput,
  type QuestionnaireResponseInput,
} from '../src/index.js'

describe('Questionnaire R4 builders', () => {
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
      author: { type: 'Practitioner', reference: 'Practitioner/author' },
      source: { type: 'Patient', reference: 'Patient/example' },
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

  it('supports identifier-only typed response actors and rejects disallowed source targets', () => {
    const logical = buildQuestionnaireResponse({
      ...responseInput(),
      author: {
        type: 'PractitionerRole',
        identifier: {
          system: unwrap(
            parseAbsoluteUri('https://example.org/practitioner-roles'),
          ),
          value: 'role-7',
        },
      },
      source: {
        type: 'RelatedPerson',
        identifier: {
          system: unwrap(parseAbsoluteUri('https://example.org/respondents')),
          value: 'respondent-9',
        },
      },
    })
    expect(logical.ok).toBe(true)
    if (!logical.ok) return
    expect(logical.value.author?.type).toBe('PractitionerRole')
    expect(logical.value.source?.identifier?.value).toBe('respondent-9')

    expect(
      parseQuestionnaireResponse({
        ...logical.value,
        source: { type: 'Organization', reference: 'Organization/example' },
      }).ok,
    ).toBe(false)
  })

  it('parses literal, historical, absolute, and contained response references without redundant type', () => {
    const built = buildQuestionnaireResponse(responseInput())
    expect(built.ok).toBe(true)
    if (!built.ok) return

    expect(
      parseQuestionnaireResponse({
        ...built.value,
        subject: { reference: 'Patient/example/_history/2' },
        author: {
          reference: 'https://example.org/fhir/Practitioner/author/_history/7',
        },
        source: { reference: 'RelatedPerson/respondent' },
      }).ok,
    ).toBe(true)
    expect(
      parseQuestionnaireResponse({
        ...built.value,
        contained: [{ resourceType: 'Patient', id: 'contained-subject' }],
        subject: { reference: '#contained-subject' },
      }).ok,
    ).toBe(true)
  })

  it('rejects conflicting, unresolved, and untyped logical response references', () => {
    const built = buildQuestionnaireResponse(responseInput())
    expect(built.ok).toBe(true)
    if (!built.ok) return
    const invalid = [
      {
        ...built.value,
        subject: { type: 'Observation', reference: 'Patient/example' },
      },
      { ...built.value, subject: { reference: 'unresolved-reference' } },
      {
        ...built.value,
        subject: { reference: 'https://repository.example.org/fhir/Patient' },
      },
      {
        ...built.value,
        subject: {
          identifier: {
            system: 'https://example.org/patients',
            value: 'patient-1',
          },
        },
      },
      {
        ...built.value,
        contained: [{ resourceType: 'Patient', id: 'contained-subject' }],
        subject: {
          type: 'Observation',
          reference: '#contained-subject',
        },
      },
      {
        ...built.value,
        contained: [{ resourceType: 'Patient', id: 'other-subject' }],
        subject: { reference: '#missing-subject' },
      },
    ]
    for (const response of invalid) {
      expect(parseQuestionnaireResponse(response as never).ok).toBe(false)
    }
  })

  it('reports the complete bounded QuestionnaireResponse input validation surface', () => {
    const result = buildQuestionnaireResponse({
      questionnaire: 'https://example.org/Questionnaire/pain',
      identifier: { system: '/relative', value: ' ' },
      status: 'completed',
      id: 'invalid/id',
      subject: {
        type: 'Patient',
        reference: 'Patient/example/_history/2',
      },
      authored: 'not-an-instant',
      author: { type: 'Device', reference: ' ' },
      source: { type: 'Organization', reference: '' },
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
