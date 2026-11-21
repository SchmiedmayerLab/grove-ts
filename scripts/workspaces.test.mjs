//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  parseWorkspacePackages,
  readPublicWorkspacePackages,
} from './workspaces.mjs'

describe('workspace packages', () => {
  it('reads explicit package directories', () => {
    assert.deepEqual(
      parseWorkspacePackages(
        "# header\n\npackages:\n  - packages/a\n  # note\n  - 'packages/b'\n\nallowBuilds:\n  esbuild: true\n",
      ),
      ['packages/a', 'packages/b'],
    )
  })

  it('rejects a missing package list', () => {
    assert.throws(
      () => parseWorkspacePackages('allowBuilds:\n  esbuild: true\n'),
      /must list workspace packages/,
    )
  })

  it('rejects package globs', () => {
    assert.throws(
      () => parseWorkspacePackages('packages:\n  - packages/*\n'),
      /explicitly/,
    )
  })

  it('excludes private workspaces from published packages', async () => {
    const packages = await readPublicWorkspacePackages()
    assert.ok(packages.length > 0)
    for (const { manifest } of packages) {
      assert.notEqual(manifest.private, true)
    }
  })
})
