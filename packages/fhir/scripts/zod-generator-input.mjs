//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

const FHIR_NAME = /^[A-Za-z][A-Za-z0-9]*$/u
const ELEMENT_SEGMENT = /^[A-Za-z][A-Za-z0-9]*(?:\[x\])?$/u
const CARDINALITY = /^(?:0|[1-9]\d*)$/u
const FHIR_PATH_SYSTEM_TYPE =
  /^http:\/\/hl7\.org\/fhirpath\/System\.[A-Za-z][A-Za-z0-9]*$/u
const FHIR_REGEX_EXTENSION = 'http://hl7.org/fhir/StructureDefinition/regex'

// JavaScript receives FHIR JSON numbers after their lexical representation has been parsed.
// Keep the release pattern as an integrity assertion, then render the equivalent value-space
// constraint without copying package-owned text into generated TypeScript.
const NUMERIC_PRIMITIVE_REGEXES = new Map([
  ['decimal', '-?(0|[1-9][0-9]*)(\\.[0-9]+)?([eE][+-]?[0-9]+)?'],
  ['integer', '-?([0]|([1-9][0-9]*))'],
  ['positiveInt', '[1-9][0-9]*'],
  ['unsignedInt', '[0]|([1-9][0-9]*)'],
])

const RESERVED_WORDS = new Set([
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
])

const fail = (label, value, expectation) => {
  throw new Error(`${label} ${JSON.stringify(value)} ${expectation}.`)
}

/** A release-owned FHIR type name that is safe to derive TypeScript identifiers from. */
export function fhirTypeName(value, label = 'FHIR type name') {
  if (
    typeof value !== 'string' ||
    !FHIR_NAME.test(value) ||
    RESERVED_WORDS.has(value)
  ) {
    fail(label, value, 'must be a non-reserved ASCII FHIR name')
  }
  return value
}

const typeScriptIdentifier = (value, label) => {
  if (!FHIR_NAME.test(value) || RESERVED_WORDS.has(value)) {
    fail(label, value, 'must produce a non-reserved TypeScript identifier')
  }
  return value
}

/** The value-space identifier used for one generated structure schema. */
export const structureSchemaIdentifier = (name) => {
  const safe = fhirTypeName(name)
  return typeScriptIdentifier(
    `${safe.charAt(0).toLowerCase()}${safe.slice(1)}Schema`,
    `schema identifier derived from ${safe}`,
  )
}

/** The type-space alias used for one declaration imported from @types/fhir. */
export const fhirTypeAlias = (name) =>
  typeScriptIdentifier(
    `Fhir${fhirTypeName(name)}`,
    `type alias derived from ${String(name)}`,
  )

const pathSegments = (path, label = 'FHIR element path') => {
  if (typeof path !== 'string') {
    fail(label, path, 'must be a dotted FHIR path')
  }
  const segments = path.split('.')
  if (
    segments.length === 0 ||
    segments.some((segment) => !ELEMENT_SEGMENT.test(segment))
  ) {
    fail(label, path, 'must contain only ASCII FHIR path segments')
  }
  return segments
}

/** The value-space identifier used when a backbone path must be hoisted. */
export const pathSchemaIdentifier = (path) => {
  const parts = pathSegments(path).map((part) => part.replace('[x]', ''))
  return typeScriptIdentifier(
    `${parts[0].charAt(0).toLowerCase()}${parts[0].slice(1)}${parts
      .slice(1)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('')}Schema`,
    `schema identifier derived from ${path}`,
  )
}

/** Identifiers used by the closed dispatcher for an abstract resource type. */
export const resourceDispatchIdentifiers = (name) => {
  const safe = fhirTypeName(name)
  return {
    table: typeScriptIdentifier(
      `modelled${safe}s`,
      `dispatch table derived from ${safe}`,
    ),
    inFlight: typeScriptIdentifier(
      `dispatching${safe}`,
      `dispatch guard derived from ${safe}`,
    ),
  }
}

