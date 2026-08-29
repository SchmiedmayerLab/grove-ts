//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

/**
 * Generate Zod runtime schemas from a FHIR release's own StructureDefinitions.
 *
 * Nothing here is transcribed by hand. Cardinality, choice types, required-binding enumerations
 * and string primitive regexes come from the published definitions. Numeric primitive patterns
 * are checked at the package boundary and rendered as equivalent value-space constraints because
 * JSON parsing has already discarded their lexical form. A second release still costs one
 * argument rather than a second corpus.
 *
 * Usage:
 *   node scripts/generate-zod-schemas.mjs --release r4
 *   node scripts/generate-zod-schemas.mjs --release r4b --check
 */

import { createHash } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { format, resolveConfig } from 'prettier'
import { Buffer } from 'node:buffer'
import process, { argv, stdout } from 'node:process'
import {
  assertSafeGeneratorInput,
  fhirTypeAlias,
  pathSchemaIdentifier,
  resourceDispatchIdentifiers,
  structureSchemaIdentifier,
} from './zod-generator-input.mjs'

const { fetch } = globalThis

const HERE = dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = resolve(HERE, '..')
const CACHE_ROOT = resolve(PACKAGE_ROOT, '.fhir-cache')
const REGISTRY = 'https://packages2.fhir.org/packages'

export const EXAMPLE_PACKAGES = {
  r4: {
    packageId: 'hl7.fhir.r4.examples',
    version: '4.0.1',
    integrity:
      '301666e0cba6d960aa20abfdf95aea57a8c1c0b9365b704a80dee3394d238eedda50fcc3bddfe2446a8c7e282b90725f4039bd4adc75c20f29b7fbc140c3d43c',
  },
  r4b: {
    packageId: 'hl7.fhir.r4b.examples',
    version: '4.3.0',
    integrity:
      'de84af61ad4ca5aa6b983e306136c639f343077ca358b4bdd82ad0f0864c1b7695b2b13b413326ccdfb821947309813f1672ee23fbcc4433675b41ec1e3a1725',
  },
}

const RELEASES = {
  r4: {
    packageId: 'hl7.fhir.r4.core',
    version: '4.0.1',
    fhirVersion: '4.0.1',
    integrity:
      '0981e52db3ffd9fede2809059d63c67b2837e5c9d749e5e0f16229c1784f178001616a9af65c34572f2a74c5a287fe3b4f4801297447deb3dacb9ad48b81b584',
  },
  r4b: {
    packageId: 'hl7.fhir.r4b.core',
    version: '4.3.0',
    fhirVersion: '4.3.0',
    integrity:
      '943ac3376cd2fca94d75c26e43f2609c192723d180240b197517c3dcb757cc258c727a6f69cca7f82f7fc7540779e96d1a2eec17ff8048945b79315b01a16933',
  },
}

/**
 * The seed of the schema closure: every concrete resource the release publishes, plus the
 * datatypes Grove names directly.
 *
 * The package validates whole resources, not only the ones Grove itself builds: a resource
 * arrives contained, bundled, or referenced beside the ones that point at it, and a consumer
 * that meets it should get the same field-level checking as everything else. Seeding from the
 * release rather than from a hand-kept list means a resource cannot be missing because nobody
 * remembered to add it.
 */
const DATATYPE_ROOTS = [
  'Attachment',
  'CodeableConcept',
  'Coding',
  'Extension',
  'Identifier',
  'Period',
  'Quantity',
  'Reference',
  'SampledData',
]

/** Every concrete resource the release publishes. */
const resourceRoots = (structures) =>
  [...structures.values()]
    .filter(
      (structure) =>
        structure.kind === 'resource' &&
        structure.abstract !== true &&
        structure.name !== 'Resource',
    )
    .map((structure) => structure.name)

/** Downloads and unpacks a FHIR core package once, then reuses it. */
export async function fhirPackage({ packageId, version, integrity }) {
  const target = join(CACHE_ROOT, `${packageId}#${version}`)
  const packageDirectory = join(target, 'package')
  const archivePath = join(target, 'package.tgz')
  const markerPath = join(target, '.integrity')
  const markerValue = `${JSON.stringify({ packageId, version, integrity })}\n`
  const digestMatches = (bytes) =>
    integrity === undefined ||
    createHash('sha512').update(bytes).digest('hex') === integrity
  const cachedArchive = await readFile(archivePath).catch(() => undefined)
  const cachedMarker = await readFile(markerPath, 'utf8').catch(() => undefined)
  const cachedMetadata = await readFile(
    join(packageDirectory, 'package.json'),
    'utf8',
  )
    .then((value) => JSON.parse(value))
    .catch(() => undefined)
  if (
    cachedArchive !== undefined &&
    digestMatches(cachedArchive) &&
    cachedMarker === markerValue &&
    cachedMetadata?.name === packageId &&
    cachedMetadata.version === version
  ) {
    return packageDirectory
  }

  let bytes =
    cachedArchive !== undefined && digestMatches(cachedArchive) ?
      cachedArchive
    : undefined
  if (bytes === undefined) {
    const url = `${REGISTRY}/${packageId}/${version}`
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Could not fetch ${url}: ${response.status}`)
    }
    bytes = Buffer.from(await response.arrayBuffer())
  }
  // A registry tarball is mutable in principle; the digest pins what this generator was built
  // against, so a substituted archive fails the build rather than silently changing the output.
  const digest = createHash('sha512').update(bytes).digest('hex')
  if (integrity !== undefined && digest !== integrity) {
    throw new Error(
      `${packageId}#${version} does not match its pinned digest.\n  expected ${integrity}\n  actual   ${digest}`,
    )
  }

  await mkdir(CACHE_ROOT, { recursive: true })
  const staging = await mkdtemp(join(CACHE_ROOT, '.package-fetch-'))
  try {
    const stagedArchive = join(staging, 'package.tgz')
    await writeFile(stagedArchive, bytes)
    const result = spawnSync(
      'tar',
      [
        'xzf',
        stagedArchive,
        '--no-same-owner',
        '--no-same-permissions',
        '-C',
        staging,
      ],
      { stdio: 'inherit' },
    )
    if (result.status !== 0) {
      throw new Error(`Could not unpack ${packageId}#${version}.`)
    }
    const metadata = JSON.parse(
      await readFile(join(staging, 'package/package.json'), 'utf8'),
    )
    if (metadata.name !== packageId || metadata.version !== version) {
      throw new Error(
        `FHIR package metadata does not match ${packageId}#${version}.`,
      )
    }
    await writeFile(join(staging, '.integrity'), markerValue)
    await rm(target, { recursive: true, force: true })
    await rename(staging, target)
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    throw error
  }
  return packageDirectory
}

