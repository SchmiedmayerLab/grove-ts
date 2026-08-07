//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { validateReleaseVersion } from './release-plan.mjs'

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const rootPackagePath = resolve(repositoryRoot, 'package.json')
const rootPackage = JSON.parse(await readFile(rootPackagePath, 'utf8'))

const dependencyFields = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
]

/** Synchronize workspace versions and every internal dependency reference. */
export const synchronizeWorkspaceManifests = (manifests, targetVersion) => {
  if (targetVersion) validateReleaseVersion(targetVersion)

  if (targetVersion) {
    for (const manifest of manifests) manifest.version = targetVersion
  }

  const workspaceVersions = new Map(
    manifests.map((manifest) => [manifest.name, manifest.version]),
  )

  for (const manifest of manifests) {
    for (const dependencyField of dependencyFields) {
      const dependencies = manifest[dependencyField]
      if (!dependencies) continue

      for (const dependencyName of Object.keys(dependencies)) {
        const workspaceVersion = workspaceVersions.get(dependencyName)
        if (workspaceVersion) dependencies[dependencyName] = workspaceVersion
      }
    }
  }
  return manifests
}

const run = async () => {
  const targetVersion = process.argv[2]
  const workspacePackages = await Promise.all(
    rootPackage.workspaces.map(async (workspace) => {
      const path = resolve(repositoryRoot, workspace, 'package.json')
      const contents = await readFile(path, 'utf8')
      return { path, manifest: JSON.parse(contents) }
    }),
  )

  synchronizeWorkspaceManifests(
    workspacePackages.map(({ manifest }) => manifest),
    targetVersion,
  )

  for (const workspacePackage of workspacePackages) {
    await writeFile(
      workspacePackage.path,
      `${JSON.stringify(workspacePackage.manifest, null, 2)}\n`,
    )
  }
}

const isDirectExecution =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isDirectExecution) await run()