const cardinalityMaximum = (value, label) => {
  if (value === '*') return Number.POSITIVE_INFINITY
  if (typeof value !== 'string' || !CARDINALITY.test(value)) {
    fail(label, value, 'must be * or a canonical non-negative integer string')
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) {
    fail(label, value, 'must fit in a JavaScript safe integer')
  }
  return parsed
}

const finiteInteger = (value, label, { minimum } = {}) => {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    (minimum !== undefined && value < minimum)
  ) {
    fail(label, value, 'must be a finite safe integer')
  }
  return value
}

const registerIdentifier = (identifiers, identifier, origin) => {
  const previous = identifiers.get(identifier)
  if (previous !== undefined && previous !== origin) {
    throw new Error(
      `Generated TypeScript identifier ${identifier} collides for ${previous} and ${origin}.`,
    )
  }
  identifiers.set(identifier, origin)
}

const declaredBackboneName = (path) =>
  pathSegments(path)
    .map((part) => {
      const normalized = part.replace('[x]', '')
      return normalized.charAt(0).toUpperCase() + normalized.slice(1)
    })
    .join('')

const validateType = (type, label) => {
  if (typeof type !== 'object' || type === null || Array.isArray(type)) {
    fail(label, type, 'must be a FHIR element type object')
  }
  if (typeof type.code !== 'string') {
    fail(
      `${label}.code`,
      type.code,
      'must be a FHIR type name or FHIRPath system type',
    )
  }
  if (!FHIR_PATH_SYSTEM_TYPE.test(type.code)) {
    fhirTypeName(type.code, `${label}.code`)
  }
  for (const [index, extension] of (type.extension ?? []).entries()) {
    if (
      extension?.url?.endsWith('/structuredefinition-fhir-type') &&
      extension.valueUrl !== undefined
    ) {
      fhirTypeName(extension.valueUrl, `${label}.extension[${index}].valueUrl`)
    }
  }
}

