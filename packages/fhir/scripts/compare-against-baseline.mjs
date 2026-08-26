//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

// Parses every resource in `test/resources` with the schemas of a released revision and with the
// working tree's, then reports where the two disagree.
//
// This package is published, so tightening a shared primitive is felt by every resource that uses
// it, and the round-trip suites only cover what they happen to contain. This answers the question
// they cannot: over the whole fixture corpus, what changed — a value that used to parse and no
// longer does, or an output that gained or lost a field.
//
// A newly rejected value is a breaking change unless the old behaviour contradicted the
// specification, in which case it belongs in the pull request description.
//
//   node scripts/compare-against-baseline.mjs [git-ref]      # defaults to origin/main

import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { argv, exit, stdout } from 'node:process'
import { pathToFileURL } from 'node:url'

const packageRoot = resolve(import.meta.dirname, '..')
const repositoryRoot = resolve(packageRoot, '..', '..')
const ref = argv[2] ?? 'origin/main'

const run = (command, args, cwd) =>
  execFileSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe' })

const worktree = mkdtempSync(resolve(tmpdir(), 'grove-fhir-baseline-'))
let baseline
try {
  run('git', ['worktree', 'add', '--detach', worktree, ref], repositoryRoot)
  // The baseline only needs zod and the FHIR types, which the working tree already has installed.
  symlinkSync(
    resolve(repositoryRoot, 'node_modules'),
    resolve(worktree, 'node_modules'),
  )
  const baselinePackage = resolve(worktree, 'packages/fhir')
  run(
    resolve(repositoryRoot, 'node_modules/.bin/tsc'),
    ['-p', 'tsconfig.json'],
    baselinePackage,
  )
  baseline = await import(
    pathToFileURL(resolve(baselinePackage, 'dist/index.js')).href
  )
} catch (error) {
  stdout.write(`Could not prepare the baseline at ${ref}: ${error.message}\n`)
  rmSync(worktree, { recursive: true, force: true })
  run('git', ['worktree', 'prune'], repositoryRoot)
  exit(1)
}

const current = await import(
  pathToFileURL(resolve(packageRoot, 'dist/index.js')).href
)

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    )
  }
  return value
}

/** Field paths present in one output and not the other. */
const fieldDelta = (before, after, path = '', delta = []) => {
  if (Array.isArray(before) && Array.isArray(after)) {
    after.forEach((entry, index) =>
      fieldDelta(before[index], entry, `${path}[${index}]`, delta),
    )
    return delta
  }
  if (
    before !== null &&
    after !== null &&
    typeof before === 'object' &&
    typeof after === 'object'
  ) {
    for (const key of Object.keys(after)) {
      if (key in before)
        fieldDelta(before[key], after[key], `${path}.${key}`, delta)
      else delta.push(`gained ${path}.${key}`)
    }
    for (const key of Object.keys(before)) {
      if (!(key in after)) delta.push(`lost ${path}.${key}`)
    }
  }
  return delta
}

const fixtures = resolve(packageRoot, 'test/resources')
const report = {
  compared: 0,
  agree: 0,
  rejected: [],
  accepted: [],
  changed: [],
}

for (const file of readdirSync(fixtures).filter((name) =>
  name.endsWith('.json'),
)) {
  let contents
  try {
    contents = JSON.parse(readFileSync(resolve(fixtures, file), 'utf8'))
  } catch {
    continue
  }
  const resources = Array.isArray(contents) ? contents : Object.values(contents)
  for (const [index, resource] of resources.entries()) {
    if (
      resource === null ||
      typeof resource !== 'object' ||
      resource.resourceType === undefined
    ) {
      continue
    }
    report.compared += 1
    const where = `${file}[${index}] ${resource.resourceType}`
    const before = baseline.fhirResourceSchema.safeParse(resource)
    const after = current.fhirResourceSchema.safeParse(resource)

    if (before.success && !after.success) {
      report.rejected.push({
        where,
        issues: after.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      })
    } else if (!before.success && after.success) {
      report.accepted.push(where)
    } else if (before.success && after.success) {
      if (
        JSON.stringify(canonical(before.data)) ===
        JSON.stringify(canonical(after.data))
      ) {
        report.agree += 1
      } else {
        report.changed.push({
          where,
          delta: fieldDelta(before.data, after.data).slice(0, 8),
        })
      }
    } else {
      report.agree += 1
    }
  }
}

rmSync(worktree, { recursive: true, force: true })
run('git', ['worktree', 'prune'], repositoryRoot)

stdout.write(`baseline                    : ${ref}\n`)
stdout.write(`fixture resources compared  : ${report.compared}\n`)
stdout.write(`identical verdict and output: ${report.agree}\n`)
stdout.write(`newly rejected              : ${report.rejected.length}\n`)
stdout.write(`newly accepted              : ${report.accepted.length}\n`)
stdout.write(`output changed              : ${report.changed.length}\n`)

for (const entry of report.rejected) {
  stdout.write(`\n  newly rejected ${entry.where}\n`)
  for (const issue of entry.issues) stdout.write(`      ${issue}\n`)
}
for (const entry of report.changed) {
  stdout.write(`\n  output changed ${entry.where}\n`)
  for (const change of entry.delta) stdout.write(`      ${change}\n`)
}
for (const entry of report.accepted)
  stdout.write(`\n  newly accepted ${entry}\n`)

exit(report.rejected.length > 0 || report.changed.length > 0 ? 1 : 0)
