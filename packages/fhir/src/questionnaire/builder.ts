//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import type { z } from 'zod'
import { groveQuestionnaireProfileCanonicals } from './contract.generated.js'
import {
  validateQuestionnaireContract,
  validateQuestionnaireResponseItemContract,
} from './contract.js'
import { parseQuestionnaire, parseQuestionnaireResponse } from './parse.js'
import { isR4ResourceType } from './r4-resource-types.js'
import {
  isExactQuestionnaireUrl,
  isQuestionnaireResponseBuilderReference,
  QUESTIONNAIRE_RESPONSE_AUTHOR_TYPES,
  QUESTIONNAIRE_RESPONSE_SOURCE_TYPES,
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
} from './types.js'
import {
  cloneJsonValue,
  err,
  issues,
  parseAbsoluteUri,
  parseCanonical,
  parseFhirId,
  parseFhirInstant,
  parseSemVer,
  type Issue,
  type Result,
} from '../core/index.js'

/* eslint-disable sonarjs/no-clear-text-protocols -- FHIR R4 canonicals are normative HTTP URIs. */

const VERSION_ALGORITHM =
  'http://hl7.org/fhir/StructureDefinition/artifact-versionAlgorithm'
const VERSION_ALGORITHM_SYSTEM = 'http://hl7.org/fhir/version-algorithm'
const COMPLETION_MODE =
  'http://hl7.org/fhir/StructureDefinition/questionnaireresponse-completionMode'
const PARTICIPATION_MODE =
  'http://terminology.hl7.org/CodeSystem/v3-ParticipationMode'
const issue = (
  code: Issue['code'],
  path: Issue['path'],
  message: string,
): Issue => ({ severity: 'error', code, path, message })

const schemaIssue = (entry: z.core.$ZodIssue): Issue => ({
  severity: 'error',
  code: 'schema-invalid',
  path: entry.path.map((component) =>
    typeof component === 'symbol' ?
      (component.description ?? component.toString())
    : component,
  ),
  message: entry.message,
})

const parseBuilderInput = <T>(schema: z.ZodType, input: unknown): Result<T> => {
  const snapshot = cloneJsonValue(input)
  if (!snapshot.ok) return snapshot
  try {
    const parsed = schema.safeParse(snapshot.value)
    return parsed.success ?
        ({ ok: true, value: parsed.data as T, warnings: [] } as const)
      : issues(parsed.error.issues.map(schemaIssue))
  } catch {
    return err(
      'schema-invalid',
      'Questionnaire builder input could not be safely inspected.',
    )
  }
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
  if (input.subjectTypes?.some((entry) => entry.trim() === '') === true) {
    failures.push(
      issue(
        'missing-required',
        ['subjectTypes'],
        'Questionnaire.subjectTypes cannot contain empty resource type codes.',
      ),
    )
  }
  if (
    input.subjectTypes?.some(
      (entry) => entry.trim() !== '' && !isR4ResourceType(entry),
    ) === true
  ) {
    failures.push(
      issue(
        'invalid-code',
        ['subjectTypes'],
        'Questionnaire.subjectTypes contains an unknown R4 ResourceType code.',
      ),
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
    status: validatedInput.status,
    ...(validatedInput.subjectTypes === undefined ?
      {}
    : { subjectType: validatedInput.subjectTypes }),
    ...(validatedInput.date === undefined ? {} : { date: validatedInput.date }),
    ...(validatedInput.description === undefined ?
      {}
    : { description: validatedInput.description }),
    ...(validatedInput.purpose === undefined ?
      {}
    : { purpose: validatedInput.purpose }),
    item: validatedInput.items,
  })
}

const validateResponseInput = (
  input: QuestionnaireResponseInput,
): readonly Issue[] => {
  const failures: Issue[] = []
  const canonical = parseCanonical(input.questionnaire)
  if (!canonical.ok || !/^[^|#]+\|[^|#]+$/u.test(input.questionnaire)) {
    failures.push(
      issue(
        'invalid-uri',
        ['questionnaire'],
        'Response.questionnaire must be an exact url|version canonical.',
      ),
    )
  }
  const version = input.questionnaire.split('|')[1]
  if (!parseSemVer(version).ok) {
    failures.push(
      issue(
        'invalid-code',
        ['questionnaire'],
        'Response.questionnaire version must be SemVer.',
      ),
    )
  }
  if (
    !parseAbsoluteUri(input.identifier.system).ok ||
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
  if (
    input.subject !== undefined &&
    !isQuestionnaireResponseBuilderReference(input.subject)
  ) {
    failures.push(
      issue(
        'invalid-reference',
        ['subject'],
        'Response.subject requires one typed literal or identifier-only logical R4 Reference.',
      ),
    )
  }
  for (const [field, reference, allowedTypes] of [
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

/** Builds a Grove R4 QuestionnaireResponse for one exact instrument version. */
export const buildQuestionnaireResponse = (
  input: QuestionnaireResponseInput,
): Result<GroveQuestionnaireResponse> => {
  const parsedInput = parseBuilderInput<QuestionnaireResponseInput>(
    questionnaireResponseBuilderInputSchema,
    input,
  )
  if (!parsedInput.ok) return parsedInput
  const validatedInput = parsedInput.value
  const failures = validateResponseInput(validatedInput)
  if (failures.length > 0) return issues(failures)

  return parseQuestionnaireResponse({
    resourceType: 'QuestionnaireResponse',
    ...(validatedInput.id === undefined ? {} : { id: validatedInput.id }),
    meta: {
      profile: [
        groveQuestionnaireProfileCanonicals['grove-questionnaire-response'],
      ],
    },
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
    questionnaire: validatedInput.questionnaire,
    status: validatedInput.status,
    ...(validatedInput.subject === undefined ?
      {}
    : { subject: validatedInput.subject }),
    authored: validatedInput.authored,
    ...(validatedInput.author === undefined ?
      {}
    : { author: validatedInput.author }),
    ...(validatedInput.source === undefined ?
      {}
    : { source: validatedInput.source }),
    ...(validatedInput.items === undefined ?
      {}
    : { item: validatedInput.items }),
  })
}