const validateStructure = (
  mapName,
  key,
  structure,
  declaredTypes,
  identifiers,
) => {
  if (
    typeof structure !== 'object' ||
    structure === null ||
    Array.isArray(structure)
  ) {
    fail(
      `${mapName}[${String(key)}]`,
      structure,
      'must be a StructureDefinition object',
    )
  }
  const name = fhirTypeName(structure.name, `${mapName} structure.name`)
  if (key !== name) {
    throw new Error(
      `${mapName} key ${JSON.stringify(key)} must equal structure.name ${JSON.stringify(name)}.`,
    )
  }
  if (
    !['primitive-type', 'complex-type', 'resource', 'logical'].includes(
      structure.kind,
    )
  ) {
    fail(
      `${name}.kind`,
      structure.kind,
      'must be a supported StructureDefinition kind',
    )
  }
  registerIdentifier(
    identifiers,
    structureSchemaIdentifier(name),
    `structure ${name}`,
  )
  if (declaredTypes.has(name)) {
    registerIdentifier(identifiers, fhirTypeAlias(name), `FHIR type ${name}`)
  }
  if (structure.abstract === true && structure.kind === 'resource') {
    const dispatch = resourceDispatchIdentifiers(name)
    registerIdentifier(
      identifiers,
      dispatch.table,
      `dispatch table for ${name}`,
    )
    registerIdentifier(
      identifiers,
      dispatch.inFlight,
      `dispatch guard for ${name}`,
    )
  }

  const elements = structure.snapshot?.element
  if (!Array.isArray(elements) || elements.length === 0) {
    fail(`${name}.snapshot.element`, elements, 'must be a non-empty array')
  }
  const expectedNumericRegex = NUMERIC_PRIMITIVE_REGEXES.get(name)
  if (expectedNumericRegex !== undefined) {
    const valueElement = elements.find(
      (element) => element?.path === `${name}.value`,
    )
    const patterns = (valueElement?.type ?? []).flatMap((type) =>
      (type?.extension ?? [])
        .filter((extension) => extension?.url === FHIR_REGEX_EXTENSION)
        .map((extension) => extension.valueString),
    )
    if (patterns.length !== 1 || patterns[0] !== expectedNumericRegex) {
      fail(
        `${name}.value regex`,
        patterns,
        `must equal the expected ${name} lexical constraint`,
      )
    }
  }
  for (const [index, element] of elements.entries()) {
    const label = `${name}.snapshot.element[${index}]`
    if (
      typeof element !== 'object' ||
      element === null ||
      Array.isArray(element)
    ) {
      fail(label, element, 'must be an element object')
    }
    const segments = pathSegments(element.path, `${label}.path`)
    if (segments[0] !== name) {
      fail(`${label}.path`, element.path, `must be rooted at ${name}`)
    }
    const min = finiteInteger(element.min, `${label}.min`, { minimum: 0 })
    const max = cardinalityMaximum(element.max, `${label}.max`)
    if (max < min) {
      throw new Error(
        `${label} cardinality ${min}..${element.max} is inverted.`,
      )
    }
    for (const field of ['minValueInteger', 'maxValueInteger']) {
      if (element[field] !== undefined)
        finiteInteger(element[field], `${label}.${field}`)
    }
    for (const [typeIndex, type] of (element.type ?? []).entries()) {
      validateType(type, `${label}.type[${typeIndex}]`)
    }
    if (element.contentReference !== undefined) {
      if (
        typeof element.contentReference !== 'string' ||
        !element.contentReference.startsWith('#')
      ) {
        fail(
          `${label}.contentReference`,
          element.contentReference,
          'must be a local #path',
        )
      }
      const target = element.contentReference.slice(1)
      const targetSegments = pathSegments(target, `${label}.contentReference`)
      if (targetSegments[0] !== name) {
        fail(
          `${label}.contentReference`,
          element.contentReference,
          `must stay inside ${name}`,
        )
      }
      registerIdentifier(
        identifiers,
        pathSchemaIdentifier(target),
        `path ${target}`,
      )
    }
    const isBackbone = (element.type ?? []).some(({ code }) =>
      ['BackboneElement', 'Element'].includes(code),
    )
    if (isBackbone && declaredTypes.has(declaredBackboneName(element.path))) {
      registerIdentifier(
        identifiers,
        pathSchemaIdentifier(element.path),
        `path ${element.path}`,
      )
    }
  }
}

/**
 * Rejects a malformed or code-generating package AST before any release-owned string reaches a
 * TypeScript template. Rendering still quotes property/table keys; this gate protects the few
 * positions that must be identifiers and catches generator-name collisions deterministically.
 */
export function assertSafeGeneratorInput({
  structures,
  valueSets,
  codeSystems,
  declaredTypes,
}) {
  if (!(structures instanceof Map))
    fail('structures', structures, 'must be a Map')
  if (!(valueSets instanceof Map)) fail('valueSets', valueSets, 'must be a Map')
  if (!(codeSystems instanceof Map))
    fail('codeSystems', codeSystems, 'must be a Map')
  if (!(declaredTypes instanceof Set))
    fail('declaredTypes', declaredTypes, 'must be a Set')

  const identifiers = new Map()
  for (const name of declaredTypes) {
    const safe = fhirTypeName(name, 'declared FHIR type')
    registerIdentifier(identifiers, fhirTypeAlias(safe), `FHIR type ${safe}`)
  }
  for (const [key, structure] of structures) {
    validateStructure('structures', key, structure, declaredTypes, identifiers)
  }
  for (const [mapName, resources] of [
    ['valueSets', valueSets],
    ['codeSystems', codeSystems],
  ]) {
    for (const [key, resource] of resources) {
      if (typeof key !== 'string' || resource?.url !== key) {
        throw new Error(
          `${mapName} key ${JSON.stringify(key)} must equal its resource URL.`,
        )
      }
    }
  }
}
