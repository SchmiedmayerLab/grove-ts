//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  groveExchangeProtocol,
  groveExchangeRuleDiagnostics,
} from '../src/contract/measurement-catalog.generated.js'
import {
  groveRuleIssue,
  groveRuleIssueFromParameters,
  groveRuleParameters,
  groveRuleReason,
  type GroveExchangeRuleCode,
} from '../src/r4/diagnostics.js'

const byText = (left: string, right: string): number =>
  left.localeCompare(right)

const ruleCodes = Object.keys(
  groveExchangeRuleDiagnostics,
) as GroveExchangeRuleCode[]

describe('stable Grove rule diagnostics', () => {
  it('registers exactly the protocol producer diagnostics', () => {
    expect([...ruleCodes].sort(byText)).toEqual(
      groveExchangeProtocol.producerDiagnostics
        .map(({ code }) => code)
        .sort(byText),
    )
  })

  it.each(ruleCodes)(
    'round-trips %s with its public reason and location',
    (code) => {
      const path = ['entry', 3, 'resource', 'target', 2, 'extension', 0]
      const issue = groveRuleIssue(code, path)

      expect(
        groveRuleIssueFromParameters(
          groveRuleParameters(code, path),
          path,
          'fallback',
        ),
      ).toEqual(issue)
      expect(issue.reason).toBe(groveExchangeRuleDiagnostics[code].reason)
      expect(groveRuleReason(code)).toBe(
        groveExchangeRuleDiagnostics[code].reason,
      )
    },
  )

  it('uses the stable first-target location when no target ordinal is available', () => {
    expect(
      groveRuleIssue('mobile-retraction.logical-target', []).location,
    ).toBe('Provenance.target[0]')
  })

  it('carries a locally named rule without a registered reason or location', () => {
    const parameters = groveRuleParameters('mobile-step-count.nonzero-period', [
      'entry',
      0,
    ])

    expect(groveRuleReason('mobile-step-count.nonzero-period')).toBeUndefined()
    expect(parameters).toEqual({
      groveRuleCode: 'mobile-step-count.nonzero-period',
    })
    expect(
      groveRuleIssueFromParameters(parameters, ['entry', 0], 'local message'),
    ).toEqual({
      severity: 'error',
      code: 'mobile-step-count.nonzero-period',
      path: ['entry', 0],
      message: 'local message',
    })
  })

  it('ignores issue parameters that name no producer rule', () => {
    for (const parameters of [
      undefined,
      {},
      { groveRuleCode: 42 },
      { groveRuleCode: 'undotted' },
    ]) {
      expect(
        groveRuleIssueFromParameters(parameters, [], 'message'),
      ).toBeUndefined()
    }
  })
})
