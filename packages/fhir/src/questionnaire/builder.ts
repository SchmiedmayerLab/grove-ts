//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import type { z } from 'zod'
import {
  validateQuestionnaireContract,
  validateQuestionnaireResponseItemContract,
} from './contract.js'
import { isLanguageTag, offeredLanguages } from './localization.js'
import { parseQuestionnaire, parseQuestionnaireResponse } from './parse.js'
import { prefixed } from './preflight-diagnostics.js'
import {
  QUESTIONNAIRE_EXTENSIONS,
  QUESTIONNAIRE_SYSTEMS,
} from './questionnaire-extensions.js'
import {
  isExactQuestionnaireUrl,
  isQuestionnaireResponseBuilderReference,
  QUESTIONNAIRE_RESPONSE_AUTHOR_TYPES,
  QUESTIONNAIRE_RESPONSE_SOURCE_TYPES,
  QUESTIONNAIRE_RESPONSE_SUBJECT_TYPES,
} from './references.js'
import {
  questionnaireBuilderInputSchema,
  questionnaireResponseBuilderInputSchema,
} from './schemas.js'
import type {
  GroveQuestionnaire,
  GroveQuestionnaireResponse,
  QuestionnaireInput,
  QuestionnaireResponseInput,
  QuestionnaireResponseItemInput,
} from './types.js'
import { groveQuestionnaireProfileCanonicals } from '../contract/questionnaire.generated.js'
import {
  cloneJsonValue,
  issue,
  issues,
  parseFhirId,
  parseFhirInstant,
  parseIdentifierSystem,
  parseSemVer,
  zodIssueToIssue,
  type Issue,
  type Result,
} from '../core/index.js'

const VERSION_ALGORITHM = QUESTIONNAIRE_EXTENSIONS.versionAlgorithm
const VERSION_ALGORITHM_SYSTEM = QUESTIONNAIRE_SYSTEMS.versionAlgorithm
const COMPLETION_MODE = QUESTIONNAIRE_EXTENSIONS.completionMode
const PARTICIPATION_MODE = QUESTIONNAIRE_SYSTEMS.participationMode
const parseBuilderInput = <T>(schema: z.ZodType, input: unknown): Result<T> => {
  const snapshot = cloneJsonValue(input)
  if (!snapshot.ok) return snapshot
  const parsed = schema.safeParse(snapshot.value)
  return parsed.success ?
      ({ ok: true, value: parsed.data as T, warnings: [] } as const)
    : issues(parsed.error.issues.map(zodIssueToIssue))
}

const extensionCount = (
  extensions: ReadonlyArray<{ readonly url?: string }> | undefined,
  url: string,
) => extensions?.filter((extension) => extension.url === url).length ?? 0

const validateQuestionnaireInput = (
  input: QuestionnaireInput,
): readonly Issue[] => {
  const failures: Issue[] = []
  if (!isExactQuestionnaireUrl(input.url)) {
    failures.push(
      issue(
        'invalid-uri',
        ['url'],
        'Questionnaire.url must be an exact absolute HTTP(S) canonical without a fragment or version delimiter.',
      ),
    )
  }
  if (!parseSemVer(input.version).ok) {
    failures.push(
      issue(
        'invalid-code',
        ['version'],
        'Questionnaire.version must be SemVer.',
      ),
    )
  }
  if (!isLanguageTag(input.language)) {
    failures.push(
      issue(
        'invalid-code',
        ['language'],
        'Questionnaire.language must be a BCP 47 language tag.',
      ),
    )
  }
  if (input.id !== undefined && !parseFhirId(input.id).ok) {
    failures.push(
      issue('invalid-identifier', ['id'], 'Questionnaire.id is invalid.'),
    )
  }
  if (input.date !== undefined && !parseFhirInstant(input.date).ok) {
    failures.push(
      issue('invalid-date-time', ['date'], 'Questionnaire.date is invalid.'),
    )
  }
  if (extensionCount(input.extensions, VERSION_ALGORITHM) > 0) {
    failures.push(
      issue(
        'duplicate-identifier',
        ['extensions'],
        'The builder owns the single SemVer algorithm extension.',
      ),
    )
  }
  failures.push(...validateQuestionnaireContract(input.extensions, input.items))
  return failures
}