/** Every StructureDefinition and ValueSet the release publishes, keyed by name/url. */
async function loadDefinitions(packageDir) {
  const structures = new Map()
  const valueSets = new Map()
  const codeSystems = new Map()
  for (const entry of await readdir(packageDir)) {
    if (!entry.endsWith('.json')) continue
    if (!/^(StructureDefinition|ValueSet|CodeSystem)-/.test(entry)) continue
    let resource
    try {
      resource = JSON.parse(await readFile(join(packageDir, entry), 'utf8'))
    } catch (error) {
      throw new Error(
        `Could not parse pinned FHIR package resource ${entry}.`,
        {
          cause: error,
        },
      )
    }
    if (resource.resourceType === 'StructureDefinition') {
      if (resource.derivation === 'constraint') continue
      structures.set(resource.name, resource)
    } else if (resource.resourceType === 'ValueSet')
      valueSets.set(resource.url, resource)
    else if (resource.resourceType === 'CodeSystem')
      codeSystems.set(resource.url, resource)
  }
  return { structures, valueSets, codeSystems }
}

/**
 * Translate an XML Schema regex into JavaScript's dialect.
 *
 * FHIR publishes its primitive patterns as XSD regexes, where `\s` is exactly `[ \t\n\r]`.
 * JavaScript's `\s` also matches vertical tab, form feed and the Unicode space separators, so
 * its `\S` wrongly excludes characters XSD counts as non-space — U+00A0 among them, which the
 * published examples use in narrative text. Position matters: inside a character class the two
 * expand to members, outside it to a class of their own.
 */
const XSD_SPACE = ' \\t\\n\\r'
/** The characters JavaScript calls space and XSD does not, so an XSD `\S` still admits them. */
const XSD_NON_SPACE_EXTRA =
  '\\v\\f\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff'

function xsdRegexToJs(regex) {
  let out = ''
  let index = 0
  while (index < regex.length) {
    const character = regex[index]
    if (character === '\\') {
      const next = regex[index + 1]
      if (next === 's') out += `[${XSD_SPACE}]`
      else if (next === 'S') out += `[^${XSD_SPACE}]`
      else out += character + (next ?? '')
      index += 2
      continue
    }
    if (character !== '[') {
      out += character
      index += 1
      continue
    }
    // A character class: JavaScript cannot nest one, so `\s` and `\S` are rewritten to members.
    let close = index + 1
    if (regex[close] === '^') close += 1
    if (regex[close] === ']') close += 1
    while (close < regex.length && regex[close] !== ']') {
      close += regex[close] === '\\' ? 2 : 1
    }
    const body = regex.slice(index + 1, close)
    out += renderClass(body)
    index = close + 1
  }
  return out
}

/** One XSD character class as its JavaScript equivalent, brackets included. */
function renderClass(body) {
  const negated = body.startsWith('^')
  const members = negated ? body.slice(1) : body
  const hasNonSpace = /\\S/u.test(members)
  const listsEveryXsdSpace = [' ', '\\t', '\\n', '\\r'].every((space) =>
    members.includes(space),
  )
  // XSD `\S` is every character except space, tab, newline and return. A class that also lists
  // all four therefore matches everything, and saying so plainly beats a union that repeats
  // itself — which is what FHIR's `string` and `markdown` patterns are.
  if (!negated && hasNonSpace && listsEveryXsdSpace) return '[\\s\\S]'
  const rendered = members
    .replaceAll('\\S', `\\S${XSD_NON_SPACE_EXTRA}`)
    .replaceAll('\\s', XSD_SPACE)
  return `[${negated ? '^' : ''}${rendered}]`
}

/** The regex a primitive constrains its lexical form with, as the release publishes it. */
function primitiveRegex(structure) {
  const value = (structure.snapshot?.element ?? []).find(
    (element) => element.path === `${structure.name}.value`,
  )
  for (const type of value?.type ?? []) {
    for (const extension of type.extension ?? []) {
      if (extension.url?.endsWith('/regex')) return extension.valueString
    }
  }
  return undefined
}

/** The numeric range a primitive states, or inherits from the type it specialises. */
function numericBounds(structure, { structures }) {
  const valueOf = (candidate) =>
    (candidate?.snapshot?.element ?? []).find(
      (element) => element.path === `${candidate.name}.value`,
    )
  const own = valueOf(structure)
  const baseName = (structure.baseDefinition ?? '').split('/').pop()
  const base = baseName ? valueOf(structures.get(baseName)) : undefined
  return {
    min: own?.minValueInteger ?? base?.minValueInteger,
    max: own?.maxValueInteger ?? base?.maxValueInteger,
  }
}

/** The codes a required binding admits, when the release can enumerate them offline. */
function requiredCodes(element, { valueSets, codeSystems }) {
  if (element.binding?.strength !== 'required') return undefined
  const url = (element.binding.valueSet ?? '').split('|')[0]
  const valueSet = valueSets.get(url)
  if (!valueSet) return undefined
  const codes = new Set()
  // An exclusion would make the enumeration wrong rather than merely incomplete.
  if (valueSet.compose?.exclude !== undefined) return undefined
  for (const include of valueSet.compose?.include ?? []) {
    if (include.filter || include.valueSet) return undefined
    if (include.concept) {
      for (const concept of include.concept) codes.add(concept.code)
      continue
    }
    const system = codeSystems.get(include.system)
    if (!system || system.content !== 'complete') return undefined
    const walk = (concepts) => {
      for (const concept of concepts ?? []) {
        codes.add(concept.code)
        walk(concept.concept)
      }
    }
    walk(system.concept)
  }
  return codes.size > 0 ? [...codes].sort() : undefined
}

