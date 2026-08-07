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
  configureTrustedPublishing,
  githubRepositoryFromManifest,
  selectWorkspacePackageNames,
  validateTrustedPublisherTarget,
} from './configure-trusted-publishing.mjs'

const packages = [
  { name: '@scope/first' },
  { name: '@scope/second' },
  { name: '@scope/third' },
]

describe('workspace package selection', () => {
  it('selects all public workspaces with a wildcard', () => {
    assert.deepEqual(selectWorkspacePackageNames(packages, '*'), [
      '@scope/first',
      '@scope/second',
      '@scope/third',
    ])
  })

  it('accepts comma- and whitespace-separated package names', () => {
    assert.deepEqual(
      selectWorkspacePackageNames(packages, '@scope/third, @scope/first'),
      ['@scope/first', '@scope/third'],
    )
  })

  it('rejects empty, mixed wildcard, and unknown selections', () => {
    assert.throws(
      () => selectWorkspacePackageNames(packages, ''),
      /At least one package/,
    )
    assert.throws(
      () => selectWorkspacePackageNames(packages, '*,@scope/first'),
      /either \* or explicit/,
    )
    assert.throws(
      () => selectWorkspacePackageNames(packages, '@scope/unknown'),
      /Unknown package/,
    )
  })
})

describe('Trusted Publisher target validation', () => {
  it('reads the GitHub repository from package metadata', () => {
    assert.equal(
      githubRepositoryFromManifest({
        repository: {
          url: 'git+https://github.com/SchmiedmayerLab/grove-ts.git',
        },
      }),
      'SchmiedmayerLab/grove-ts',
    )
    assert.throws(
      () =>
        githubRepositoryFromManifest({
          repository: 'https://example.com/owner/repository.git',
        }),
      /GitHub repository URL/,
    )
  })

  it('accepts a GitHub repository and workflow filename', () => {
    assert.doesNotThrow(() =>
      validateTrustedPublisherTarget({
        repository: 'SchmiedmayerLab/grove-ts',
        workflow: 'deployment.yml',
      }),
    )
  })

  it('rejects invalid repositories and workflow paths', () => {
    assert.throws(
      () =>
        validateTrustedPublisherTarget({
          repository: 'grove-ts',
          workflow: 'deployment.yml',
        }),
      /owner\/repository/,
    )
    assert.throws(
      () =>
        validateTrustedPublisherTarget({
          repository: 'SchmiedmayerLab/grove-ts',
          workflow: '.github/workflows/deployment.yml',
        }),
      /workflow must be/,
    )
  })
})

describe('Trusted Publisher configuration', () => {
  it('configures every package for OIDC publishing', async () => {
    const calls = []
    await configureTrustedPublishing({
      execute: async (...arguments_) => {
        calls.push(arguments_)
      },
      packageNames: ['@scope/first', '@scope/second'],
      repository: 'SchmiedmayerLab/grove-ts',
      sleep: async () => {},
      workflow: 'deployment.yml',
    })

    assert.deepEqual(
      calls.map(([command, arguments_]) => [command, arguments_]),
      [
        [
          'npm',
          [
            'trust',
            'github',
            '@scope/first',
            '--repository',
            'SchmiedmayerLab/grove-ts',
            '--file',
            'deployment.yml',
            '--allow-publish',
            '--yes',
          ],
        ],
        [
          'npm',
          [
            'trust',
            'github',
            '@scope/second',
            '--repository',
            'SchmiedmayerLab/grove-ts',
            '--file',
            'deployment.yml',
            '--allow-publish',
            '--yes',
          ],
        ],
      ],
    )
  })
})
