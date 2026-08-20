//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { argv } from 'node:process'
import { fileURLToPath } from 'node:url'

import { format } from 'prettier'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const destination = resolve(packageRoot, 'catalog/grove-fhir')
const names = [
  'package-graph.json',
  'measurement-catalog.json',
  'exchange-identity.json',
  'profile-claims.json',
]

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
for (const name of names) {
  const contents = await readFile(resolve(source, name), 'utf8')
  const catalog = JSON.parse(contents)
  await writeFile(
    resolve(destination, name),
    await format(JSON.stringify(catalog), { parser: 'json' }),
  )
  await writeFile(
    resolve(destination, `${name}.license`),
    'SPDX-License-Identifier: MIT\n',
  )
}

await writeFile(
  resolve(destination, 'source-ref.json'),
  `${JSON.stringify(
    {
      repository: 'https://github.com/GroveAlliance/grove-fhir',
      ref,
      resolvedSha: sha,
      dirty: argv.includes('--dirty'),
    },
    undefined,
    2,
  )}\n`,
)
await writeFile(
  resolve(destination, 'source-ref.json.license'),
  'SPDX-License-Identifier: MIT\n',
)