/** The direct children of a path in the snapshot. */
function childrenOf(elements, path) {
  return elements.filter(
    (element) =>
      element.path.startsWith(`${path}.`) &&
      !element.path.slice(path.length + 1).includes('.'),
  )
}

const schemaName = structureSchemaIdentifier

/** The bounds a repeating element states, so a 1..* element cannot be satisfied by `[]`. */
function arrayBounds(element) {
  // FHIR JSON arrays are omitted when absent and SHALL never be serialized empty.
  let rendered = `.array().min(${Math.max(1, element.min)})`
  const max = Number(element.max)
  if (Number.isFinite(max) && max > 1) rendered += `.max(${max})`
  return rendered
}

/** Renders the Zod expression for one element, honouring cardinality and choice types. */
function renderElement(element, context, emit) {
  const { structures } = context
  const types = element.type ?? []
  if (types.length === 0) {
    if (!element.contentReference) return undefined
    const target = element.contentReference.replace('#', '')
    if (!target.startsWith(`${element.path.split('.')[0]}.`)) {
      throw new Error(
        `${element.path}: contentReference ${element.contentReference} points outside this ` +
          'structure, which the generator does not resolve.',
      )
    }
    const optional = element.min === 0
    const isArray = element.max === '*' || Number(element.max) > 1
    let expression = `z.lazy(() => ${emit.reference(target)})`
    if (isArray) expression = `${expression}${arrayBounds(element)}`
    if (optional) expression = `${expression}.optional()`
    return { expression }
  }

  const isChoice = element.path.endsWith('[x]')
  const optional = element.min === 0
  const isArray = element.max === '*' || Number(element.max) > 1

  let sawPrimitive = false
  const single = (typeCode, type) => {
    if (typeCode === 'BackboneElement' || typeCode === 'Element') {
      return emit.backbone(element)
    }
    // Elements like Resource.id are typed as FHIRPath system types; the release names the FHIR
    // primitive they stand for in an extension, so the constraint is not lost.
    if (typeCode.startsWith('http://hl7.org/fhirpath/System')) {
      const named = (type?.extension ?? []).find((extension) =>
        extension.url?.endsWith('/structuredefinition-fhir-type'),
      )?.valueUrl
      if (!named) return 'z.string()'
      // Element.id claims the `id` type, but every StructureDefinition the specification
      // publishes gives its elements ids like `DataRequirement.subject[x]` and `Foo.bar:slice`,
      // which that pattern forbids. Reading it strictly would reject FHIR's own artifacts, so
      // an element id stays a plain string; Resource.id, which the rule actually describes,
      // keeps the constraint.
      if (
        named === 'id' &&
        element.path?.endsWith('.id') &&
        !isResourceId(element)
      ) {
        return 'z.string()'
      }
      sawPrimitive = true
      return emit.primitive(named)
    }
    const structure = structures.get(typeCode)
    if (structure && structure.kind === 'primitive-type') {
      sawPrimitive = true
      return emit.primitive(typeCode)
    }
    if (structure?.abstract === true && structure.kind === 'resource') {
      // Any resource may appear here, so the slot dispatches on resourceType to the schema for
      // that type. The dispatcher is emitted once, after the closure is known, and reached
      // through z.lazy because a resource may carry a Bundle that carries it again.
      context.abstractResources.add(typeCode)
      return `z.lazy(() => ${schemaName(typeCode)})`
    }
    if (
      structure &&
      (structure.kind === 'complex-type' || structure.kind === 'resource')
    ) {
      emit.require(typeCode)
      return `z.lazy(() => ${schemaName(typeCode)})`
    }
    // Nothing here should be reachable for the configured roots. Failing loudly is the point:
    // a silent z.unknown() is how an element stops being validated without anyone noticing.
    throw new Error(
      `${element.path}: the release models no structure for type ${typeCode}. Add it to the ` +
        'generator rather than emitting an unvalidated element.',
    )
  }

  if (isChoice) {
    // value[x] expands to one concrete property per admitted type; the object requires that at
    // most one is present, which is what the specification means by a choice.
    const base = element.path.split('.').pop().replace('[x]', '')
    return {
      choice: types.map((type) => {
        sawPrimitive = false
        const expression = single(type.code, type)
        return {
          name: `${base}${type.code.charAt(0).toUpperCase()}${type.code.slice(1)}`,
          expression,
          primitiveSibling: sawPrimitive,
        }
      }),
      optional,
    }
  }

  // A binding may sit on a Coding, CodeableConcept or Quantity as well as on a primitive, and
  // there it constrains a code *inside* the datatype rather than replacing it: rendering those
  // as a bare enum would reject the very object the element is declared to carry.
  const BINDABLE_PRIMITIVES = new Set(['code', 'string', 'uri'])
  const codes =
    BINDABLE_PRIMITIVES.has(types[0].code) ?
      requiredCodes(element, context)
    : undefined
  let expression
  if (codes) {
    // A bound code is still a primitive, so it keeps its right to carry an extension sibling.
    sawPrimitive = true
    expression = `z.enum([${codes.map((code) => JSON.stringify(code)).join(', ')}])`
  } else {
    expression = single(types[0].code, types[0])
  }
  if (isArray && sawPrimitive) expression = `${expression}.nullable()`
  if (isArray) expression = `${expression}${arrayBounds(element)}`
  // A primitive may exist through its `_shadow` Element alone (for example a
  // data-absent-reason extension). Object-level refinements enforce min cardinality across the
  // value and shadow together, so the value property itself must remain optional.
  if (optional || sawPrimitive) expression = `${expression}.optional()`
  return {
    expression,
    primitiveSibling: sawPrimitive,
    siblingIsArray: isArray,
  }
}

/** True when this `.id` is a resource's own id rather than one on a nested element. */
const isResourceId = (element) =>
  (element.base?.path ?? element.path ?? '') === 'Resource.id'

