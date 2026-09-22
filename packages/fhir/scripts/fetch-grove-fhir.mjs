//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

// Fetch the Grove FHIR catalogs this package generates from. The implementation guide
// owns them, so they are read at the pinned commit rather than copied into this
// repository, where a second copy could drift from the contract it claims to follow.
// A local checkout can stand in for the pin while a contract change is still unmerged:
// `--local <path>` or GROVE_FHIR_CHECKOUT vendors the same paths from that working tree.

import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cp,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { argv, env, stdout } from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const { fetch } = globalThis
const run = promisify(execFile)
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const destination = resolve(packageRoot, '.grove-fhir')
const marker = resolve(destination, '.ref')
const repository = 'https://github.com/SchmiedmayerLab/grove-fhir'
// The paths this package reads; the rest of the guide stays upstream.
const consumedPaths = [
  'catalog',
  'Conformance/corpora/mobile-exchange',
  'Conformance/corpora/mobile-semantics',
  'Conformance/corpora/receiver-lifecycle',
  'Conformance/corpora/study-attribution',
]

const pin = JSON.parse(
  await readFile(resolve(packageRoot, 'grove-fhir.json'), 'utf8'),
)
const ref = pin.ref
const archiveSha256 = pin.archiveSha256
if (
  pin.repository !== repository ||
  typeof ref !== 'string' ||
  !/^[\da-f]{40}$/u.test(ref) ||
  typeof archiveSha256 !== 'string' ||
  !/^[\da-f]{64}$/u.test(archiveSha256)
) {
  throw new Error(
    'grove-fhir.json must pin the Grove repository by complete commit SHA and exact archiveSha256.',
  )
}

const localArgument = argv.indexOf('--local')
const localCheckout =
  localArgument === -1 ? env.GROVE_FHIR_CHECKOUT : argv[localArgument + 1]

const replaceDestination = async (stage) => {
  const staging = await mkdtemp(resolve(packageRoot, '.grove-fhir-fetch-'))
  try {
    const markerValue = await stage(staging)
    await writeFile(resolve(staging, '.ref'), markerValue)
    await rm(destination, { recursive: true, force: true })
    await rename(staging, destination)
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    throw error
  }
}

if (localCheckout !== undefined) {
  const checkout = await realpath(resolve(localCheckout))
  for (const path of consumedPaths) {
    const status = await stat(resolve(checkout, path)).catch(() => undefined)
    if (status?.isDirectory() !== true) {
      throw new Error(`Grove FHIR checkout ${checkout} has no ${path}.`)
    }
  }
  // A working tree changes between runs, so it is copied every time.
  await replaceDestination(async (staging) => {
    for (const path of consumedPaths) {
      await cp(resolve(checkout, path), resolve(staging, path), {
        recursive: true,
      })
    }
    return `${JSON.stringify({ local: checkout })}\n`
  })
  stdout.write(`Vendored the Grove FHIR contract from ${checkout}\n`)
} else {
  const markerValue = `${JSON.stringify({ ref, archiveSha256 })}\n`
  const present = await readFile(marker, 'utf8').catch(() => undefined)
  // Every generator and checker depends on this, so repeated runs are the common case.
  if (present !== markerValue) {
    const archive = `${repository}/archive/${ref}.tar.gz`
    const response = await fetch(archive)
    if (!response.ok) {
      throw new Error(`Could not fetch ${archive}: ${response.status}`)
    }

    const bytes = Buffer.from(await response.arrayBuffer())
    const actualSha256 = createHash('sha256').update(bytes).digest('hex')
    if (actualSha256 !== archiveSha256) {
      throw new Error(
        `Grove FHIR archive digest mismatch.\n  expected ${archiveSha256}\n  actual   ${actualSha256}`,
      )
    }

    await replaceDestination(async (staging) => {
      const tarball = resolve(staging, 'grove-fhir.tar.gz')
      await writeFile(tarball, bytes)
      // The archive root is named for the commit, so strip it and keep only what is read.
      await run('tar', [
        '--extract',
        '--file',
        tarball,
        '--directory',
        staging,
        '--strip-components',
        '1',
        '--no-same-owner',
        '--no-same-permissions',
        ...consumedPaths.map((path) => `grove-fhir-${ref}/${path}`),
      ])
      await rm(tarball)
      return markerValue
    })
    stdout.write(`Fetched Grove FHIR catalogs at ${ref}\n`)
  }
}
