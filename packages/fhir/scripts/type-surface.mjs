//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

// Snapshots the declared public surface of every entry point from the built .d.ts files,
// beside the runtime export snapshot: a renamed type or a changed signature shows up as a
// reviewable diff instead of reaching a consumer first.

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { argv, stdout } from 'node:process'
import { fileURLToPath } from 'node:url'

import {
  createProgram,
  isFunctionDeclaration,
  isVariableDeclaration,
  ModuleKind,
  ModuleResolutionKind,
  ScriptTarget,
  SymbolFlags,
} from 'typescript'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const snapshotPath = resolve(packageRoot, 'test/type-surface.json')
const check = argv.includes('--check')
const entryPoints = {
  '.': 'dist/index.d.ts',
  './r4': 'dist/r4/index.d.ts',
  './mobile': 'dist/mobile/index.d.ts',
  './providers': 'dist/providers/index.d.ts',
  './questionnaire': 'dist/questionnaire/index.d.ts',
}

const program = createProgram(
  Object.values(entryPoints).map((path) => resolve(packageRoot, path)),
  {
    module: ModuleKind.NodeNext,
    moduleResolution: ModuleResolutionKind.NodeNext,
    target: ScriptTarget.ES2022,
    exactOptionalPropertyTypes: true,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
  },
)
const checker = program.getTypeChecker()

const declarationText = (declaration) => {
  const text = declaration.getText()
  if (isVariableDeclaration(declaration)) return `const ${text}`
  if (isFunctionDeclaration(declaration)) return text
  return text.replace(/^export\s+(?:declare\s+)?/u, '')
}

const surface = {}
for (const [name, path] of Object.entries(entryPoints)) {
  const sourceFile = program.getSourceFile(resolve(packageRoot, path))
  if (sourceFile === undefined) {
    throw new Error(`Missing declaration file ${path}; run the build first.`)
  }
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile)
  if (moduleSymbol === undefined) {
    throw new Error(`${path} declares no module.`)
  }
  const members = {}
  for (const symbol of checker.getExportsOfModule(moduleSymbol)) {
    const resolved =
      symbol.flags & SymbolFlags.Alias ?
        checker.getAliasedSymbol(symbol)
      : symbol
    const declarations = resolved.declarations ?? []
    if (declarations.length === 0) {
      throw new Error(`${name} export ${symbol.name} has no declaration.`)
    }
    members[symbol.name] = declarations.map(declarationText).join('\n')
  }
  surface[name] = Object.fromEntries(
    Object.entries(members).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  )
}

const rendered = `${JSON.stringify(surface, null, 2)}\n`
if (check) {
  const existing = await readFile(snapshotPath, 'utf8').catch(() => undefined)
  if (existing !== rendered) {
    throw new Error(
      'The declared public surface changed. Review the diff and run npm run generate:surface.',
    )
  }
  stdout.write('The declared public surface matches its snapshot.\n')
} else {
  await writeFile(snapshotPath, rendered)
  stdout.write(
    `Snapshotted ${String(Object.keys(surface).length)} entry points.\n`,
  )
}
