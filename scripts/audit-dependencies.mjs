//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'

const executeFile = promisify(execFile)
const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

const minimatchException = [
  'GHSA-g3hv-75wg-m249',
  'minimatch is used only by ESLint and TypeDoc tooling; the fix requires minimatch 11, which ESLint and Docusaurus do not support yet.',
]
const deepmergeException = [
  'GHSA-gcqx-w48m-w2h4',
  'deepmerge is used only by Jest and Docusaurus build tooling; no patched release exists.',
]

/** Temporary, documented exceptions for each audited dependency tree. */
export const auditTargets = {
  root: {
    prefix: '.',
    arguments: [],
    exceptions: new Map([minimatchException, deepmergeException]),
  },
  production: {
    prefix: '.',
    arguments: ['--omit=dev'],
    exceptions: new Map([minimatchException]),
  },
  docs: {
    prefix: 'packages/design-system/docs',
    arguments: [],
    exceptions: new Map([minimatchException, deepmergeException]),
  },
}

const advisoryId = (advisory) =>
  advisory.url?.match(/\/advisories\/(GHSA-[A-Za-z0-9-]+)$/)?.[1]

const rootAdvisories = (vulnerabilities, name, ancestors = new Set()) => {
  if (ancestors.has(name)) return []

  const vulnerability = vulnerabilities[name]
  if (!vulnerability) return []

  const visited = new Set(ancestors)
  visited.add(name)
  return vulnerability.via.flatMap((source) =>
    typeof source === 'string' ?
      rootAdvisories(vulnerabilities, source, visited).map((finding) => ({
        ...finding,
        vulnerabilities: [vulnerability, ...finding.vulnerabilities],
      }))
    : [{ advisory: source, vulnerabilities: [vulnerability] }],
  )
}

const versionParts = (version) =>
  version
    .split(/[-+]/)[0]
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0)

const isNewerVersion = (candidate, installed) => {
  const left = versionParts(candidate)
  const right = versionParts(installed)
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0) return difference > 0
  }
  return false
}

/**
 * npm audit reports `fixAvailable` even when the only "fix" is a downgrade to
 * an older major release, or when every release of a package is affected.
 * Neither resolves the finding, so only upgrades count as available fixes.
 */
const isActionableFix = ({ fixAvailable, range }, installedVersion) => {
  if (!fixAvailable) return false
  if (fixAvailable === true) return range !== '*'

  const installed = installedVersion(fixAvailable.name)
  return !installed || isNewerVersion(fixAvailable.version, installed)
}

/** Require every audit finding to resolve to an exact, temporary exception. */
export const validateAuditReport = (
  report,
  exceptions = auditTargets.docs.exceptions,
  installedVersion = () => undefined,
) => {
  if (report.error) {
    throw new Error(
      `npm audit failed: ${report.error.summary ?? report.error.message ?? 'unknown registry error'}`,
    )
  }

  const vulnerabilities = report.vulnerabilities ?? {}
  const findings = Object.keys(vulnerabilities).flatMap((name) =>
    rootAdvisories(vulnerabilities, name),
  )
  const findingsById = new Map()

  for (const finding of findings) {
    const id = advisoryId(finding.advisory)
    if (!id) {
      throw new Error(
        `Unable to identify npm advisory: ${finding.advisory.title ?? 'unknown finding'}`,
      )
    }
    const records = findingsById.get(id) ?? []
    records.push(finding)
    findingsById.set(id, records)
  }

  const unexpected = [...findingsById.keys()].filter(
    (id) => !exceptions.has(id),
  )
  if (unexpected.length > 0) {
    throw new Error(`Unexpected npm audit findings: ${unexpected.join(', ')}`)
  }

  const stale = [...exceptions.keys()].filter((id) => !findingsById.has(id))
  if (stale.length > 0) {
    throw new Error(`Remove resolved npm audit exceptions: ${stale.join(', ')}`)
  }

  /**
   * A fix is only actionable on the vulnerable package itself or on a
   * directly declared dependency: npm audit also reports `fixAvailable` on
   * deeply transitive intermediaries that are already at their latest
   * release, which does not resolve the finding.
   */
  const fixable = [...findingsById.entries()]
    .filter(([, records]) =>
      records.some(({ vulnerabilities: traversal }) =>
        traversal.some(
          (vulnerability, index) =>
            (vulnerability.isDirect || index === traversal.length - 1) &&
            isActionableFix(vulnerability, installedVersion),
        ),
      ),
    )
    .map(([id]) => id)
  if (fixable.length > 0) {
    throw new Error(`Fixes are now available for: ${fixable.join(', ')}`)
  }

  return [...findingsById.keys()].sort()
}

const lockfileVersions = (prefix) => {
  const { packages = {} } = JSON.parse(
    readFileSync(join(repositoryRoot, prefix, 'package-lock.json'), 'utf8'),
  )
  return (name) => packages[`node_modules/${name}`]?.version
}

const run = async (targetName) => {
  const target = auditTargets[targetName]
  if (!target) {
    throw new Error(
      `Unknown audit target "${targetName}"; expected one of: ${Object.keys(auditTargets).join(', ')}`,
    )
  }

  let output
  try {
    const { stdout } = await executeFile(
      'npm',
      [
        'audit',
        '--prefix',
        target.prefix,
        ...target.arguments,
        '--audit-level=low',
        '--json',
      ],
      { cwd: repositoryRoot, maxBuffer: 10 * 1024 * 1024 },
    )
    output = stdout
  } catch (error) {
    if (!error.stdout) throw error
    output = error.stdout
  }

  const report = JSON.parse(output)
  const accepted = validateAuditReport(
    report,
    target.exceptions,
    lockfileVersions(target.prefix),
  )
  for (const id of accepted) {
    console.log(`Accepted temporary ${targetName} audit exception: ${id}`)
    console.log(target.exceptions.get(id))
  }
  if (accepted.length === 0) {
    console.log(`No ${targetName} audit findings.`)
  }
}

const isDirectExecution =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isDirectExecution) await run(process.argv[2] ?? 'root')
