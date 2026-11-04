//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { auditTargets, validateAuditReport } from './audit-dependencies.mjs'

const advisory = (id) => ({
  title: id,
  url: `https://github.com/advisories/${id}`,
})

const exceptions = new Map([
  ['GHSA-g3hv-75wg-m249', 'minimatch'],
  ['GHSA-gcqx-w48m-w2h4', 'deepmerge'],
])

const report = ({
  fixAvailable = false,
  includeUnexpected = false,
  rootFixAvailable = false,
  rootRange = '>=1.0.0',
  transitiveFixAvailable = false,
} = {}) => ({
  vulnerabilities: {
    eslint: {
      isDirect: true,
      fixAvailable: rootFixAvailable,
      range: rootRange,
      via: ['@eslint/config-array'],
    },
    '@eslint/config-array': {
      isDirect: false,
      fixAvailable: transitiveFixAvailable,
      range: '*',
      via: ['minimatch'],
    },
    minimatch: {
      isDirect: false,
      fixAvailable,
      range: '<11.0.1',
      via: [advisory('GHSA-g3hv-75wg-m249')],
    },
    deepmerge: {
      isDirect: false,
      fixAvailable: false,
      range: '>=4.2.0',
      via: [advisory('GHSA-gcqx-w48m-w2h4')],
    },
    ...(includeUnexpected && {
      unexpected: {
        isDirect: false,
        fixAvailable: false,
        via: [advisory('GHSA-xxxx-yyyy-zzzz')],
      },
    }),
  },
})

const accepted = ['GHSA-g3hv-75wg-m249', 'GHSA-gcqx-w48m-w2h4']

describe('dependency audit exceptions', () => {
  it('accepts only the documented, unfixable advisories', () => {
    assert.deepEqual(validateAuditReport(report(), exceptions), accepted)
  })

  it('documents a reason for every exception', () => {
    for (const { exceptions: targetExceptions } of Object.values(
      auditTargets,
    )) {
      for (const reason of targetExceptions.values()) {
        assert.ok(reason.length > 0)
      }
    }
  })

  it('rejects unexpected advisories', () => {
    assert.throws(
      () =>
        validateAuditReport(report({ includeUnexpected: true }), exceptions),
      /Unexpected npm audit findings: GHSA-xxxx-yyyy-zzzz/,
    )
  })

  it('rejects registry errors', () => {
    assert.throws(
      () =>
        validateAuditReport(
          { error: { summary: 'registry unavailable' } },
          exceptions,
        ),
      /npm audit failed: registry unavailable/,
    )
  })

  it('rejects stale exceptions and advisories with fixes', () => {
    const withResolved = new Map([
      ...exceptions,
      ['GHSA-resolved-advisory', 'Resolved.'],
    ])
    assert.throws(
      () => validateAuditReport(report(), withResolved),
      /Remove resolved npm audit exceptions: GHSA-resolved-advisory/,
    )
    assert.throws(
      () => validateAuditReport(report({ fixAvailable: true }), exceptions),
      /Fixes are now available for: GHSA-g3hv-75wg-m249/,
    )
    assert.throws(
      () => validateAuditReport(report({ rootFixAvailable: true }), exceptions),
      /Fixes are now available/,
    )
  })

  it('ignores fixAvailable on transitive, non-direct dependencies', () => {
    assert.deepEqual(
      validateAuditReport(report({ transitiveFixAvailable: true }), exceptions),
      accepted,
    )
  })

  it('ignores fixes when every release of a direct dependency is affected', () => {
    assert.deepEqual(
      validateAuditReport(
        report({ rootFixAvailable: true, rootRange: '*' }),
        exceptions,
      ),
      accepted,
    )
  })

  it('ignores suggested downgrades but rejects upgrades', () => {
    const fix = { name: 'eslint', version: '8.14.0', isSemVerMajor: true }
    assert.deepEqual(
      validateAuditReport(
        report({ rootFixAvailable: fix }),
        exceptions,
        () => '10.13.0',
      ),
      accepted,
    )
    assert.throws(
      () =>
        validateAuditReport(
          report({ rootFixAvailable: { ...fix, version: '11.0.0' } }),
          exceptions,
          () => '10.13.0',
        ),
      /Fixes are now available/,
    )
  })
})