/** FHIRPath invariants implemented structurally, keyed by the constraint the release states. */
const IMPLEMENTED_CONSTRAINTS = {
  'ext-1': (schema) =>
    `${schema}.refine(\n` +
    `    (value) =>\n` +
    `      ((value as { extension?: unknown[] }).extension?.length ?? 0) > 0 !==\n` +
    `      Object.keys(value as object).some(\n` +
    `        // A primitive sibling means the value element exists carrying only extensions,\n` +
    `        // which ext-1 counts as the value being present.\n` +
    `        (key) => key.startsWith('value') || key.startsWith('_value'),\n` +
    `      ),\n` +
    `    { message: 'ext-1: an extension has either extensions or a value, never both.' },\n` +
    `  )`,
  'obs-6': (schema) =>
    `${schema}.refine(\n` +
    `    (value) => {\n` +
    `      const observation = value as Record<string, unknown>\n` +
    `      const hasValue = Object.keys(observation).some(\n` +
    `        (key) => (key.startsWith('value') || key.startsWith('_value')) && observation[key] !== undefined,\n` +
    `      )\n` +
    `      return observation.dataAbsentReason === undefined || !hasValue\n` +
    `    },\n` +
    `    { message: 'obs-6: dataAbsentReason is present only when no value is.' },\n` +
    `  )`,
  'obs-3': (schema) =>
    `${schema}.refine(\n` +
    `    (value) => {\n` +
    `      const range = value as { low?: unknown; high?: unknown; text?: unknown; _text?: unknown }\n` +
    `      return range.low !== undefined || range.high !== undefined || range.text !== undefined || range._text !== undefined\n` +
    `    },\n` +
    `    { message: 'obs-3: a reference range states a low, a high, or text.' },\n` +
    `  )`,
  'per-1': (schema) =>
    `${schema}.refine(\n` +
    `    (value) => {\n` +
    `      const period = value as { start?: string; end?: string }\n` +
    `      if (period.start === undefined || period.end === undefined) return true\n` +
    `      const ordering = compareFhirDateTimes(period.start, period.end)\n` +
    `      // A malformed endpoint is a malformed date, not an ordering fault; the release says\n` +
    `      // as much with start.hasValue(). Reporting both would name the wrong problem.\n` +
    `      if (ordering === undefined) return true\n` +
    `      return ordering <= 0\n` +
    `    },\n` +
    `    { message: 'Period.start must not be later than Period.end.' },\n` +
    `  )`,
  'ref-1': (schema) =>
    `${schema}.refine(\n` +
    `    (value) => {\n` +
    `      const reference = value as Record<string, unknown>\n` +
    `      return ['reference', '_reference', 'identifier', 'display', '_display'].some(\n` +
    `        (name) => reference[name] !== undefined,\n` +
    `      )\n` +
    `    },\n` +
    `    { message: 'ref-1: a Reference states a literal reference, identifier, or display.' },\n` +
    `  )`,
  'qty-3': (schema) =>
    `${schema}.refine(\n` +
    `    (value) => {\n` +
    `      const quantity = value as Record<string, unknown>\n` +
    `      const hasCode = quantity.code !== undefined || quantity._code !== undefined\n` +
    `      return !hasCode || quantity.system !== undefined || quantity._system !== undefined\n` +
    `    },\n` +
    `    { message: 'qty-3: a coded Quantity requires its unit system.' },\n` +
    `  )`,
}

/** At most one choice alternative may be present; a primitive value/shadow pair is one choice. */
function choiceRefinement(groups) {
  if (groups.length === 0) return ''
  const rendered = groups
    .map(
      (group) =>
        `{ alternatives: [${group.alternatives
          .map(
            (alternative) =>
              `[${alternative.map((name) => JSON.stringify(name)).join(', ')}]`,
          )
          .join(', ')}], required: ${group.required} }`,
    )
    .join(', ')
  return (
    `.refine(\n` +
    `    (value) =>\n` +
    `      [${rendered}].every((group) => {\n` +
    `        const present = group.alternatives.filter((alternative) =>\n` +
    `          alternative.some(\n` +
    `            (name) => (value as Record<string, unknown>)[name] !== undefined,\n` +
    `          ),\n` +
    `        ).length\n` +
    `        return group.required ? present === 1 : present <= 1\n` +
    `      }),\n` +
    `    {\n` +
    `      message:\n` +
    `        'A choice element carries exactly one alternative when required, and at most one otherwise.',\n` +
    `    },\n` +
    `  )`
  )
}

/** Positional rules for repeating primitive value and `_shadow` arrays in FHIR JSON. */
function primitiveArrayRefinement(groups) {
  if (groups.length === 0) return ''
  const rendered = groups
    .map(
      ({ name, required }) =>
        `{ name: ${JSON.stringify(name)}, shadow: ${JSON.stringify(`_${name}`)}, required: ${required} }`,
    )
    .join(', ')
  return (
    `.superRefine((value, context) => {\n` +
    `    for (const group of [${rendered}]) {\n` +
    `      const record = value as Record<string, unknown>\n` +
    `      const values = record[group.name] as unknown[] | undefined\n` +
    `      const shadows = record[group.shadow] as unknown[] | undefined\n` +
    `      if (group.required && values === undefined && shadows === undefined) {\n` +
    `        context.addIssue({ code: 'custom', path: [group.name], message: 'A required repeating primitive needs values or primitive metadata.' })\n` +
    `        continue\n` +
    `      }\n` +
    `      if (values !== undefined && shadows !== undefined && values.length !== shadows.length) {\n` +
    `        context.addIssue({ code: 'custom', path: [group.shadow], message: 'FHIR primitive value and metadata arrays must have equal length.' })\n` +
    `        continue\n` +
    `      }\n` +
    `      const length = values?.length ?? shadows?.length ?? 0\n` +
    `      for (let index = 0; index < length; index += 1) {\n` +
    `        if ((values?.[index] ?? null) === null && (shadows?.[index] ?? null) === null) {\n` +
    `          context.addIssue({ code: 'custom', path: [group.name, index], message: 'A repeating primitive slot needs a value or primitive metadata.' })\n` +
    `        }\n` +
    `      }\n` +
    `    }\n` +
    `  })`
  )
}

