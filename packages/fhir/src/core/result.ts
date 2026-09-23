//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import type { z } from 'zod'
import type { ProducerDiagnosticCode } from '../contract/measurement-catalog.generated.js'

export type IssueSeverity = 'error' | 'warning'

/** A failure of this package's own input contract, outside the producer registry. */
export type SchemaIssueCode =
  | 'duplicate-identifier'
  | 'external-validation-required'
  | 'invalid-choice'
  | 'invalid-code'
  | 'invalid-date-time'
  | 'invalid-identifier'
  | 'invalid-reference'
  | 'invalid-type'
  | 'invalid-uri'
  | 'missing-required'
  | 'out-of-range'
  | 'schema-invalid'
  | 'value-mismatch'

/** A Questionnaire rule, under the id grove-fhir's Questionnaire validator reports it with. */
export type QuestionnaireRuleCode =
  | 'gqr-language-required'
  | 'pair-item-text'
  | 'pair-response-language'
  | 'qg-language-required'
  | 'qg-translation-1'

export type IssueCode =
  SchemaIssueCode | QuestionnaireRuleCode | ProducerDiagnosticCode

export interface Issue {
  readonly severity: IssueSeverity
  readonly code: IssueCode
  readonly path: ReadonlyArray<string | number>
  readonly message: string
  /** Exact normative producer-rule reason when this is a Grove protocol diagnostic. */
  readonly reason?: string
  /** Stable FHIR-facing producer-rule location, independent of parser internals. */
  readonly location?: string
}

/**
 * An issue under a grove-fhir registry rule, as opposed to a schema issue of this package's
 * own input contract: its code is registered and carries the registry's reason.
 */
export interface ProducerDiagnostic extends Issue {
  readonly code: ProducerDiagnosticCode
  readonly reason: string
}

// IssueCode is closed, so a code outside the schema and Questionnaire rule codes is registered.
const unregisteredIssueCodes: Readonly<
  Record<SchemaIssueCode | QuestionnaireRuleCode, true>
> = {
  'duplicate-identifier': true,
  'external-validation-required': true,
  'invalid-choice': true,
  'invalid-code': true,
  'invalid-date-time': true,
  'invalid-identifier': true,
  'invalid-reference': true,
  'invalid-type': true,
  'invalid-uri': true,
  'missing-required': true,
  'out-of-range': true,
  'schema-invalid': true,
  'value-mismatch': true,
  'gqr-language-required': true,
  'pair-item-text': true,
  'pair-response-language': true,
  'qg-language-required': true,
  'qg-translation-1': true,
}

export const isProducerDiagnostic = (
  issue: Issue,
): issue is ProducerDiagnostic =>
  !Object.hasOwn(unregisteredIssueCodes, issue.code) &&
  typeof issue.reason === 'string'

export type Result<T> =
  | {
      readonly ok: true
      readonly value: T
      /** Non-blocking findings that the caller must still surface or record. */
      readonly warnings?: readonly Issue[]
    }
  | { readonly ok: false; readonly issues: readonly Issue[] }

export const ok = <T>(value: T, warnings: readonly Issue[] = []): Result<T> =>
  warnings.length === 0 ? { ok: true, value } : { ok: true, value, warnings }

export const err = <T = never>(
  code: IssueCode,
  message: string,
  path: ReadonlyArray<string | number> = [],
): Result<T> => ({
  ok: false,
  issues: [{ severity: 'error', code, path, message }],
})

export const issues = <T = never>(entries: readonly Issue[]): Result<T> => ({
  ok: false,
  issues: entries,
})

export const issue = (
  code: IssueCode,
  path: Issue['path'],
  message: string,
): Issue => ({ severity: 'error', code, path, message })

/** A zod path with symbol keys rendered as the text a caller can act on. */
export const zodIssuePath = (
  entry: z.core.$ZodIssue,
): ReadonlyArray<string | number> =>
  entry.path.map((component) =>
    typeof component === 'symbol' ?
      (component.description ?? component.toString())
    : component,
  )

/** A base schema failure as a Grove Issue; producer rules carry their own code. */
export const zodIssueToIssue = (entry: z.core.$ZodIssue): Issue => ({
  severity: 'error',
  code: 'schema-invalid',
  path: zodIssuePath(entry),
  message: entry.message,
})

export const mapResult = <T, U>(
  result: Result<T>,
  transform: (value: T) => U,
): Result<U> =>
  result.ok ? ok(transform(result.value), result.warnings ?? []) : result

export const collectResults = <T>(
  results: ReadonlyArray<Result<T>>,
): Result<readonly T[]> => {
  const values: T[] = []
  const failures: Issue[] = []
  const warnings: Issue[] = []

  for (const result of results) {
    if (result.ok) {
      values.push(result.value)
      warnings.push(...(result.warnings ?? []))
    } else {
      failures.push(...result.issues)
    }
  }

  return failures.length === 0 ? ok(values, warnings) : issues(failures)
}