/** Builds a versioned Grove R4 Questionnaire with the SemVer contract stamped. */
export const buildQuestionnaire = (
  input: QuestionnaireInput,
): Result<GroveQuestionnaire> => {
  const parsedInput = parseBuilderInput<QuestionnaireInput>(
    questionnaireBuilderInputSchema,
    input,
  )
  if (!parsedInput.ok) return parsedInput
  const validatedInput = parsedInput.value
  const failures = validateQuestionnaireInput(validatedInput)
  if (failures.length > 0) return issues(failures)

  return parseQuestionnaire({
    resourceType: 'Questionnaire',
    ...(validatedInput.id === undefined ? {} : { id: validatedInput.id }),
    meta: {
      profile: [groveQuestionnaireProfileCanonicals['grove-questionnaire']],
    },
    language: validatedInput.language,
    extension: [
      ...(validatedInput.extensions ?? []),
      {
        url: VERSION_ALGORITHM,
        valueCoding: {
          system: VERSION_ALGORITHM_SYSTEM,
          code: 'semver',
        },
      },
    ],
    url: validatedInput.url,
    version: validatedInput.version,
    ...(validatedInput.name === undefined ? {} : { name: validatedInput.name }),
    ...(validatedInput.title === undefined ?
      {}
    : { title: validatedInput.title }),
    ...(validatedInput._title === undefined ?
      {}
    : { _title: validatedInput._title }),
    status: validatedInput.status,
    subjectType: validatedInput.subjectTypes,
    ...(validatedInput.date === undefined ? {} : { date: validatedInput.date }),
    ...(validatedInput.description === undefined ?
      {}
    : { description: validatedInput.description }),
    ...(validatedInput._description === undefined ?
      {}
    : { _description: validatedInput._description }),
    ...(validatedInput.purpose === undefined ?
      {}
    : { purpose: validatedInput.purpose }),
    item: validatedInput.items,
  })
}

const validateResponseInput = (
  input: QuestionnaireResponseInput,
  questionnaire: GroveQuestionnaire,
): readonly Issue[] => {
  const failures: Issue[] = []
  if (!offeredLanguages(questionnaire).has(input.language)) {
    failures.push(
      issue(
        'value-mismatch',
        ['language'],
        'Response.language must be the Questionnaire base language or one of its translation languages.',
      ),
    )
  }
  if (
    !parseIdentifierSystem(input.identifier.system).ok ||
    input.identifier.value.trim() === ''
  ) {
    failures.push(
      issue(
        'invalid-identifier',
        ['identifier'],
        'Response identifier requires an absolute system and non-empty value.',
      ),
    )
  }
  if (!parseFhirInstant(input.authored).ok) {
    failures.push(
      issue('invalid-date-time', ['authored'], 'Response.authored is invalid.'),
    )
  }
  if (input.id !== undefined && !parseFhirId(input.id).ok) {
    failures.push(
      issue('invalid-identifier', ['id'], 'Response.id is invalid.'),
    )
  }
  for (const [field, reference, allowedTypes] of [
    ['subject', input.subject, QUESTIONNAIRE_RESPONSE_SUBJECT_TYPES],
    ['author', input.author, QUESTIONNAIRE_RESPONSE_AUTHOR_TYPES],
    ['source', input.source, QUESTIONNAIRE_RESPONSE_SOURCE_TYPES],
  ] as const) {
    if (
      reference !== undefined &&
      !isQuestionnaireResponseBuilderReference(reference, allowedTypes)
    ) {
      failures.push(
        issue(
          'invalid-reference',
          [field],
          `${field} requires one typed literal or identifier-only logical Reference to an admitted target type.`,
        ),
      )
    }
  }
  if (extensionCount(input.extensions, COMPLETION_MODE) > 0) {
    failures.push(
      issue(
        'duplicate-identifier',
        ['extensions'],
        'The builder owns the single electronic completion-mode extension.',
      ),
    )
  }
  failures.push(
    ...validateQuestionnaireResponseItemContract(input.items ?? [], ['items']),
  )
  return failures
}