/** Required singular primitives may be represented by their `_shadow` Element alone. */
function primitiveScalarRefinement(groups) {
  const required = groups.filter((group) => group.required)
  if (required.length === 0) return ''
  const rendered = required
    .map(
      ({ name }) =>
        `{ name: ${JSON.stringify(name)}, shadow: ${JSON.stringify(`_${name}`)} }`,
    )
    .join(', ')
  return (
    `.superRefine((value, context) => {\n` +
    `    const record = value as Record<string, unknown>\n` +
    `    for (const group of [${rendered}]) {\n` +
    `      if (record[group.name] === undefined && record[group.shadow] === undefined) {\n` +
    `        context.addIssue({ code: 'custom', path: [group.name], message: 'A required primitive needs a value or primitive metadata.' })\n` +
    `      }\n` +
    `    }\n` +
    `  })`
  )
}

const elementContentRefinement = () =>
  `.refine(\n` +
  `    (value) => Object.keys(value as object).some((key) => key !== 'id'),\n` +
  `    { message: 'ele-1: an element must have a value or children beyond id.' },\n` +
  `  )`

const objectRefinements = ({ choices, primitiveArrays, primitiveScalars }) =>
  `${choiceRefinement(choices)}${primitiveScalarRefinement(primitiveScalars)}${primitiveArrayRefinement(primitiveArrays)}${elementContentRefinement()}`

const newObjectRefinements = () => ({
  choices: [],
  emittedPaths: [],
  primitiveArrays: [],
  primitiveScalars: [],
})

/**
 * The constraints that apply to an object, as the release states applicability.
 *
 * A constraint is declared once on the element that owns it, and every element it governs names
 * it in `condition`. Reading both means a rule stated at the resource root still reaches the
 * backbone it actually constrains — Observation.component.dataAbsentReason names obs-6 that way.
 *
 * This is sound only for a constraint whose expression is relative to the object it lands on.
 * Every entry in IMPLEMENTED_CONSTRAINTS satisfies that; a constraint that navigates from an
 * ancestor must not be added here without restricting it to its declaring path.
 */
const SKIPPED_CONSTRAINTS = new Map()

/** Generic constraints every element carries; not a gap worth reporting. */
const UNIVERSAL_CONSTRAINTS = new Set(['ele-1'])

/**
 * Records every constraint a structure states that this module does not check.
 *
 * Swept over all of a structure's elements, not just the object paths: a constraint declared on
 * a leaf — `txt-1` and `txt-2` on `Narrative.div` — governs that element and belongs in the gap
 * report even though no object path declares it.
 */
function recordSkippedConstraints(elements) {
  for (const element of elements) {
    for (const constraint of element.constraint ?? []) {
      const key = constraint.key
      if (key in IMPLEMENTED_CONSTRAINTS || UNIVERSAL_CONSTRAINTS.has(key))
        continue
      const seen = SKIPPED_CONSTRAINTS.get(element.path) ?? new Set()
      seen.add(key)
      SKIPPED_CONSTRAINTS.set(element.path, seen)
    }
  }
}

/**
 * The constraints that apply to an object, as the release states applicability.
 *
 * A constraint is declared once on the element that owns it, and every element it governs names
 * it in `condition`. Reading both means a rule stated at the resource root still reaches the
 * backbone it actually constrains — Observation.component.dataAbsentReason names obs-6 that way.
 *
 * Sound only for a constraint whose expression is relative to the object it lands on. Exactly
 * one such landing exists today, and it is asserted below rather than left to a comment.
 */
const CONDITION_LANDINGS = new Set(['Observation.component::obs-6'])

function applicableConstraints(elements, path) {
  const own = (
    elements.find((element) => element.path === path)?.constraint ?? []
  ).map((constraint) => constraint.key)
  const referenced = childrenOf(elements, path).flatMap(
    (child) => child.condition ?? [],
  )
  for (const key of referenced) {
    if (own.includes(key) || !(key in IMPLEMENTED_CONSTRAINTS)) continue
    if (!CONDITION_LANDINGS.has(`${path}::${key}`)) {
      throw new Error(
        `${path}: ${key} lands here only through a child's condition, and its expression was ` +
          'written against the element that declares it. Add it to CONDITION_LANDINGS only ' +
          'after confirming the expression is relative to this object.',
      )
    }
  }
  return [...new Set([...own, ...referenced])].filter(
    (key) => key in IMPLEMENTED_CONSTRAINTS,
  )
}

/**
 * Fails generation when a structure's snapshot names an element the output does not.
 *
 * The type annotations cannot catch this: a schema that drops an *optional* property still
 * satisfies the release's declared type in both directions. This is release-derived and
 * involves no type system, and it is what would have caught `id` being dropped from every
 * backbone while every test stayed green.
 */
function assertEveryElementEmitted(root, elements, emittedPaths) {
  const emitted = new Set(emittedPaths)
  const missing = childrenOf(elements, root)
    .map(({ path }) => path)
    .filter((path) => !emitted.has(path))
  if (missing.length > 0) {
    throw new Error(
      `${root}: the release names elements the generated schema does not emit: ` +
        missing.join(', '),
    )
  }
}

