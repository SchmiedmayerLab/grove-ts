//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

// Enumerates everything the package's root entry point exports, resolved through `export *` and
// through aliases, and says of each name whether it is a value, a type, or both.
//
// A type check cannot answer the question this exists for. An explicit named re-export silently
// shadows an `export *` of the same name, so a type at the root can change meaning, or vanish,
// without any error anywhere. The snapshot of the released surface lives in
// `test/fixtures/root-exports.json`, and `legacy-surface.test.ts` compares this against it.
//
//   node scripts/snapshot-root-exports.mjs            # print the current surface
//   node scripts/snapshot-root-exports.mjs --write    # rewrite the fixture
//
// Regenerate the fixture only to record a deliberate addition. A name that disappears from it is
// a breaking change to a published package, not a fixture that needs updating.

import { writeFile } from 'node:fs/promises'
import { argv, stdout } from 'node:process'
import { resolve } from 'node:path'
import {
  createProgram,
  flattenDiagnosticMessageText,
  parseJsonConfigFileContent,
  readConfigFile,
  SymbolFlags,
  sys,
} from 'typescript'

const packageRoot = resolve(import.meta.dirname, '..')
const entry = resolve(packageRoot, 'src/index.ts')
const configPath = resolve(packageRoot, 'tsconfig.json')

const configFile = readConfigFile(configPath, sys.readFile)
if (configFile.error) {
  throw new Error(
    flattenDiagnosticMessageText(configFile.error.messageText, '\n'),
  )
}
const parsed = parseJsonConfigFileContent(configFile.config, sys, packageRoot)

const program = createProgram([entry], {
  ...parsed.options,
  noEmit: true,
})
const checker = program.getTypeChecker()

const source = program.getSourceFile(entry)
if (source === undefined) throw new Error(`Could not load ${entry}`)

const moduleSymbol = checker.getSymbolAtLocation(source)
if (moduleSymbol === undefined) {
  throw new Error('The root entry point does not resolve to a module.')
}

const surface = {}
for (const symbol of checker.getExportsOfModule(moduleSymbol)) {
  // An alias has to be followed before its flags mean anything: `export { x } from './y.js'`
  // carries only the Alias flag at the re-export site.
  const target =
    (symbol.flags & SymbolFlags.Alias) !== 0 ?
      checker.getAliasedSymbol(symbol)
    : symbol
  const isValue = (target.flags & SymbolFlags.Value) !== 0
  const isType = (target.flags & SymbolFlags.Type) !== 0
  surface[symbol.getName()] =
    isValue && isType ? 'both'
    : isValue ? 'value'
    : isType ? 'type'
    : 'other'
}

const ordered = Object.fromEntries(
  Object.keys(surface)
    .sort()
    .map((name) => [name, surface[name]]),
)

if (argv.includes('--write')) {
  const destination = resolve(packageRoot, 'test/fixtures/root-exports.json')
  await writeFile(destination, `${JSON.stringify(ordered, null, 2)}\n`)
  stdout.write(`Wrote ${Object.keys(ordered).length} exports to the fixture.\n`)
} else {
  stdout.write(`${JSON.stringify(ordered, null, 2)}\n`)
}
