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
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { stdout } from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const { fetch } = globalThis
const run = promisify(execFile)
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const destination = resolve(packageRoot, '.grove-fhir')
const marker = resolve(destination, '.sha')

const pin = JSON.parse(
  await readFile(resolve(packageRoot, 'grove-fhir.json'), 'utf8'),
)
if (!/^[\da-f]{40}$/u.test(pin.sha)) {
  throw new Error(
    `grove-fhir.json must pin a complete commit SHA, got "${pin.sha}"`,
  )
}

const present = await readFile(marker, 'utf8').catch(() => undefined)
// Every generator and checker depends on this, so repeated runs are the common case.
if (present !== pin.sha) {
  const archive = `${pin.repository}/archive/${pin.sha}.tar.gz`
  const response = await fetch(archive)
  if (!response.ok) {
    throw new Error(`Could not fetch ${archive}: ${response.status}`)
  }

  await rm(destination, { recursive: true, force: true })
  await mkdir(destination, { recursive: true })
  const tarball = resolve(destination, 'grove-fhir.tar.gz')
  await writeFile(tarball, Buffer.from(await response.arrayBuffer()))

  // The archive root is named for the commit, so strip it and keep only what is read.
  await run('tar', [
    '--extract',
    '--file',
    tarball,
    '--directory',
    destination,
    '--strip-components',
    '1',
    `grove-fhir-${pin.sha}/catalog`,
    `grove-fhir-${pin.sha}/Conformance/corpora/mobile-semantics`,
  ])
  await rm(tarball)
  await writeFile(marker, pin.sha)
  stdout.write(`Fetched Grove FHIR catalogs at ${pin.sha.slice(0, 7)}\n`)
}