/** Emits one structure — a primitive, complex type, or resource — as a Zod schema. */
function renderStructure(structure, context, pending) {
  const elements = structure.snapshot?.element ?? []
  const root = structure.name

  if (structure.kind === 'primitive-type') {
    const regex = primitiveRegex(structure)
    const bounds = numericBounds(structure, context)
    const base =
      ['boolean'].includes(root) ? 'z.boolean()'
      : ['integer', 'positiveInt', 'unsignedInt'].includes(root) ?
        'z.number().int()'
      : root === 'decimal' ? 'z.number()'
      : 'z.string()'
    let constrained = base
    if (root === 'base64Binary') {
      // The published pattern, `(\s*([0-9a-zA-Z+/=]){4}\s*)+`, nests a quantifier inside a
      // quantifier. On a multi-megabyte attachment that backtracks until the stack gives out, and
      // FHIR ships such an attachment in its own examples. The language it describes is exactly
      // "base64 characters and whitespace, a multiple of four characters once whitespace is
      // removed", which decides in one linear pass.
      constrained =
        `${base}.regex(new RegExp(${JSON.stringify(`^[0-9a-zA-Z+/=${XSD_SPACE}]*$`)}), 'Expected a FHIR base64Binary.')` +
        `.refine(\n` +
        `    (value) => {\n` +
        `      const length = value.replace(/[${XSD_SPACE}]/gu, '').length\n` +
        `      return length > 0 && length % 4 === 0\n` +
        `    },\n` +
        `    { message: 'Expected a FHIR base64Binary.' },\n` +
        `  )`
    } else if (regex && base === 'z.string()') {
      constrained = `${base}.regex(new RegExp(${JSON.stringify(`^(?:${xsdRegexToJs(regex)})$`)}), ${JSON.stringify(`Expected a FHIR ${root}.`)})`
    } else if (base.startsWith('z.number()')) {
      if (bounds.min !== undefined)
        constrained = `${constrained}.min(${bounds.min})`
      if (bounds.max !== undefined)
        constrained = `${constrained}.max(${bounds.max})`
      if (root === 'positiveInt') constrained = `${constrained}.positive()`
      if (root === 'unsignedInt') constrained = `${constrained}.nonnegative()`
    }
    if (['date', 'dateTime', 'instant'].includes(root)) {
      constrained = `${constrained}.refine(hasValidFhirCalendarDate, { message: ${JSON.stringify(`Expected a real Gregorian calendar date for FHIR ${root}.`)} })`
    }
    if (['canonical', 'uri', 'url', 'xhtml'].includes(root)) {
      constrained = `${constrained}.min(1)`
    }
    const output =
      base === 'z.boolean()' ? 'boolean'
      : base.startsWith('z.number()') ? 'number'
      : 'string'
    return `export const ${schemaName(root)}: z.ZodType<${output}> = ${constrained}\n`
  }

  // A backbone another element points at by contentReference is hoisted to its own schema:
  // inlining a self-referential one would not terminate.
  const hoisted = new Map()
  const lines = []
  const emit = {
    require: (name) => pending.add(name),
    reference: (path) => {
      hoisted.set(path, pathSchemaIdentifier(path))
      return pathSchemaIdentifier(path)
    },
    primitive: (name) => {
      pending.add(name)
      return schemaName(name)
    },
    backbone: (element) => {
      const declared = element.path
        .split('.')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('')
      if (context.declaredTypes.has(declared)) {
        hoisted.set(element.path, pathSchemaIdentifier(element.path))
        return pathSchemaIdentifier(element.path)
      }
      // Anything the release does not name stays inline: giving it a name would invent a type
      // the specification does not publish. The same emitter is used so a deeper backbone is
      // validated rather than falling back to an open record.
      const nestedRefinements = newObjectRefinements()
      const nested = renderProperties(
        element.path,
        elements,
        context,
        pending,
        emit,
        nestedRefinements,
      )
      assertEveryElementEmitted(
        element.path,
        elements,
        nestedRefinements.emittedPaths,
      )
      return `z.strictObject({\n${nested}\n  })${objectRefinements(nestedRefinements)}`
    },
  }

  recordSkippedConstraints(elements)
  const rootRefinements = newObjectRefinements()
  const body = renderProperties(
    root,
    elements,
    context,
    pending,
    emit,
    rootRefinements,
  )
  const rootConstraints = applicableConstraints(elements, root)
  // Rendering a backbone can discover further ones, so drain until the set stops growing.
  const emitted = new Set()
  while ([...hoisted.keys()].some((path) => !emitted.has(path))) {
    for (const [path, name] of [...hoisted]) {
      if (emitted.has(path)) continue
      emitted.add(path)
      const nestedRefinements = newObjectRefinements()
      const nested = renderProperties(
        path,
        elements,
        context,
        pending,
        emit,
        nestedRefinements,
      )
      const declared = path
        .split('.')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('')
      const nestedAnnotation =
        context.declaredTypes.has(declared) ?
          `z.ZodType<FhirJson<${fhirTypeAlias(declared)}>>`
        : 'z.ZodTypeAny'
      if (context.declaredTypes.has(declared)) context.usedTypes.add(declared)
      // A hoisted backbone carries its own choices and its own constraints; applying them only
      // at the resource root would leave the named type weaker than the inline form.
      const nestedConstraints = applicableConstraints(elements, path)
      let nestedClosing = `  })${objectRefinements(nestedRefinements)}`
      for (const key of nestedConstraints) {
        nestedClosing = IMPLEMENTED_CONSTRAINTS[key](nestedClosing)
      }
      lines.push(`export const ${name}: ${nestedAnnotation} = z.lazy(() =>`)
      lines.push(`  z.strictObject({`)
      lines.push(nested)
      lines.push(`${nestedClosing},`)
      lines.push(`) as unknown as ${nestedAnnotation}`)
      lines.push('')
      assertEveryElementEmitted(path, elements, nestedRefinements.emittedPaths)
    }
  }
  const annotation =
    context.declaredTypes.has(root) ?
      `z.ZodType<FhirJson<${fhirTypeAlias(root)}>>`
    : 'z.ZodTypeAny'
  if (context.declaredTypes.has(root)) context.usedTypes.add(root)
  lines.push(`export const ${schemaName(root)}: ${annotation} = z.lazy(() =>`)
  lines.push(`  z.strictObject({`)
  if (structure.kind === 'resource') {
    lines.push(`    resourceType: z.literal(${JSON.stringify(root)}),`)
  }
  lines.push(body)
  let closing = `  })${objectRefinements(rootRefinements)}`
  for (const key of rootConstraints) {
    closing = IMPLEMENTED_CONSTRAINTS[key](closing)
  }
  lines.push(`${closing},`)
  lines.push(`) as unknown as ${annotation}`)
  const rendered = lines.join('\n') + '\n'
  assertEveryElementEmitted(root, elements, rootRefinements.emittedPaths)
  return rendered
}

