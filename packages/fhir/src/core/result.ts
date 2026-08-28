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
  | `mobile-${string}`

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

type InspectedResult<T> =
  | {
      readonly ok: true
      readonly value: T
      readonly warnings: readonly Issue[]
    }
  | { readonly ok: false; readonly issues: readonly Issue[] }

const isIssue = (value: unknown): value is Issue => {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<Issue>
  return (
    ['error', 'warning'].includes(String(candidate.severity)) &&
    typeof candidate.code === 'string' &&
    Array.isArray(candidate.path) &&
    candidate.path.every(
      (component) =>
        typeof component === 'string' || typeof component === 'number',
    ) &&
    typeof candidate.message === 'string' &&
    (candidate.reason === undefined || typeof candidate.reason === 'string') &&
    (candidate.location === undefined || typeof candidate.location === 'string')
  )
}

const inspectResult = <T>(value: unknown): InspectedResult<T> | undefined => {
  try {
    if (typeof value !== 'object' || value === null) return undefined
    const candidate = value as {
      readonly ok?: unknown
      readonly value?: T
      readonly warnings?: unknown
      readonly issues?: unknown
    }
    if (candidate.ok === true) {
      const warnings = candidate.warnings ?? []
      return Array.isArray(warnings) && warnings.every(isIssue) ?
          { ok: true, value: candidate.value as T, warnings }
        : undefined
    }
    return (
        candidate.ok === false &&
          Array.isArray(candidate.issues) &&
          candidate.issues.every(isIssue)
      ) ?
        { ok: false, issues: candidate.issues }
      : undefined
  } catch {
    return undefined
  }
}

const invalidResult = <T>(
  path: ReadonlyArray<string | number> = [],
): Result<T> =>
  err('invalid-type', 'Expected a well-formed Grove Result value.', path)

export const mapResult = <T, U>(
  result: Result<T>,
  transform: (value: T) => U,
): Result<U> => {
  const inspected = inspectResult<T>(result)
  if (inspected === undefined) return invalidResult()
  return inspected.ok ?
      ok(transform(inspected.value), inspected.warnings)
    : inspected
}

export const collectResults = <T>(
  results: ReadonlyArray<Result<T>>,
): Result<readonly T[]> => {
  if (!Array.isArray(results)) return invalidResult()
  const values: T[] = []
  const failures: Issue[] = []
  const warnings: Issue[] = []

  for (const [index, result] of results.entries()) {
    const inspected = inspectResult<T>(result)
    if (inspected === undefined) {
      const invalid = invalidResult<T>([index])
      if (!invalid.ok) failures.push(...invalid.issues)
    } else if (inspected.ok) {
      values.push(inspected.value)
      warnings.push(...inspected.warnings)
    } else {
      failures.push(...inspected.issues)
    }
  }

  return failures.length === 0 ? ok(values, warnings) : issues(failures)
}
