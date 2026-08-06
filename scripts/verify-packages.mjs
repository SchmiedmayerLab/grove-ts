//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const rootManifest = JSON.parse(
  await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'),
)

const workspacePackages = await Promise.all(
  rootManifest.workspaces.map(async (workspace) => ({
    workspace,
    manifest: JSON.parse(
      await readFile(
        resolve(repositoryRoot, workspace, 'package.json'),
        'utf8',
      ),
    ),
  })),
)
const publicPackages = workspacePackages.filter(
  ({ manifest }) => !manifest.private,
)
const workspaceVersions = new Map(
  publicPackages.map(({ manifest }) => [manifest.name, manifest.version]),
)

const packOutput = execFileSync(
  'npm',
  ['pack', '--json', '--dry-run', '--workspaces'],
  {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      npm_config_cache: resolve(tmpdir(), 'grove-npm-cache'),
    },
    maxBuffer: 32 * 1024 * 1024,
  },
)
const packs = JSON.parse(packOutput)
const packsByName = new Map(packs.map((pack) => [pack.name, pack]))
const errors = []

const check = (condition, message) => {
  if (!condition) errors.push(message)
}

const exportTargets = (value) => {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(exportTargets)
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(exportTargets)
  }
  return []
}

const forbiddenPackageFile = (path) =>
  /(^|\/)(coverage|test|tests|\.storybook)(\/|$)/.test(path) ||
  /\.(spec|stories|test)\./.test(path) ||
  path.endsWith('.tsbuildinfo') ||
  path.includes('eslint_report')

for (const { manifest } of publicPackages) {
  const label = manifest.name
  const pack = packsByName.get(label)
  check(pack, `${label}: npm did not produce package metadata`)
  if (!pack) continue

  const packageFiles = new Set(pack.files.map(({ path }) => path))
  const licenseCount = pack.files.filter(
    ({ path }) => path === 'LICENSE',
  ).length
  check(licenseCount === 1, `${label}: expected exactly one LICENSE file`)
  check(packageFiles.has('README.md'), `${label}: README.md is not published`)

  for (const { path } of pack.files) {
    check(
      !forbiddenPackageFile(path),
      `${label}: unexpected package file ${path}`,
    )
  }

  for (const target of [
    manifest.main,
    manifest.types,
    ...exportTargets(manifest.exports),
  ].filter(Boolean)) {
    const normalizedTarget = target.replace(/^\.\//, '')
    check(
      packageFiles.has(normalizedTarget),
      `${label}: package target ${target} is missing`,
    )
  }

  const exportKeys = new Set(Object.keys(manifest.exports ?? {}))
  for (const path of packageFiles) {
    const entry = path.match(
      /^dist\/(components|molecules|modules|utils)\/([^/]+)\.js$/,
    )
    if (!entry) continue

    const expectedExport = `./${entry[1]}/${entry[2]}`
    const packageUsesSubpath = [...exportKeys].some((key) =>
      key.startsWith(`./${entry[1]}/`),
    )
    if (!packageUsesSubpath) continue

    check(
      exportKeys.has(expectedExport),
      `${label}: built entry ${path} is not exported as ${expectedExport}`,
    )
  }

  for (const dependencyField of [
    'dependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    for (const [dependencyName, dependencyVersion] of Object.entries(
      manifest[dependencyField] ?? {},
    )) {
      const workspaceVersion = workspaceVersions.get(dependencyName)
      if (!workspaceVersion) continue

      check(
        dependencyVersion === workspaceVersion,
        `${label}: ${dependencyName} must use workspace version ${workspaceVersion}`,
      )
    }
  }
}

check(
  packs.length === publicPackages.length,
  `expected ${publicPackages.length} packages but npm described ${packs.length}`,
)
check(
  new Set(publicPackages.map(({ manifest }) => manifest.version)).size === 1,
  'all published workspace packages must use the same version',
)

if (errors.length > 0) {
  throw new Error(`Package verification failed:\n- ${errors.join('\n- ')}`)
}

const fileCount = packs.reduce((total, pack) => total + pack.entryCount, 0)
console.log(`Verified ${packs.length} packages containing ${fileCount} files.`)