/** Renders every direct child of a path as object properties. */
function renderProperties(path, elements, context, pending, emit, collector) {
  const localEmit = emit ?? {
    require: (name) => pending.add(name),
    primitive: (name) => {
      pending.add(name)
      return schemaName(name)
    },
    backbone: () => 'z.record(z.string(), z.unknown())',
  }
  const rows = []
  const choiceGroups = []
  const primitiveArrayGroups = []
  const primitiveScalarGroups = []
  for (const child of childrenOf(elements, path)) {
    const name = child.path.slice(path.length + 1)
    const rendered = renderElement(child, context, localEmit)
    if (!rendered) continue
    collector?.emittedPaths.push(child.path)
    if (rendered.choice) {
      choiceGroups.push({
        alternatives: rendered.choice.map((option) => [
          option.name,
          ...(option.primitiveSibling ? [`_${option.name}`] : []),
        ]),
        required: rendered.optional === false,
      })
      for (const option of rendered.choice) {
        rows.push(
          `    ${JSON.stringify(option.name)}: ${option.expression}.optional(),`,
        )
        if (
          option.primitiveSibling &&
          !(child.representation ?? []).includes('xmlAttr')
        ) {
          pending.add('Element')
          rows.push(
            `    ${JSON.stringify(`_${option.name}`)}: z.lazy(() => ${schemaName('Element')}).optional(),`,
          )
        }
      }
      continue
    }
    rows.push(`    ${JSON.stringify(name)}: ${rendered.expression},`)
    if (
      rendered.primitiveSibling &&
      !(child.representation ?? []).includes('xmlAttr')
    ) {
      pending.add('Element')
      const sibling =
        rendered.siblingIsArray ?
          `z.lazy(() => ${schemaName('Element')}).nullable()${arrayBounds(child)}`
        : `z.lazy(() => ${schemaName('Element')})`
      rows.push(`    ${JSON.stringify(`_${name}`)}: ${sibling}.optional(),`)
      if (rendered.siblingIsArray) {
        primitiveArrayGroups.push({ name, required: child.min > 0 })
      } else {
        primitiveScalarGroups.push({ name, required: child.min > 0 })
      }
    }
  }
  if (collector) {
    collector.choices.push(...choiceGroups)
    collector.primitiveArrays.push(...primitiveArrayGroups)
    collector.primitiveScalars.push(...primitiveScalarGroups)
  }
  return rows.join('\n')
}

/** Whether a resource specialises an abstract one, following the release's own base chain. */
function specialises(name, ancestor, structures) {
  let current = structures.get(name)
  while (current !== undefined) {
    const baseName = (current.baseDefinition ?? '').split('/').pop()
    if (!baseName) return false
    if (baseName === ancestor) return true
    current = structures.get(baseName)
  }
  return false
}

/**
 * Emits the schema an abstract resource slot resolves to.
 *
 * `Bundle.entry.resource`, `Bundle.entry.response.outcome` and every `contained` array admit any
 * resource, which is not the same as admitting any object. The slot discriminates on the
 * `resourceType` every resource carries and validates against the schema for that type. An
 * unknown resource type is not part of the pinned FHIR release and therefore fails closed.
 *
 * Dispatching rather than unioning is what keeps the recursion finite: a resource may carry a
 * Bundle that carries it again, and the members are read at parse time from a table rather than
 * expanded into the type of every slot that admits a resource.
 */
function renderResourceDispatch(typeCode, members, context) {
  const { table, inFlight } = resourceDispatchIdentifiers(typeCode)
  const output =
    context.declaredTypes.has(typeCode) ?
      `FhirJson<${fhirTypeAlias(typeCode)}>`
    : '{ resourceType: string }'
  if (context.declaredTypes.has(typeCode)) context.usedTypes.add(typeCode)
  const annotation = `z.ZodType<${output}>`
  return (
    `const ${table}: Readonly<Record<string, z.ZodType>> = {\n` +
    members
      .map((name) => `  ${JSON.stringify(name)}: ${schemaName(name)},`)
      .join('\n') +
    `\n}\n\n` +
    `const ${inFlight} = new WeakSet()\n\n` +
    `export const ${schemaName(typeCode)}: ${annotation} = z\n` +
    `  .custom<${output}>(\n` +
    `    (value) =>\n` +
    `      typeof value === 'object' &&\n` +
    `      value !== null &&\n` +
    `      typeof (value as { resourceType?: unknown }).resourceType === 'string',\n` +
    `    {\n` +
    `      message: 'Expected a FHIR resource carrying a resourceType.',\n` +
    `      abort: true,\n` +
    `    },\n` +
    `  )\n` +
    `  .superRefine((value, ctx) => {\n` +
    `    const modelled = ${table}[value.resourceType]\n` +
    `    if (modelled === undefined) {\n` +
    `      ctx.addIssue({ code: 'custom', path: ['resourceType'], message: 'Resource type is not published by this pinned FHIR release.' })\n` +
    `      return\n` +
    `    }\n` +
    `    // JSON cannot describe a resource that contains itself, but an in-memory object can,\n` +
    `    // and re-entering one would recur until the stack ran out.\n` +
    `    if (${inFlight}.has(value)) return\n` +
    `    ${inFlight}.add(value)\n` +
    `    try {\n` +
    `      const result = modelled.safeParse(value)\n` +
    `      if (result.success) return\n` +
    `      // Re-raised rather than summarised, so a fault inside the resource still names the\n` +
    `      // element that carries it.\n` +
    `      for (const issue of result.error.issues) ctx.addIssue({ ...issue })\n` +
    `    } finally {\n` +
    `      ${inFlight}.delete(value)\n` +
    `    }\n` +
    `  })\n`
  )
}

const HEADER = `//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//
// GENERATED FILE. Run \`npm run generate:zod\` after changing the generator or the release pin.
//

/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion, sonarjs/no-nested-functions, sonarjs/regex-complexity, sonarjs/concise-regex, sonarjs/single-character-alternation */

`

const outputPathFor = (releaseKey) =>
  resolve(PACKAGE_ROOT, 'src/zod', releaseKey, 'schemas.ts')

