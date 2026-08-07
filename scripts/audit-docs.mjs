//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'

const executeFile = promisify(execFile)
const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

export const auditExceptions = new Map([
  [
    'GHSA-5p2g-fcmc-qvqq',
    'image-size is used only while building version-controlled documentation; no patched release exists.',
  ],
  [
    'GHSA-w3rx-r6r6-pgpr',
    'image-size is used only while building version-controlled documentation; no patched release exists.',
  ],
])

const advisoryId = (advisory) =>
  advisory.url?.match(/\/advisories\/(GHSA-[A-Za-z0-9-]+)$/)?.[1]

const rootAdvisories = (vulnerabilities, name, visited = new Set()) => {
  if (visited.has(name)) return []
  visited.add(name)

  const vulnerability = vulnerabilities[name]
  if (!vulnerability) return []
  return vulnerability.via.flatMap((source) =>
    typeof source === 'string' ?
      rootAdvisories(vulnerabilities, source, visited)
    : [{ advisory: source, vulnerability }],
  )
}

/** Require every audit finding to resolve to an exact, temporary exception. */
export const validateAuditReport = (report, exceptions = auditExceptions) => {
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
    findingsById.set(id, finding)
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

  const fixable = [...findingsById.entries()]
    .filter(([, { vulnerability }]) => vulnerability.fixAvailable)
    .map(([id]) => id)
  if (fixable.length > 0) {
    throw new Error(`Fixes are now available for: ${fixable.join(', ')}`)
  }

  return [...findingsById.keys()].sort()
}

const run = async () => {
  let output
  try {
    const { stdout } = await executeFile(
      'npm',
      [
        'audit',
        '--prefix',
        'packages/design-system/docs',
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
  const accepted = validateAuditReport(report)
  for (const id of accepted) {
    console.log(`Accepted temporary documentation audit exception: ${id}`)
    console.log(auditExceptions.get(id))
  }
}

const isDirectExecution =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isDirectExecution) await run()
