//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { auditExceptions, validateAuditReport } from './audit-docs.mjs'

const advisory = (id) => ({
  title: id,
  url: `https://github.com/advisories/${id}`,
})

const report = ({
  fixAvailable = false,
  includeUnexpected = false,
  rootFixAvailable = false,
  transitiveFixAvailable = false,
} = {}) => ({
  vulnerabilities: {
    '@docusaurus/core': {
      isDirect: true,
      fixAvailable: rootFixAvailable,
      via: ['@docusaurus/mdx-loader'],
    },
    '@docusaurus/mdx-loader': {
      isDirect: false,
      fixAvailable: transitiveFixAvailable,
      via: ['image-size'],
    },
    'image-size': {
      isDirect: false,
      fixAvailable,
      via: [advisory('GHSA-5p2g-fcmc-qvqq'), advisory('GHSA-w3rx-r6r6-pgpr')],
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

describe('documentation audit exceptions', () => {
  it('accepts only the documented, unfixable advisories', () => {
    assert.deepEqual(validateAuditReport(report()), [
      'GHSA-5p2g-fcmc-qvqq',
      'GHSA-w3rx-r6r6-pgpr',
    ])
  })

  it('rejects unexpected advisories', () => {
    assert.throws(
      () => validateAuditReport(report({ includeUnexpected: true })),
      /Unexpected npm audit findings: GHSA-xxxx-yyyy-zzzz/,
    )
  })

  it('rejects registry errors', () => {
    assert.throws(
      () =>
        validateAuditReport({
          error: { summary: 'registry unavailable' },
        }),
      /npm audit failed: registry unavailable/,
    )
  })

  it('rejects stale exceptions and advisories with fixes', () => {
    const oneException = new Map([
      ...auditExceptions,
      ['GHSA-resolved-advisory', 'Resolved.'],
    ])
    assert.throws(
      () => validateAuditReport(report(), oneException),
      /Remove resolved npm audit exceptions/,
    )
    assert.throws(
      () => validateAuditReport(report({ fixAvailable: true })),
      /Fixes are now available/,
    )
    assert.throws(
      () => validateAuditReport(report({ rootFixAvailable: true })),
      /Fixes are now available/,
    )
  })

  it('ignores fixAvailable on transitive, non-direct dependencies', () => {
    assert.deepEqual(
      validateAuditReport(report({ transitiveFixAvailable: true })),
      ['GHSA-5p2g-fcmc-qvqq', 'GHSA-w3rx-r6r6-pgpr'],
    )
  })
})