async function main(argv) {
  const releaseKey = argv[argv.indexOf('--release') + 1]
  const check = argv.includes('--check')
  const release = RELEASES[releaseKey]
  if (!release) {
    throw new Error(
      `--release must be one of ${Object.keys(RELEASES).join(', ')}`,
    )
  }

  const packageDir = await fhirPackage(release)
  const { structures, valueSets, codeSystems } =
    await loadDefinitions(packageDir)
  // Which structures the release's TypeScript declarations actually name; only those can be
  // annotated, and the generator must not invent an import for one that is absent.
  const declarations = await readFile(
    resolve(
      PACKAGE_ROOT,
      '..',
      '..',
      'node_modules/@types/fhir',
      `${releaseKey}.d.ts`,
    ),
    'utf8',
  )
  const declaredTypes = new Set(
    [...declarations.matchAll(/^export interface (\w+)/gm)].map(
      (match) => match[1],
    ),
  )
  assertSafeGeneratorInput({
    structures,
    valueSets,
    codeSystems,
    declaredTypes,
  })
  const context = {
    structures,
    valueSets,
    codeSystems,
    declaredTypes,
    usedTypes: new Set(),
    abstractResources: new Set(),
  }

  // Close over everything the roots reach, so a consumer never meets an unresolved reference.
  const pending = new Set([...resourceRoots(structures), ...DATATYPE_ROOTS])
  const done = new Set()
  const chunks = new Map()
  while (pending.size > 0) {
    const name = [...pending][0]
    pending.delete(name)
    if (done.has(name)) continue
    done.add(name)
    const structure = structures.get(name)
    if (!structure) {
      throw new Error(
        `The pinned FHIR package does not define required structure ${name}.`,
      )
    }
    if (structure.abstract === true && structure.kind === 'resource') continue
    chunks.set(name, renderStructure(structure, context, pending))
  }

  const ordered = [...chunks.keys()].sort()
  // Emitted last, so the dispatch table can name every schema it resolves to as an initialised
  // binding rather than through another layer of laziness.
  const dispatches = [...context.abstractResources].sort().map((typeCode) => {
    const members = ordered.filter(
      (name) =>
        structures.get(name)?.kind === 'resource' &&
        specialises(name, typeCode, structures),
    )
    return renderResourceDispatch(typeCode, members, context)
  })
  const body = [...ordered.map((name) => chunks.get(name)), ...dispatches].join(
    '\n',
  )
  // Publish the gap alongside the schemas so a consumer can see exactly which invariants this
  // module does not check, and so a release that introduces a new one fails the parity check.
  const skipped = [...SKIPPED_CONSTRAINTS.entries()]
    .map(([path, keys]) => [path, [...keys].sort()])
    .sort(([a], [b]) => a.localeCompare(b))
  const skippedExport =
    `\n/** Exact pinned release material and generated closure behind this module. */\n` +
    `export const STRUCTURAL_SCHEMA_SOURCE = {\n` +
    `  packageId: ${JSON.stringify(release.packageId)},\n` +
    `  packageVersion: ${JSON.stringify(release.version)},\n` +
    `  fhirVersion: ${JSON.stringify(release.fhirVersion)},\n` +
    `  archiveSha512: ${JSON.stringify(release.integrity)},\n` +
    `  structureCount: ${String(ordered.length)},\n` +
    `} as const\n\n` +
    `/** Structural wire-boundary capabilities and deliberate limits. */\n` +
    `export const STRUCTURAL_SCHEMA_CAPABILITIES = {\n` +
    `  fullFhirPath: false,\n` +
    `  preservesDecimalLexemesAfterJsonParse: false,\n` +
    `  normativeConformanceValidator: 'official-fhir-validator',\n` +
    `} as const\n\n` +
    `/**\n * Invariants the release states for these paths that this module does not check.\n *\n` +
    ` * Structural rules are enforced; a rule expressed only as FHIRPath is not evaluated here.\n` +
    ` * Normative conformance is established by the official FHIR Validator, not by this module.\n */\n` +
    `export const UNCHECKED_CONSTRAINTS: Readonly<Record<string, readonly string[]>> = {\n` +
    skipped
      .map(
        ([path, keys]) =>
          `  ${JSON.stringify(path)}: [${keys.map((key) => JSON.stringify(key)).join(', ')}],`,
      )
      .join('\n') +
    `\n}\n`

  const imports = [...context.usedTypes].sort()
  const typeImport =
    imports.length > 0 ?
      `import type {\n${imports.map((name) => `  ${name} as ${fhirTypeAlias(name)},`).join('\n')}\n} from 'fhir/${releaseKey}.js'\n`
    : ''
  const rendered = `${HEADER}${typeImport}import { z } from 'zod'
import type { FhirJson } from '../../r4/json.js'
import { compareFhirDateTimes, hasValidFhirCalendarDate } from '../support.js'

// Generated from ${release.packageId}#${release.version} (FHIR ${release.fhirVersion}).
// ${ordered.length} structures: every type the exposed roots reach.

${body}${skippedExport}`

  // Formatted exactly as the repository formats everything else, so `eslint --fix` never
  // rewrites a generated file out from under its generator and breaks the parity check.
  const prettierConfig = await resolveConfig(outputPathFor(releaseKey))
  const formatted = await format(rendered, {
    ...prettierConfig,
    parser: 'typescript',
  })
  const outputDir = resolve(PACKAGE_ROOT, 'src/zod', releaseKey)
  const outputPath = join(outputDir, 'schemas.ts')
  if (check) {
    const current =
      existsSync(outputPath) ? await readFile(outputPath, 'utf8') : ''
    if (current !== formatted) {
      stdout.write(`${`${outputPath} is stale; run npm run generate:zod`}\n`)
      process.exitCode = 1
      return
    }
    stdout.write(`${`${releaseKey}: ${ordered.length} structures current`}\n`)
    return
  }
  await mkdir(outputDir, { recursive: true })
  await writeFile(outputPath, formatted, 'utf8')
  stdout.write(
    `${releaseKey}: wrote ${ordered.length} structures to ${outputPath}`,
  )
}

// Only generate when run as a command. The loader is exported for reuse, and importing it
// must not trigger a full generation with the importer's arguments.
if (import.meta.url === pathToFileURL(argv[1] ?? '').href) {
  await main(argv.slice(2))
}
