//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

// Records the shape of every profile in the Grove FHIR implementation guide, at every depth, as
// the fixture `test/fixtures/guide-shapes.json`. The profiles in `src/r4` are derived from the R4B
// base schemas rather than transcribed from the guide, so something has to state independently
// what the guide's shapes are; that is what this fixture is for, and `derived-shapes.test.ts`
// is what compares the two.
//
// This is a maintenance tool, not part of any build: it needs a checkout of the guide's own
// TypeScript facade, whose compiled `r4/index.js` is passed as the only argument. Re-run it when
// the pinned guide version changes, and commit the result.
//
//   node scripts/capture-guide-shapes.mjs <path-to-guide>/dist/r4/index.js

import { writeFile } from 'node:fs/promises'
import { argv, exit, stderr, stdout } from 'node:process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const [, , guideEntry] = argv
if (guideEntry === undefined) {
  stderr.write(
    'Usage: node scripts/capture-guide-shapes.mjs <guide>/dist/r4/index.js\n',
  )
  exit(1)
}

const guide = await import(pathToFileURL(resolve(guideEntry)).href)

/** Peel optional, array, lazy and refinement wrappers until an object schema is reached. */
const objectAt = (schema, depth = 0) => {
  if (!schema || depth > 12) return undefined
  const definition = schema._zod?.def
  if (!definition) return undefined
  switch (definition.type) {
    case 'object':
      return schema
    case 'lazy':
      return objectAt(definition.getter(), depth + 1)
    case 'optional':
    case 'nullable':
    case 'readonly':
    case 'default':
      return objectAt(definition.innerType, depth + 1)
    case 'array':
      return objectAt(definition.element, depth + 1)
    case 'pipe':
      return objectAt(definition.in, depth + 1)
    default:
      return undefined
  }
}

// Extension nests into every element and into itself, so walking by path would enumerate the same
// handful of shapes tens of thousands of times and never terminate on its own. Distinct shapes are
// recorded instead, each labelled by the first path it appeared at, which both terminates and
// leaves a failure legible.
const profiles = {}
const shapes = {}
const seen = new Set()

const record = (path, schema) => {
  const node = objectAt(schema)
  if (!node) return
  const shape = node._zod.def.shape
  const keys = Object.keys(shape).sort()
  const signature = keys.join(',')
  if (seen.has(signature)) return
  seen.add(signature)
  shapes[path] = keys
  for (const field of keys) record(`${path}.${field}`, shape[field])
}

const PROFILES = [
  ['Observation', 'observationSchema'],
  ['ObservationComponent', 'observationComponentSchema'],
  ['Device', 'deviceSchema'],
  ['DocumentReference', 'documentReferenceSchema'],
  ['Provenance', 'provenanceSchema'],
  ['Specimen', 'specimenSchema'],
  ['CollectionBundle', 'collectionBundleSchema'],
  ['Extension', 'extensionSchema'],
  ['Identifier', 'identifierSchema'],
  ['Reference', 'referenceSchema'],
  ['Coding', 'codingSchema'],
  ['CodeableConcept', 'codeableConceptSchema'],
  ['Quantity', 'quantitySchema'],
  ['Period', 'periodSchema'],
  ['Attachment', 'attachmentSchema'],
  ['SampledData', 'sampledDataSchema'],
  ['Meta', 'metaSchema'],
  ['Expression', 'expressionSchema'],
  ['PrimitiveElement', 'primitiveElementSchema'],
]

for (const [label, exportName] of PROFILES) {
  const schema = guide[exportName]
  if (schema === undefined) {
    stderr.write(`The guide does not export ${exportName}.\n`)
    exit(1)
  }
  const node = objectAt(schema)
  if (node === undefined) {
    stderr.write(`${exportName} does not resolve to an object schema.\n`)
    exit(1)
  }
  // Every profile's own shape is recorded by name, so a mismatch names the profile rather than
  // whichever path happened to reach the shape first.
  profiles[label] = Object.keys(node._zod.def.shape).sort()
}

for (const [label, exportName] of PROFILES) record(label, guide[exportName])

const destination = resolve(
  import.meta.dirname,
  '..',
  'test',
  'fixtures',
  'guide-shapes.json',
)
await writeFile(
  destination,
  `${JSON.stringify({ profiles, shapes }, null, 2)}\n`,
)
stdout.write(
  `Captured ${PROFILES.length} profiles and ${Object.keys(shapes).length} distinct shapes.\n`,
)
