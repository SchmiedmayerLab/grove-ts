//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import type { z } from 'zod'

export type IssueSeverity = 'error' | 'warning'

/**
 * Namespaced producer-rule identifier. The registry that names them lives above core,
 * so this states only the contract's `namespace.rule` grammar.
 */
type GroveProducerRuleCode = `${string}.${string}`

export type IssueCode =
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
  | 'unsupported-measurement'
  | 'value-mismatch'
  | GroveProducerRuleCode

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
