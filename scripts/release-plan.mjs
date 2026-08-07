//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { appendFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const semverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/

/** Validate a bare semantic version suitable for npm and GitHub tags. */
export const validateReleaseVersion = (version) => {
  if (!semverPattern.test(version)) {
    throw new Error(
      `Release version must be bare semantic versioning without a v prefix: ${version}`,
    )
  }
  return version
}

/** Resolve npm and GitHub prerelease metadata from the semantic version. */
export const releaseChannel = (version) => {
  validateReleaseVersion(version)
  const prerelease = version.includes('-')
  return { npmTag: prerelease ? 'next' : 'latest', prerelease }
}

/** Parse comma- or whitespace-separated packages selected for token bootstrap. */
export const parseBootstrapPackages = (value = '') => {
  const packages = new Set(value.split(/[\s,]+/).filter(Boolean))
  if (packages.has('*') && packages.size > 1) {
    throw new Error(
      'Use either * or explicit bootstrap package names, not both.',
    )
  }
  return packages
}

/** Sort workspaces so runtime dependencies are published before their consumers. */
export const sortWorkspacePackages = (packages) => {
  const packagesByName = new Map(
    packages.map((workspacePackage) => [
      workspacePackage.manifest.name,
      workspacePackage,
    ]),
  )
  const permanent = new Set()
  const temporary = new Set()
  const sorted = []

  const visit = (workspacePackage) => {
    const name = workspacePackage.manifest.name
    if (permanent.has(name)) return
    if (temporary.has(name)) {
      throw new Error(`Runtime workspace dependency cycle includes ${name}.`)
    }

    temporary.add(name)
    for (const dependencyName of Object.keys({
      ...workspacePackage.manifest.dependencies,
      ...workspacePackage.manifest.optionalDependencies,
    })) {
      const dependency = packagesByName.get(dependencyName)
      if (dependency) visit(dependency)
    }
    temporary.delete(name)
    permanent.add(name)
    sorted.push(workspacePackage)
  }

  for (const workspacePackage of packages) visit(workspacePackage)
  return sorted
}

/** Build an idempotent publication plan from current npm registry state. */
export const createReleasePlan = async ({
  packages,
  version,
  bootstrapPackages,
  lookupPackage,
}) => {
  validateReleaseVersion(version)
  const sortedPackages = sortWorkspacePackages(packages)
  const workspaceNames = new Set(
    sortedPackages.map(({ manifest }) => manifest.name),
  )
  const unknownSelections = [...bootstrapPackages].filter(
    (name) => name !== '*' && !workspaceNames.has(name),
  )
  if (unknownSelections.length > 0) {
    throw new Error(
      `Unknown bootstrap package${unknownSelections.length === 1 ? '' : 's'}: ${unknownSelections.join(', ')}`,
    )
  }

  const bootstrapAll = bootstrapPackages.has('*')
  const plan = {
    all: sortedPackages.map(({ manifest }) => manifest.name),
    oidc: [],
    bootstrap: [],
    skipped: [],
  }
  const errors = []

  for (const { manifest } of sortedPackages) {
    const name = manifest.name
    const registryPackage = await lookupPackage(name)
    const selectedForBootstrap = bootstrapAll || bootstrapPackages.has(name)

    if (registryPackage?.versions.has(version)) {
      plan.skipped.push(name)
      continue
    }

    if (!registryPackage) {
      if (selectedForBootstrap) plan.bootstrap.push(name)
      else {
        errors.push(
          `${name} is unpublished; manually dispatch Deployment with this package in bootstrapPackages.`,
        )
      }
      continue
    }

    if (selectedForBootstrap) {
      errors.push(
        `${name} already exists on npm and must use Trusted Publishing instead of NPM_TOKEN.`,
      )
      continue
    }
    plan.oidc.push(name)
  }

  if (errors.length > 0) {
    throw new Error(`Release plan is invalid:\n- ${errors.join('\n- ')}`)
  }
  return plan
}

export const lookupNpmPackage = async (name, fetchImplementation = fetch) => {
  const response = await fetchImplementation(
    `https://registry.npmjs.org/${encodeURIComponent(name)}`,
    { headers: { accept: 'application/json' } },
  )
  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(
      `Unable to read npm registry metadata for ${name}: HTTP ${response.status}`,
    )
  }

  const metadata = await response.json()
  return { versions: new Set(Object.keys(metadata.versions ?? {})) }
}

const readPublicWorkspacePackages = async () => {
  const rootManifest = JSON.parse(
    await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'),
  )
  const packages = await Promise.all(
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
  return packages.filter(({ manifest }) => !manifest.private)
}

const argumentValue = (name) => {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value.`)
  }
  return value
}

const run = async () => {
  const version = argumentValue('--version')
  if (!version) throw new Error('--version is required.')
  const bootstrapPackages = parseBootstrapPackages(
    argumentValue('--bootstrap-packages'),
  )
  const plan = await createReleasePlan({
    packages: await readPublicWorkspacePackages(),
    version,
    bootstrapPackages,
    lookupPackage: lookupNpmPackage,
  })

  console.log(`Release ${version}:`)
  console.log(`- OIDC: ${plan.oidc.join(', ') || 'none'}`)
  console.log(`- Token bootstrap: ${plan.bootstrap.join(', ') || 'none'}`)
  console.log(`- Already published: ${plan.skipped.join(', ') || 'none'}`)

  if (process.env.GITHUB_OUTPUT) {
    const { npmTag, prerelease } = releaseChannel(version)
    await appendFile(
      process.env.GITHUB_OUTPUT,
      [
        `all=${JSON.stringify(plan.all)}`,
        `oidc=${JSON.stringify(plan.oidc)}`,
        `bootstrap=${JSON.stringify(plan.bootstrap)}`,
        `skipped=${JSON.stringify(plan.skipped)}`,
        `npm-tag=${npmTag}`,
        `prerelease=${prerelease}`,
        '',
      ].join('\n'),
    )
  }
}

const isDirectExecution =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isDirectExecution) await run()
