//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const manifest = JSON.parse(
  await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'),
)
const environment = {
  ...process.env,
  npm_config_cache: resolve(tmpdir(), 'grove-npm-cache'),
}

const run = (command, arguments_) => {
  execFileSync(command, arguments_, {
    cwd: repositoryRoot,
    env: environment,
    stdio: 'inherit',
  })
}

for (const workspace of manifest.workspaces) {
  run('npm', ['exec', '--offline', '--', 'publint', '--strict', workspace])
}

for (const workspace of manifest.workspaces) {
  const arguments_ = ['exec', '--offline', '--', 'attw', '--pack', workspace]
  if (workspace !== 'packages/configurations') {
    // Runtime packages intentionally expose ESM-only entry points.
    arguments_.push('--profile', 'esm-only')
  }
  if (workspace === 'packages/design-system') {
    // Browser bundlers consume this ESM package; CSS entries do not expose TypeScript declarations.
    arguments_.push(
      '--exclude-entrypoints',
      './tailwind.css',
      './base.css',
      '--ignore-rules',
      'internal-resolution-error',
      '--quiet',
    )
  }
  run('npm', arguments_)
}