type QuestionnaireItem = GroveQuestionnaire['item'][number]

// Response text repeats the base Questionnaire text, so only a base-language response carries it.
const itemsWithText = (
  items: readonly QuestionnaireResponseItemInput[],
  definitions: readonly QuestionnaireItem[],
  writeText: boolean,
  path: ReadonlyArray<number | string>,
  failures: Issue[],
): readonly object[] =>
  items.map((item, index) => {
    const itemPath = [...path, index]
    const definition = definitions.find(
      (candidate) => candidate.linkId === item.linkId,
    )
    if (definition === undefined) {
      failures.push(
        issue(
          'invalid-reference',
          [...itemPath, 'linkId'],
          `Response linkId ${item.linkId} is not valid at this nesting level.`,
        ),
      )
      return item
    }
    const children = definition.item ?? []
    const { answer, item: nested, ...element } = item
    return {
      ...element,
      ...(writeText && definition.text !== undefined ?
        { text: definition.text }
      : {}),
      ...(answer === undefined ?
        {}
      : {
          answer: answer.map((entry, answerIndex) =>
            entry.item === undefined ?
              entry
            : {
                ...entry,
                item: itemsWithText(
                  entry.item,
                  children,
                  writeText,
                  [...itemPath, 'answer', answerIndex, 'item'],
                  failures,
                ),
              },
          ),
        }),
      ...(nested === undefined ?
        {}
      : {
          item: itemsWithText(
            nested,
            children,
            writeText,
            [...itemPath, 'item'],
            failures,
          ),
        }),
    }
  })

/** Builds a Grove R4 QuestionnaireResponse to one exact Questionnaire in one of its languages. */
export const buildQuestionnaireResponse = (
  input: QuestionnaireResponseInput,
  questionnaire: GroveQuestionnaire,
): Result<GroveQuestionnaireResponse> => {
  const parsedQuestionnaire = parseQuestionnaire(questionnaire)
  if (!parsedQuestionnaire.ok) {
    return issues(prefixed(parsedQuestionnaire.issues, 'questionnaire'))
  }
  const instrument = parsedQuestionnaire.value
  const parsedInput = parseBuilderInput<QuestionnaireResponseInput>(
    questionnaireResponseBuilderInputSchema,
    input,
  )
  if (!parsedInput.ok) return parsedInput
  const validatedInput = parsedInput.value
  const failures = [...validateResponseInput(validatedInput, instrument)]
  const items =
    validatedInput.items === undefined ?
      undefined
    : itemsWithText(
        validatedInput.items,
        instrument.item,
        validatedInput.language === instrument.language,
        ['items'],
        failures,
      )
  if (failures.length > 0) return issues(failures)

  return parseQuestionnaireResponse({
    resourceType: 'QuestionnaireResponse',
    ...(validatedInput.id === undefined ? {} : { id: validatedInput.id }),
    meta: {
      profile: [
        groveQuestionnaireProfileCanonicals['grove-questionnaire-response'],
      ],
    },
    language: validatedInput.language,
    extension: [
      ...(validatedInput.extensions ?? []),
      {
        url: COMPLETION_MODE,
        valueCodeableConcept: {
          coding: [{ system: PARTICIPATION_MODE, code: 'ELECTRONIC' }],
        },
      },
    ],
    identifier: validatedInput.identifier,
    questionnaire: `${instrument.url}|${instrument.version}`,
    status: validatedInput.status,
    subject: validatedInput.subject,
    authored: validatedInput.authored,
    ...(validatedInput.author === undefined ?
      {}
    : { author: validatedInput.author }),
    ...(validatedInput.source === undefined ?
      {}
    : { source: validatedInput.source }),
    ...(items === undefined ? {} : { item: items }),
  })
}
