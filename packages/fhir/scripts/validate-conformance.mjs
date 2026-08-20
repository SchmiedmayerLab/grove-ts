//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { spawnSync } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { argv, execPath, stdout } from 'node:process'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fixtureRoot = resolve(packageRoot, 'fixtures/conformance')
const manifest = resolve(fixtureRoot, 'manifest.json')
const catalogRoot = resolve(packageRoot, '.grove-fhir/catalog')
const semanticCorpus = resolve(
  packageRoot,
  '.grove-fhir/Conformance/corpora/mobile-semantics/corpus.json',
)

const argument = (name) => {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}

const rawIg = argument('--ig')
if (rawIg === undefined) {
  throw new Error(
    'Usage: validate-conformance.mjs --ig <grove-fhir checkout> [--structural-only]',
  )
}
const igRoot = resolve(rawIg)
const structuralOnly = argv.includes('--structural-only')
const validator = resolve(
  argument('--validator') ?? `${igRoot}/.build/fhir-tools/validator_cli.jar`,
)

const run = (command, commandArguments, workingDirectory = packageRoot) => {
  const result = spawnSync(command, commandArguments, {
    cwd: workingDirectory,
    stdio: 'inherit',
    encoding: 'utf8',
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${String(result.status)}.`)
  }
}

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'))

const requireByteIdentical = async (localPath, upstreamPath, label) => {
  const [local, upstream] = await Promise.all([
    readFile(localPath),
    readFile(upstreamPath),
  ])
  if (!local.equals(upstream)) {
    throw new Error(`Consumed IG artifact is not byte-identical: ${label}`)
  }
}

const igStatus = await stat(igRoot).catch(() => undefined)
if (igStatus?.isDirectory() !== true) {
  throw new Error(`Grove FHIR checkout is not a directory: ${igRoot}`)
}

const catalogs = (await readdir(catalogRoot))
  .filter((name) => name.endsWith('.json'))
  .sort()
const upstreamCatalogs = (await readdir(resolve(igRoot, 'catalog')))
  .filter((name) => name.endsWith('.json'))
  .sort()
if (!isDeepStrictEqual(catalogs, upstreamCatalogs)) {
  throw new Error('The consumed IG catalog set is out of sync.')
}
for (const catalog of catalogs) {
  await requireByteIdentical(
    resolve(catalogRoot, catalog),
    resolve(igRoot, 'catalog', catalog),
    catalog,
  )
}
await requireByteIdentical(
  semanticCorpus,
  resolve(igRoot, 'Conformance/corpora/mobile-semantics/corpus.json'),
  'Conformance/corpora/mobile-semantics/corpus.json',
)

const pin = await readJson(resolve(packageRoot, 'grove-fhir.json'))
const revision = spawnSync('git', ['-C', igRoot, 'rev-parse', 'HEAD'], {
  encoding: 'utf8',
})
if (revision.status !== 0) {
  throw new Error('Cannot resolve the Grove FHIR checkout revision.')
}
const resolvedSha = revision.stdout.trim()
stdout.write(`Grove FHIR pinned commit: ${pin.sha}\n`)
stdout.write(`Grove FHIR checkout SHA: ${resolvedSha}\n`)
// The guide checkout and the catalogs this package generated from must be one commit.
if (!structuralOnly && resolvedSha !== pin.sha) {
  throw new Error(
    `The Grove FHIR checkout is ${resolvedSha}, but this package is pinned to ${pin.sha}.`,
  )
}

run(execPath, [
  resolve(packageRoot, 'scripts/generate-conformance-fixtures.mjs'),
  '--check',
])

const producerArguments = [
  resolve(igRoot, 'Scripts/validate-producer.py'),
  '--manifest',
  manifest,
]
if (structuralOnly) {
  producerArguments.push('--structural-only')
} else {
  producerArguments.push(
    '--validator',
    validator,
    '--package',
    `mobile=${resolve(igRoot, 'mobile/output/package.tgz')}`,
    '--package',
    `connected-health=${resolve(igRoot, 'connected-health/output/package.tgz')}`,
    '--package',
    `sensor=${resolve(igRoot, 'sensor/output/package.tgz')}`,
    '--package',
    `questionnaire=${resolve(igRoot, 'questionnaire/output/package.tgz')}`,
  )
}
run('python3', producerArguments, igRoot)

const questionnaire = resolve(fixtureRoot, 'resources/questionnaire.json')
const response = resolve(fixtureRoot, 'resources/questionnaire-response.json')
run(
  'python3',
  [
    resolve(igRoot, 'Scripts/validate-questionnaire.py'),
    '--questionnaire',
    questionnaire,
    '--response',
    response,
  ],
  igRoot,
)

if (!structuralOnly) {
  run(
    'python3',
    [
      resolve(igRoot, 'Scripts/validate-questionnaire-fhir.py'),
      '--validator',
      validator,
      '--package',
      resolve(igRoot, 'questionnaire/output/package.tgz'),
      '--resource',
      questionnaire,
      '--resource',
      response,
      '--allow-example-urls',
    ],
    igRoot,
  )
}

stdout.write(
  `Grove FHIR ${structuralOnly ? 'structural' : 'official Validator'} conformance passed.\n`,
)
