//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from 'node:fs'
import { type z } from 'zod'
import * as grove from '../src/r4/index.js'

// The profiles in `src/r4` are derived from the R4B base schemas: field lists are spread from the
// base shape and only the profile's own constraints are written out. That keeps a field in one
// place, but it means nothing in the source states what the guide's shape actually is — an
// over-broad `omit` or a base field arriving unnoticed would both pass a type check.
//
// `guide-shapes.json` states it, captured from the guide's own facade by
// `scripts/capture-guide-shapes.mjs`. These tests are what make the derivation answerable to it.

interface GuideShapes {
  readonly profiles: Readonly<Record<string, readonly string[]>>
  readonly shapes: Readonly<Record<string, readonly string[]>>
}

const guide = JSON.parse(
  fs.readFileSync('test/fixtures/guide-shapes.json', 'utf8'),
) as GuideShapes

/** Peel optional, array, lazy and refinement wrappers until an object schema is reached. */
const objectAt = (
  schema: unknown,
  depth = 0,
): z.ZodObject<z.ZodRawShape> | undefined => {
  if (schema === null || schema === undefined || depth > 12) return undefined
  const definition = (
    schema as {
      _zod?: {
        def?: {
          type?: string
          getter?: () => unknown
          innerType?: unknown
          element?: unknown
          in?: unknown
        }
      }
    }
  )._zod?.def
  if (definition === undefined) return undefined
  switch (definition.type) {
    case 'object':
      return schema as z.ZodObject<z.ZodRawShape>
    case 'lazy':
      return objectAt(definition.getter?.(), depth + 1)
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

const keysOf = (schema: unknown): readonly string[] | undefined => {
  const node = objectAt(schema)
  return node === undefined ? undefined : Object.keys(node.shape).sort()
}

const PROFILES: ReadonlyArray<readonly [string, unknown]> = [
  ['Observation', grove.groveObservationSchema],
  ['ObservationComponent', grove.groveObservationComponentSchema],
  ['Device', grove.groveDeviceSchema],
  ['DocumentReference', grove.groveDocumentReferenceSchema],
  ['Provenance', grove.groveProvenanceSchema],
  ['Specimen', grove.groveSpecimenSchema],
  ['CollectionBundle', grove.groveCollectionBundleSchema],
  ['Extension', grove.groveExtensionSchema],
  ['Identifier', grove.groveIdentifierSchema],
  ['Reference', grove.groveReferenceSchema],
  ['Coding', grove.groveCodingSchema],
  ['CodeableConcept', grove.groveCodeableConceptSchema],
  ['Quantity', grove.groveQuantitySchema],
  ['Period', grove.grovePeriodSchema],
  ['Attachment', grove.groveAttachmentSchema],
  ['SampledData', grove.groveSampledDataSchema],
  ['Meta', grove.groveMetaSchema],
  ['Expression', grove.groveExpressionSchema],
  ['PrimitiveElement', grove.grovePrimitiveElementSchema],
]

/** The distinct shapes reachable from the profiles, labelled by first appearance. */
const collectShapes = (): Record<string, readonly string[]> => {
  const shapes: Record<string, readonly string[]> = {}
  const seen = new Set<string>()

  const record = (path: string, schema: unknown): void => {
    const node = objectAt(schema)
    if (node === undefined) return
    const keys = Object.keys(node.shape).sort()
    const signature = keys.join(',')
    if (seen.has(signature)) return
    seen.add(signature)
    shapes[path] = keys
    for (const field of keys) record(`${path}.${field}`, node.shape[field])
  }

  for (const [label, schema] of PROFILES) record(label, schema)
  return shapes
}

describe('profiles derived from the R4B base schemas', () => {
  it.each(PROFILES)('gives %s the shape the guide states', (label, schema) => {
    expect(keysOf(schema)).toEqual(guide.profiles[label])
  })

  it('reaches exactly the shapes the guide reaches, at every depth', () => {
    // Compared as an object so a failure names the path and the differing keys rather than
    // reporting that two long lists are unequal.
    expect(collectShapes()).toEqual(guide.shapes)
  })

  it('covers every profile the guide publishes', () => {
    expect(PROFILES.map(([label]) => label).sort()).toEqual(
      Object.keys(guide.profiles).sort(),
    )
  })
})
