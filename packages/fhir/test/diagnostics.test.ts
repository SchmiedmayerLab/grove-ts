//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { groveExchangeRuleDiagnostics } from '../src/mobile/measurement-catalog.generated.js'
import {
  decodeGroveRuleDiagnostic,
  encodeGroveRuleDiagnostic,
  groveRuleIssue,
  type GroveExchangeRuleCode,
} from '../src/r4/diagnostics.js'

const ruleCodes = Object.keys(
  groveExchangeRuleDiagnostics,
) as GroveExchangeRuleCode[]

describe('stable Grove rule diagnostics', () => {
  it.each(ruleCodes)(
    'round-trips %s with its public reason and location',
    (code) => {
      const path = ['entry', 3, 'resource', 'target', 2, 'extension', 0]
      const issue = groveRuleIssue(code, path)
      const encoded = encodeGroveRuleDiagnostic(code, path, 'fallback')

      expect(decodeGroveRuleDiagnostic(encoded)).toEqual({
        code,
        reason: groveExchangeRuleDiagnostics[code].reason,
        location: issue.location,
        severity: groveExchangeRuleDiagnostics[code].severity,
      })
    },
  )

  it('uses the stable first-target location when no target ordinal is available', () => {
    expect(
      groveRuleIssue('mobile-retraction.logical-target', []).location,
    ).toBe('Provenance.target[0]')
  })

  it('rejects malformed or forged encoded diagnostics', () => {
    const code = ruleCodes[0]
    if (code === undefined) throw new Error('The rule catalog is empty.')
    const valid = encodeGroveRuleDiagnostic(code, [], 'fallback')
    const prefix = valid.slice(0, valid.indexOf('{'))
    const reason = groveExchangeRuleDiagnostics[code].reason
    const cases = [
      'not encoded',
      `${prefix}{`,
      `${prefix}${JSON.stringify({ code: 42, reason, location: 'Bundle', severity: 'error' })}`,
      `${prefix}${JSON.stringify({ code: 'unknown', reason, location: 'Bundle', severity: 'error' })}`,
      `${prefix}${JSON.stringify({ code, reason: 'forged', location: 'Bundle', severity: 'error' })}`,
      `${prefix}${JSON.stringify({ code, reason, location: '', severity: 'error' })}`,
      `${prefix}${JSON.stringify({ code, reason, location: 42, severity: 'error' })}`,
      `${prefix}${JSON.stringify({ code, reason, location: 'Bundle', severity: 'warning' })}`,
    ]

    for (const candidate of cases) {
      expect(decodeGroveRuleDiagnostic(candidate)).toBeUndefined()
    }
    expect(
      decodeGroveRuleDiagnostic(
        encodeGroveRuleDiagnostic('unknown', [], 'fallback'),
      ),
    ).toBeUndefined()
  })
})
