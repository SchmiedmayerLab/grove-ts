//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { copyFile, cp, mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

/** Assemble the documentation, Storybook, and root redirect into one Pages artifact. */
export const preparePages = async (root = repositoryRoot) => {
  const deploymentDirectory = resolve(root, 'deploy')

  await rm(deploymentDirectory, { force: true, recursive: true })
  await mkdir(deploymentDirectory, { recursive: true })
  await copyFile(
    resolve(root, 'pages/index.html'),
    resolve(deploymentDirectory, 'index.html'),
  )
  await Promise.all([
    cp(
      resolve(root, 'packages/design-system/docs/build'),
      resolve(deploymentDirectory, 'docs'),
      { recursive: true },
    ),
    cp(
      resolve(root, 'packages/design-system/storybook-static'),
      resolve(deploymentDirectory, 'storybook'),
      { recursive: true },
    ),
  ])
}

const isDirectExecution =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isDirectExecution) await preparePages()
