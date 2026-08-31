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

import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { stdout } from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const { fetch } = globalThis
const run = promisify(execFile)
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const destination = resolve(packageRoot, '.grove-fhir')
const marker = resolve(destination, '.ref')
const repository = 'https://github.com/SchmiedmayerLab/grove-fhir'

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

  const staging = await mkdtemp(resolve(packageRoot, '.grove-fhir-fetch-'))
  try {
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
      `grove-fhir-${ref}/catalog`,
      `grove-fhir-${ref}/Conformance/corpora/mobile-semantics`,
      `grove-fhir-${ref}/Conformance/corpora/mobile-exchange`,
    ])
    await rm(tarball)
    await writeFile(resolve(staging, '.ref'), markerValue)
    await rm(destination, { recursive: true, force: true })
    await rename(staging, destination)
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    throw error
  }
  stdout.write(`Fetched Grove FHIR catalogs at ${ref}\n`)
}
