//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { preparePages } from './prepare-pages.mjs'

const temporaryDirectories = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  )
})

const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), 'grove-pages-'))
  temporaryDirectories.push(root)

  await Promise.all([
    mkdir(join(root, 'deploy'), { recursive: true }),
    mkdir(join(root, 'pages'), { recursive: true }),
    mkdir(join(root, 'packages/design-system/docs/build'), {
      recursive: true,
    }),
    mkdir(join(root, 'packages/design-system/storybook-static'), {
      recursive: true,
    }),
  ])
  await Promise.all([
    writeFile(join(root, 'deploy/stale.txt'), 'stale'),
    writeFile(join(root, 'pages/index.html'), 'root'),
    writeFile(
      join(root, 'packages/design-system/docs/build/index.html'),
      'docs',
    ),
    writeFile(
      join(root, 'packages/design-system/storybook-static/index.html'),
      'storybook',
    ),
  ])
  return root
}

describe('Pages artifact preparation', () => {
  it('assembles a clean deployment directory', async () => {
    const root = await fixture()

    await preparePages(root)

    await assert.rejects(readFile(join(root, 'deploy/stale.txt')))
    assert.equal(
      await readFile(join(root, 'deploy/index.html'), 'utf8'),
      'root',
    )
    assert.equal(
      await readFile(join(root, 'deploy/docs/index.html'), 'utf8'),
      'docs',
    )
    assert.equal(
      await readFile(join(root, 'deploy/storybook/index.html'), 'utf8'),
      'storybook',
    )
  })
})
