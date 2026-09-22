//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { readdirSync, readFileSync } from 'node:fs'
import {
  groveExchangeProtocol,
  groveProducerDiagnostics,
} from '../src/contract/measurement-catalog.generated.js'
import {
  groveRuleIssue,
  groveRuleIssueFromParameters,
  groveRuleLocation,
  groveRuleParameters,
  isProducerDiagnosticCode,
  type ProducerDiagnosticCode,
} from '../src/r4/diagnostics.js'

const byText = (left: string, right: string): number =>
  left.localeCompare(right)

const ruleCodes = Object.keys(
  groveProducerDiagnostics,
) as ProducerDiagnosticCode[]
const isClientRecordRule = (code: string): boolean =>
  /-(?:input|omission)\./u.test(code)

// Every rule code a source file spells out, so nothing unregistered can be emitted.
const sourceRuleLiterals = (): ReadonlyMap<string, readonly string[]> => {
  const root = new URL('../src/', import.meta.url)
  const literals = new Map<string, string[]>()
  for (const name of readdirSync(root, { recursive: true, encoding: 'utf8' })) {
    if (!name.endsWith('.ts') || name.endsWith('.generated.ts')) continue
    const source = readFileSync(new URL(name, root), 'utf8')
    for (const match of source.matchAll(
      /'([a-z][a-z0-9]*(?:-[a-z0-9]+)+\.[a-z][a-z0-9-]*)'/gu,
    )) {
      const code = match[1] ?? ''
      literals.set(code, [...(literals.get(code) ?? []), name])
    }
    expect([name, source.includes('`mobile-${')]).toEqual([name, false])
  }
  return literals
}

describe('stable Grove rule diagnostics', () => {
  it('registers exactly the protocol producer diagnostics with severity and emitter', () => {
    expect([...ruleCodes].sort(byText)).toEqual(
      groveExchangeProtocol.producerDiagnostics
        .map(({ code }) => code)
        .sort(byText),
    )
    for (const row of groveExchangeProtocol.producerDiagnostics) {
      expect(groveProducerDiagnostics[row.code]).toEqual({
        reason: row.reason,
        emittedBy: row.emittedBy,
        severity: 'severity' in row ? row.severity : 'error',
      })
    }
  })

  it('emits only registered codes from every source file', () => {
    const literals = sourceRuleLiterals()
    const unregistered = [...literals]
      .filter(([code]) => !isProducerDiagnosticCode(code))
      .map(([code, files]) => `${code} in ${files.join(', ')}`)
    expect(unregistered).toEqual([])
    expect(literals.size).toBeGreaterThan(40)
  })

  it.each(ruleCodes)(
    'round-trips %s with its registry reason and severity',
    (code) => {
      const path = ['entry', 3, 'resource', 'target', 2, 'extension', 0]
      const issue = groveRuleIssue(code, path)
      const row = groveProducerDiagnostics[code]

      expect(
        groveRuleIssueFromParameters(groveRuleParameters(code, path), path),
      ).toEqual(issue)
      expect(issue.reason).toBe(row.reason)
      expect(issue.message).toBe(row.reason)
      expect(issue.severity).toBe(row.severity)
      if (isClientRecordRule(code)) {
        expect(groveRuleLocation(code, path)).toBeUndefined()
        expect(issue).not.toHaveProperty('location')
      } else {
        expect(typeof issue.location).toBe('string')
        expect(issue.location).not.toBe('')
      }
    },
  )

  it('warns only on registry rows of warning severity, all of them omissions', () => {
    for (const code of ruleCodes) {
      const warning = groveRuleIssue(code, []).severity === 'warning'
      expect(warning).toBe(
        groveProducerDiagnostics[code].severity === 'warning',
      )
      expect(warning).toBe(code.startsWith('mobile-omission.'))
    }
    expect(
      ruleCodes.filter((code) => code.startsWith('mobile-omission.')),
    ).toHaveLength(3)
  })

  it('carries the typed detail of a refusal beside the registry reason', () => {
    const issue = groveRuleIssue(
      'mobile-input.value-outside-domain',
      ['measurements', 0, 'value'],
      { message: '101 is above the 100 percent maximum.' },
    )
    expect(issue).toEqual({
      severity: 'error',
      code: 'mobile-input.value-outside-domain',
      path: ['measurements', 0, 'value'],
      message: '101 is above the 100 percent maximum.',
      reason:
        groveProducerDiagnostics['mobile-input.value-outside-domain'].reason,
    })
    expect(
      groveRuleIssueFromParameters(
        groveRuleParameters('mobile-input.value-outside-domain', [], {
          message: 'detail',
        }),
        ['x'],
      ),
    ).toMatchObject({ message: 'detail', path: ['x'] })
  })

  it('uses the stable first-target location when no target ordinal is available', () => {
    expect(
      groveRuleIssue('mobile-retraction.logical-target', []).location,
    ).toBe('Provenance.target[0]')
  })

  it('ignores issue parameters that name no producer rule', () => {
    for (const parameters of [
      undefined,
      {},
      { groveRuleCode: 42 },
      { groveRuleCode: 'undotted' },
      { groveRuleCode: 'mobile-step-count.nonzero-period' },
    ]) {
      expect(groveRuleIssueFromParameters(parameters, [])).toBeUndefined()
    }
  })
})
