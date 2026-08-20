//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type z } from 'zod'
import { questionnaireResponseSchema, questionnaireSchema } from './schemas.js'
import type { GroveQuestionnaire, GroveQuestionnaireResponse } from './types.js'
import {
  deepFreeze,
  issues,
  ok,
  type Issue,
  type Result,
} from '../core/index.js'

const normalizeIssue = (entry: z.core.$ZodIssue): Issue => ({
  severity: 'error',
  code: 'schema-invalid',
  path: entry.path.map((component) =>
    typeof component === 'symbol' ?
      (component.description ?? component.toString())
    : component,
  ),
  message: entry.message,
})

const parseWith = <T>(schema: z.ZodType, input: unknown): Result<T> => {
  const result = schema.safeParse(input)
  if (!result.success) return issues(result.error.issues.map(normalizeIssue))
  return ok(deepFreeze(result.data) as T)
}

export const parseQuestionnaire = (
  input: unknown,
): Result<GroveQuestionnaire> => parseWith(questionnaireSchema, input)

export const parseQuestionnaireResponse = (
  input: unknown,
): Result<GroveQuestionnaireResponse> =>
  parseWith(questionnaireResponseSchema, input)
