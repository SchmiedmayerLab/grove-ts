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
  createReleasePlan,
  lookupNpmPackage,
  parseBootstrapPackages,
  releaseChannel,
  sortWorkspacePackages,
  validateReleaseVersion,
} from './release-plan.mjs'
import { synchronizeWorkspaceManifests } from './sync-workspace-versions.mjs'

const workspacePackage = (name, dependencies) => ({
  workspace: `packages/${name}`,
  manifest: { name, dependencies },
})

const registry = (packages) => async (name) =>
  packages[name] ? { versions: new Set(packages[name]) } : null

describe('release version validation', () => {
  it('accepts stable and prerelease bare semantic versions', () => {
    assert.equal(validateReleaseVersion('0.1.0'), '0.1.0')
    assert.equal(validateReleaseVersion('1.0.0-beta.1'), '1.0.0-beta.1')
  })

  it('rejects prefixes and incomplete versions', () => {
    assert.throws(() => validateReleaseVersion('v0.1.0'), /without a v prefix/)
    assert.throws(() => validateReleaseVersion('0.1'), /semantic versioning/)
  })

  it('derives stable and prerelease distribution channels', () => {
    assert.deepEqual(releaseChannel('0.1.0'), {
      npmTag: 'latest',
      prerelease: false,
    })
    assert.deepEqual(releaseChannel('0.2.0-beta.1'), {
      npmTag: 'next',
      prerelease: true,
    })
    assert.deepEqual(releaseChannel('0.2.0+build-1'), {
      npmTag: 'latest',
      prerelease: false,
    })
  })
})

describe('bootstrap package parsing', () => {
  it('accepts comma and whitespace separators', () => {
    assert.deepEqual(
      parseBootstrapPackages('@scope/one, @scope/two\n@scope/three'),
      new Set(['@scope/one', '@scope/two', '@scope/three']),
    )
  })

  it('does not mix the wildcard with explicit packages', () => {
    assert.throws(
      () => parseBootstrapPackages('*,@scope/one'),
      /either \* or explicit/,
    )
  })
})

describe('workspace publication order', () => {
  it('publishes runtime dependencies first', () => {
    const consumer = workspacePackage('@scope/consumer', {
      '@scope/dependency': '0.0.0',
    })
    const dependency = workspacePackage('@scope/dependency')
    assert.deepEqual(
      sortWorkspacePackages([consumer, dependency]).map(
        ({ manifest }) => manifest.name,
      ),
      ['@scope/dependency', '@scope/consumer'],
    )
  })

  it('rejects runtime workspace dependency cycles', () => {
    const first = workspacePackage('@scope/first', {
      '@scope/second': '0.0.0',
    })
    const second = workspacePackage('@scope/second', {
      '@scope/first': '0.0.0',
    })
    assert.throws(
      () => sortWorkspacePackages([first, second]),
      /dependency cycle/,
    )
  })
})

describe('workspace version synchronization', () => {
  it('updates every version and internal dependency field atomically', () => {
    const manifests = [
      {
        name: '@scope/dependency',
        version: '0.0.0',
      },
      {
        name: '@scope/consumer',
        version: '0.0.0',
        dependencies: { '@scope/dependency': '0.0.0' },
        devDependencies: { '@scope/dependency': '^0.0.0' },
        optionalDependencies: { '@scope/dependency': '*' },
        peerDependencies: { '@scope/dependency': '>=0.0.0' },
      },
    ]

    synchronizeWorkspaceManifests(manifests, '0.2.0')

    assert.deepEqual(manifests, [
      {
        name: '@scope/dependency',
        version: '0.2.0',
      },
      {
        name: '@scope/consumer',
        version: '0.2.0',
        dependencies: { '@scope/dependency': '0.2.0' },
        devDependencies: { '@scope/dependency': '0.2.0' },
        optionalDependencies: { '@scope/dependency': '0.2.0' },
        peerDependencies: { '@scope/dependency': '0.2.0' },
      },
    ])
  })
})

describe('release planning', () => {
  const packages = [
    workspacePackage('@scope/dependency'),
    workspacePackage('@scope/consumer', {
      '@scope/dependency': '0.0.0',
    }),
  ]

  it('separates OIDC, bootstrap, and already-published packages', async () => {
    const plan = await createReleasePlan({
      packages,
      version: '0.2.0',
      bootstrapPackages: new Set(['@scope/consumer']),
      lookupPackage: registry({ '@scope/dependency': ['0.1.0'] }),
    })
    assert.deepEqual(plan, {
      all: ['@scope/dependency', '@scope/consumer'],
      oidc: ['@scope/dependency'],
      bootstrap: ['@scope/consumer'],
      skipped: [],
    })
  })

  it('supports the initial wildcard bootstrap', async () => {
    const plan = await createReleasePlan({
      packages,
      version: '0.1.0',
      bootstrapPackages: new Set(['*']),
      lookupPackage: registry({}),
    })
    assert.deepEqual(plan.bootstrap, ['@scope/dependency', '@scope/consumer'])
  })

  it('makes a partial publication retry idempotent', async () => {
    const plan = await createReleasePlan({
      packages,
      version: '0.2.0',
      bootstrapPackages: new Set(['*']),
      lookupPackage: registry({ '@scope/dependency': ['0.2.0'] }),
    })
    assert.deepEqual(plan, {
      all: ['@scope/dependency', '@scope/consumer'],
      oidc: [],
      bootstrap: ['@scope/consumer'],
      skipped: ['@scope/dependency'],
    })
  })

  it('requires explicit authorization for unpublished packages', async () => {
    await assert.rejects(
      createReleasePlan({
        packages,
        version: '0.1.0',
        bootstrapPackages: new Set(),
        lookupPackage: registry({}),
      }),
      /manually dispatch Deployment/,
    )
  })

  it('rejects token bootstrap for an existing package', async () => {
    await assert.rejects(
      createReleasePlan({
        packages,
        version: '0.2.0',
        bootstrapPackages: new Set(['@scope/dependency']),
        lookupPackage: registry({ '@scope/dependency': ['0.1.0'] }),
      }),
      /must use Trusted Publishing/,
    )
  })

  it('rejects unknown package selections', async () => {
    await assert.rejects(
      createReleasePlan({
        packages,
        version: '0.1.0',
        bootstrapPackages: new Set(['@scope/unknown']),
        lookupPackage: registry({}),
      }),
      /Unknown bootstrap package/,
    )
  })
})

describe('npm registry lookup', () => {
  it('returns published versions', async () => {
    const lookup = await lookupNpmPackage('@scope/package', async () =>
      Response.json({ versions: { '0.1.0': {}, '0.2.0': {} } }),
    )
    assert.deepEqual(lookup?.versions, new Set(['0.1.0', '0.2.0']))
  })

  it('treats a registry 404 as an unpublished package', async () => {
    const lookup = await lookupNpmPackage(
      '@scope/package',
      async () => new Response(null, { status: 404 }),
    )
    assert.equal(lookup, null)
  })

  it('fails closed on registry errors', async () => {
    await assert.rejects(
      lookupNpmPackage(
        '@scope/package',
        async () => new Response(null, { status: 503 }),
      ),
      /HTTP 503/,
    )
  })
})
