//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

const executeInteractive = (command, arguments_) =>
  new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, arguments_, { stdio: 'inherit' })
    child.on('error', rejectPromise)
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise()
      } else {
        rejectPromise(
          new Error(
            signal ?
              `${command} was terminated by ${signal}.`
            : `${command} exited with status ${code}.`,
          ),
        )
      }
    })
  })

/** Resolve a validated package selection against public workspace manifests. */
export const selectWorkspacePackageNames = (packages, value) => {
  const selection = new Set(value.split(/[\s,]+/).filter(Boolean))
  if (selection.size === 0) {
    throw new Error('At least one package or * must be selected.')
  }
  if (selection.has('*') && selection.size > 1) {
    throw new Error('Use either * or explicit package names, not both.')
  }

  const packageNames = packages.map(({ name }) => name)
  const knownPackages = new Set(packageNames)
  const unknownPackages = [...selection].filter(
    (name) => name !== '*' && !knownPackages.has(name),
  )
  if (unknownPackages.length > 0) {
    throw new Error(
      `Unknown package${unknownPackages.length === 1 ? '' : 's'}: ${unknownPackages.join(', ')}`,
    )
  }

  return selection.has('*') ? packageNames : (
      packageNames.filter((name) => selection.has(name))
    )
}

/** Resolve the GitHub owner and repository from package metadata. */
export const githubRepositoryFromManifest = (manifest) => {
  const repositoryUrl =
    typeof manifest.repository === 'string' ?
      manifest.repository
    : manifest.repository?.url
  if (!repositoryUrl) {
    throw new Error('package.json must define a GitHub repository URL.')
  }

  const url = new URL(repositoryUrl.replace(/^git\+/, ''))
  const pathParts = url.pathname
    .replace(/\.git$/, '')
    .split('/')
    .filter(Boolean)
  if (url.hostname !== 'github.com' || pathParts.length !== 2) {
    throw new Error(`Expected a GitHub repository URL: ${repositoryUrl}`)
  }
  return pathParts.join('/')
}

/** Validate the GitHub repository and workflow used in npm's OIDC claims. */
export const validateTrustedPublisherTarget = ({ repository, workflow }) => {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error(
      `GitHub repository must use the owner/repository format: ${repository}`,
    )
  }
  if (
    basename(workflow) !== workflow ||
    (!workflow.endsWith('.yml') && !workflow.endsWith('.yaml'))
  ) {
    throw new Error(
      `GitHub Actions workflow must be a .yml or .yaml filename: ${workflow}`,
    )
  }
}

/** Configure npm Trusted Publishing from an interactive maintainer session. */
export const configureTrustedPublishing = async ({
  execute = executeInteractive,
  packageNames,
  repository,
  sleep = delay,
  workflow,
}) => {
  validateTrustedPublisherTarget({ repository, workflow })

  for (const [index, packageName] of packageNames.entries()) {
    console.log(`Configuring Trusted Publishing for ${packageName}.`)
    await execute('npm', [
      'trust',
      'github',
      packageName,
      '--repository',
      repository,
      '--file',
      workflow,
      '--allow-publish',
      '--yes',
    ])
    if (index < packageNames.length - 1) await sleep(2000)
  }
}

const readRepositoryConfiguration = async () => {
  const rootManifest = JSON.parse(
    await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'),
  )
  const packages = await Promise.all(
    rootManifest.workspaces.map(async (workspace) =>
      JSON.parse(
        await readFile(
          resolve(repositoryRoot, workspace, 'package.json'),
          'utf8',
        ),
      ),
    ),
  )
  return {
    packages: packages.filter(({ private: isPrivate }) => !isPrivate),
    repository: githubRepositoryFromManifest(rootManifest),
  }
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
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      'npm Trusted Publishers must be configured from an interactive terminal because npm requires two-factor authentication.',
    )
  }

  const { packages, repository: defaultRepository } =
    await readRepositoryConfiguration()
  const selection = argumentValue('--packages') ?? '*'
  const repository = argumentValue('--repository') ?? defaultRepository
  const workflow = argumentValue('--workflow') ?? 'deployment.yml'
  const packageNames = selectWorkspacePackageNames(packages, selection)
  await configureTrustedPublishing({ packageNames, repository, workflow })
}

const isDirectExecution =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isDirectExecution) await run()
