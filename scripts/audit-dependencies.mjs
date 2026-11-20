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

const minimatchException = [
  'GHSA-g3hv-75wg-m249',
  'minimatch is used only by ESLint and TypeDoc tooling; the fix requires minimatch 11, which ESLint and Docusaurus do not support yet.',
]

/** Temporary, documented exceptions for each audited dependency tree. */
export const auditTargets = {
  root: {
    arguments: [],
    exceptions: new Map([minimatchException]),
  },
  production: {
    arguments: ['--prod'],
    exceptions: new Map([minimatchException]),
  },
}

/** Require every audit finding to resolve to an exact, temporary exception. */
export const validateAuditReport = (
  report,
  exceptions = auditTargets.root.exceptions,
) => {
  if (report.error) {
    throw new Error(
      `pnpm audit failed: ${report.error.summary ?? report.error.message ?? report.error.code ?? 'unknown registry error'}`,
    )
  }

  const findings = new Set()
  for (const advisory of Object.values(report.advisories ?? {})) {
    const id =
      advisory.github_advisory_id ??
      advisory.url?.match(/\/advisories\/(GHSA-[A-Za-z0-9-]+)$/)?.[1]
    if (!id) {
      throw new Error(
        `Unable to identify pnpm advisory: ${advisory.title ?? 'unknown finding'}`,
      )
    }
    findings.add(id)
  }

  const unexpected = [...findings].filter((id) => !exceptions.has(id))
  if (unexpected.length > 0) {
    throw new Error(
      `Unexpected pnpm audit findings: ${unexpected.sort().join(', ')}`,
    )
  }

  const stale = [...exceptions.keys()].filter((id) => !findings.has(id))
  if (stale.length > 0) {
    throw new Error(
      `Remove resolved pnpm audit exceptions: ${stale.join(', ')}`,
    )
  }

  return [...findings].sort()
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
      'pnpm',
      ['audit', ...target.arguments, '--audit-level=low', '--json'],
      { cwd: repositoryRoot, maxBuffer: 32 * 1024 * 1024 },
    )
    output = stdout
  } catch (error) {
    if (!error.stdout) throw error
    output = error.stdout
  }

  const accepted = validateAuditReport(JSON.parse(output), target.exceptions)
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
