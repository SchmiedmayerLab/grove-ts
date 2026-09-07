//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'
import type { Issue } from '../src/core/index.js'
import { groveRuleIssueFromParameters } from '../src/r4/diagnostics.js'

type Refinement = (value: unknown, context: z.core.$RefinementCtx) => void

/** Producer-rule issues one Grove refinement records for one resource. */
export const refinementIssues = (
  refine: Refinement,
  resource: unknown,
): readonly Issue[] => {
  const result = z.unknown().superRefine(refine).safeParse(resource)
  if (result.success) return []
  return result.error.issues.flatMap((issue) => {
    const path = issue.path.map((component) => String(component))
    const rule = groveRuleIssueFromParameters(
      issue.code === 'custom' ? issue.params : undefined,
      path,
      issue.message,
    )
    return rule === undefined ?
        [
          {
            severity: 'error',
            code: 'schema-invalid',
            path,
            message: issue.message,
          } satisfies Issue,
        ]
      : [rule]
  })
}

export const expectRule = (
  refine: Refinement,
  resource: unknown,
  code: string,
): void => {
  expect(
    refinementIssues(refine, resource).map(({ code: actual }) => actual),
  ).toContain(code)
}
