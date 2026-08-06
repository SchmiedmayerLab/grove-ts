//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const rootPackagePath = resolve(repositoryRoot, 'package.json')
const rootPackage = JSON.parse(await readFile(rootPackagePath, 'utf8'))

const workspacePackages = await Promise.all(
  rootPackage.workspaces.map(async (workspace) => {
    const path = resolve(repositoryRoot, workspace, 'package.json')
    const contents = await readFile(path, 'utf8')
    return { path, manifest: JSON.parse(contents) }
  }),
)

const workspaceVersions = new Map(
  workspacePackages.map(({ manifest }) => [manifest.name, manifest.version]),
)
const dependencyFields = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
]

for (const workspacePackage of workspacePackages) {
  let didChange = false

  for (const dependencyField of dependencyFields) {
    const dependencies = workspacePackage.manifest[dependencyField]
    if (!dependencies) continue

    for (const dependencyName of Object.keys(dependencies)) {
      const workspaceVersion = workspaceVersions.get(dependencyName)
      if (
        !workspaceVersion ||
        dependencies[dependencyName] === workspaceVersion
      ) {
        continue
      }

      dependencies[dependencyName] = workspaceVersion
      didChange = true
    }
  }

  if (didChange) {
    await writeFile(
      workspacePackage.path,
      `${JSON.stringify(workspacePackage.manifest, null, 2)}\n`,
    )
  }
}
