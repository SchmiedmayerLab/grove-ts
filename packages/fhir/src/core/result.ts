//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

export type IssueSeverity = 'error' | 'warning'

export type IssueCode =
  | 'duplicate-identifier'
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

export interface Issue {
  readonly severity: IssueSeverity
  readonly code: IssueCode
  readonly path: ReadonlyArray<string | number>
  readonly message: string
}

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly Issue[] }

export const ok = <T>(value: T): Result<T> => ({ ok: true, value })

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

export const mapResult = <T, U>(
  result: Result<T>,
  transform: (value: T) => U,
): Result<U> => (result.ok ? ok(transform(result.value)) : result)

export const collectResults = <T>(
  results: ReadonlyArray<Result<T>>,
): Result<readonly T[]> => {
  const values: T[] = []
  const failures: Issue[] = []

  for (const result of results) {
    if (result.ok) {
      values.push(result.value)
    } else {
      failures.push(...result.issues)
    }
  }

  return failures.length === 0 ? ok(values) : issues(failures)
}
