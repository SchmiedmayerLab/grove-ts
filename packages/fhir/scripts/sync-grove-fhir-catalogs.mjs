//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { argv } from 'node:process'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const destination = resolve(packageRoot, 'catalog/grove-fhir')
const conformanceDestination = resolve(
  packageRoot,
  'catalog/grove-fhir-conformance',
)
const sidecarLicense = `SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)

SPDX-License-Identifier: MIT
`

const option = (name) => {
  const index = argv.indexOf(name)
  return index < 0 ? undefined : argv[index + 1]
}

const source = option('--source')
const ref = option('--ref')
const sha = option('--sha')
if (source === undefined || ref === undefined || sha === undefined) {
  throw new Error(
    'Usage: node scripts/sync-grove-fhir-catalogs.mjs --source <catalog-directory> --ref <git-ref> --sha <commit> [--dirty]',
  )
}

await mkdir(destination, { recursive: true })
await mkdir(conformanceDestination, { recursive: true })
const names = (await readdir(source, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
  .map((entry) => entry.name)
  .sort()
if (names.length === 0) {
  throw new Error('The source directory does not contain IG JSON catalogs.')
}
const retainedNames = new Set([
  ...names,
  ...names.map((name) => `${name}.license`),
  'source-ref.json',
  'source-ref.json.license',
])
for (const entry of await readdir(destination, { withFileTypes: true })) {
  if (
    entry.isFile() &&
    (entry.name.endsWith('.json') || entry.name.endsWith('.json.license')) &&
    !retainedNames.has(entry.name)
  ) {
    await unlink(resolve(destination, entry.name))
  }
}
for (const name of names) {
  const contents = await readFile(resolve(source, name), 'utf8')
  JSON.parse(contents)
  await writeFile(resolve(destination, name), contents)
  await writeFile(resolve(destination, `${name}.license`), sidecarLicense)
}

const semanticCorpusContents = await readFile(
  resolve(source, '../Conformance/corpora/mobile-semantics/corpus.json'),
  'utf8',
)
JSON.parse(semanticCorpusContents)
await writeFile(
  resolve(conformanceDestination, 'mobile-semantics-corpus.json'),
  semanticCorpusContents,
)
await writeFile(
  resolve(conformanceDestination, 'mobile-semantics-corpus.json.license'),
  sidecarLicense,
)

await writeFile(
  resolve(destination, 'source-ref.json'),
  `${JSON.stringify(
    {
      repository: 'https://github.com/SchmiedmayerLab/grove-fhir',
      ref,
      resolvedSha: sha,
      dirty: argv.includes('--dirty'),
    },
    undefined,
    2,
  )}\n`,
)
await writeFile(resolve(destination, 'source-ref.json.license'), sidecarLicense)
