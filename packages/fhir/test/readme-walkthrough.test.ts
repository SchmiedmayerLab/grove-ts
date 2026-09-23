//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { readFileSync } from 'node:fs'
import { machine, release, type } from 'node:os'
import typeSurface from './type-surface.json' with { type: 'json' }
import * as root from '../src/index.js'
import {
  codeableConceptDisplay,
  deriveEventIdentifier,
  deriveOpaqueIdentitySystems,
  fhirDateTimeToDate,
  fhirQuantityToValue,
  isSemanticallyEqual,
  observationEffectiveDate,
  observationNumericValue,
  parseAbsoluteUri,
  parseEventSequence,
  parseExchangeEventContext,
  parseExchangeGraph,
  parseFhirId,
  parseFhirInstant,
  parseIdentifierSystem,
  parseKeyEpoch,
  parseObservation,
  parseSemVer,
  retractionTargets,
  validateOpaqueIdentityScope,
  type ApplicationDevice,
  type ExchangeEventContext,
  type ExchangeGraph,
  type Result,
} from '../src/index.js'
import * as mobile from '../src/mobile/index.js'
import * as providers from '../src/providers/index.js'
import {
  buildProviderExchangeGraph,
  buildProviderExchangeGraphs,
  buildProviderRetractionEvent,
  type NormalizedProviderRecord,
} from '../src/providers/index.js'
import * as questionnaire from '../src/questionnaire/index.js'
import {
  buildQuestionnaire,
  buildQuestionnaireResponse,
  preflightQuestionnairePair,
} from '../src/questionnaire/index.js'
import * as r4 from '../src/r4/index.js'
import * as zodR4 from '../src/zod/r4/index.js'
import * as zodR4b from '../src/zod/r4b/index.js'

// The README walks through this file. Every TypeScript block there, minus its imports, is a
// region below, so the walkthrough compiles and runs against the API it documents.

const seed = (name: string, value: string): void => {
  process.env[name] ??= value
}
seed(
  'GROVE_IDENTITY_SECRET_BASE64URL',
  'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY',
)
seed('GROVE_PRODUCER_INSTANCE', '1f5c58aa-6ec6-4e79-a682-829a9debd3f5')

// readme:begin setup
// Every parser returns a Result; report the issues where a real application handles them.
const unwrap = <Value>(result: Result<Value>): Value => {
  if (!result.ok) {
    throw new Error(result.issues.map(({ message }) => message).join('\n'))
  }
  return result.value
}
const uri = (value: string) => unwrap(parseAbsoluteUri(value))
const identifierSystem = (value: string) => unwrap(parseIdentifierSystem(value))

// From your secret store: the HMAC key as base64url, and the UUID generated for this installation.
const identitySecret = process.env.GROVE_IDENTITY_SECRET_BASE64URL
const producerInstance = process.env.GROVE_PRODUCER_INSTANCE
if (identitySecret === undefined || producerInstance === undefined) {
  throw new Error('The identity key and the producer instance id are missing.')
}

const keyEpoch = unwrap(parseKeyEpoch('1'))
const identityScope = unwrap(
  validateOpaqueIdentityScope({
    systems: unwrap(
      deriveOpaqueIdentitySystems(
        uri('https://mystudy.example.org/fhir'),
        'study-key',
        keyEpoch,
      ),
    ),
    keyId: 'study-key',
    keyEpoch,
    secretBase64Url: identitySecret,
    producerInstance,
  }),
)

const application: ApplicationDevice = {
  sourceDeviceToken: 'org.example.mystudy-server|2.1.0',
  name: 'MyStudy server',
  version: '2.1.0',
}
// readme:end setup

let lastSequence = 1041
const reserveNextEventSequence = (): string => {
  lastSequence += 1
  return String(lastSequence)
}
const participant = {
  pseudonym: 'participant-7f3a',
  withingsAccountPseudonym: 'withings-account-7f3a',
}

// readme:begin export
// Reserve the sequence in the same transaction that records this export; it is never reused.
const sequence = unwrap(parseEventSequence(reserveNextEventSequence()))

const context: ExchangeEventContext = {
  subject: {
    kind: 'logical',
    identifier: {
      system: identifierSystem(
        'https://mystudy.example.org/fhir/identifiers/participants',
      ),
      value: participant.pseudonym,
    },
  },
  event: unwrap(deriveEventIdentifier(identityScope, sequence)),
  identityScope,
  repositoryScope: {
    system: identifierSystem(
      'https://mystudy.example.org/fhir/identifiers/withings-accounts',
    ),
    value: participant.withingsAccountPseudonym,
  },
  application,
  host: {
    sourceDeviceToken: `${machine()}|${type()} ${release()}`,
    operatingSystemVersion: `${type()} ${release()}`,
  },
}
// readme:end export

const measure = { grpid: '1234567890', value: 64, date: '2026-08-19T17:30:00Z' }
const uploaded: ExchangeGraph[] = []
const upload = (graph: ExchangeGraph): void => {
  uploaded.push(graph)
}

// readme:begin convert
// One row of the Withings measure response, already fetched and decoded by your adapter.
const record: NormalizedProviderRecord = {
  source: {
    adapter: { kind: 'providers', provider: 'withings' },
    sourceType: 'getmeas:11',
    sourceNativeId: measure.grpid,
    writer: { sourceDeviceToken: 'withings-api', name: 'Withings API' },
  },
  measurements: [
    {
      kind: 'heart-rate',
      value: measure.value,
      effective: {
        kind: 'date-time',
        value: unwrap(parseFhirInstant(measure.date)),
      },
    },
  ],
}

const result = buildProviderExchangeGraph(record, context)
if (result.ok) {
  upload(result.value.graph)
} else {
  for (const issue of result.issues) {
    console.error(issue.code, issue.path.join('.'), issue.message)
  }
}
// readme:end convert

// readme:begin study
const enrolled: ExchangeEventContext = {
  ...context,
  subject: {
    kind: 'bundled',
    identifier: context.subject.identifier,
    patient: {
      resourceType: 'Patient',
      identifier: [context.subject.identifier],
    },
  },
  studies: [
    {
      study: {
        system: identifierSystem(
          'https://mystudy.example.org/fhir/identifiers/studies',
        ),
        value: 'heart-2026',
      },
      protocolUrl: uri(
        'https://mystudy.example.org/fhir/PlanDefinition/heart-2026',
      ),
      protocolVersion: '3',
      enrollment: {
        system: identifierSystem(
          'https://mystudy.example.org/fhir/identifiers/enrollments',
        ),
        value: 'enrollment-7f3a',
      },
    },
  ],
}
// readme:end study

// readme:begin disclosure
const disclosed = buildProviderExchangeGraph(record, context, {
  nativeIdentifierDisclosure: {
    kind: 'authorized',
    system: identifierSystem(
      'https://mystudy.example.org/fhir/identifiers/withings-measure-groups',
    ),
    type: { text: 'Withings measure group id' },
  },
})
// readme:end disclosure

// readme:begin repository-ids
const stored: ExchangeEventContext = {
  ...context,
  repositoryIds: {
    bundle: unwrap(parseFhirId('bundle-1042')),
    'primary-output': unwrap(parseFhirId('observation-1042')),
  },
}
// readme:end repository-ids

// readme:begin gateway
const relayed: ExchangeEventContext = {
  ...context,
  converterRole: {
    kind: 'gateway-application',
    application: {
      sourceDeviceToken: 'org.example.mystudy-app|4.2.0',
      name: 'MyStudy app',
      version: '4.2.0',
    },
  },
}
// readme:end gateway

// readme:begin warnings
if (result.ok) {
  for (const warning of result.value.warnings) {
    console.warn(warning.code, warning.reason)
  }
}
// readme:end warnings

const records = [record]

// readme:begin batch
const batch = buildProviderExchangeGraphs(records, () => ({
  ...context,
  event: unwrap(
    deriveEventIdentifier(
      identityScope,
      unwrap(parseEventSequence(reserveNextEventSequence())),
    ),
  ),
}))
for (const conversion of batch.conversions) upload(conversion.graph)
for (const failure of batch.failures) {
  console.error(
    failure.record.source.sourceNativeId,
    failure.issues.map(({ code }) => code),
  )
}
// readme:end batch

const conversion = unwrap(buildProviderExchangeGraph(record, context))
const graph = conversion.graph
const storedGraphText = JSON.stringify(graph, null, 2)

// readme:begin retry
const sameEvent = unwrap(
  isSemanticallyEqual(storedGraphText, JSON.stringify(graph)),
)
// readme:end retry

// readme:begin retraction
const retraction = buildProviderRetractionEvent(
  unwrap(retractionTargets(graph)),
  {
    ...context,
    event: unwrap(
      deriveEventIdentifier(
        identityScope,
        unwrap(parseEventSequence(reserveNextEventSequence())),
      ),
    ),
  },
  conversion.identifiers.sourceRecord,
  unwrap(parseFhirInstant('2026-09-01T08:00:00Z')),
)
// readme:end retraction

const observation = unwrap(parseObservation(graph.entry[0].resource))
const input: unknown = graph.entry[0].resource

// readme:begin parse-observation
const parsed = parseObservation(input)

if (!parsed.ok) {
  for (const issue of parsed.issues) {
    console.error(issue.path, issue.code, issue.message)
  }
}
// readme:end parse-observation

// readme:begin read-values
const recorded = fhirDateTimeToDate(observation.effectiveDateTime)
const measured = fhirQuantityToValue(observation.valueQuantity)
// readme:end read-values

// readme:begin extract-values
const when = observationEffectiveDate(observation)
const value = observationNumericValue(observation)
const label = codeableConceptDisplay(observation.code)
// readme:end extract-values

// readme:begin questionnaire
const translation = (lang: string, content: string) => ({
  url: 'http://hl7.org/fhir/StructureDefinition/translation',
  extension: [
    { url: 'lang', valueCode: lang },
    { url: 'content', valueString: content },
  ],
})

// One Questionnaire carries every language: base strings plus their translations.
const instrument = unwrap(
  buildQuestionnaire({
    url: uri('https://mystudy.example.org/fhir/Questionnaire/wellbeing'),
    version: unwrap(parseSemVer('1.0.0')),
    language: 'en-US',
    status: 'active',
    subjectTypes: ['Patient'],
    items: [
      {
        linkId: 'feeling',
        text: 'How are you feeling today?',
        _text: { extension: [translation('es', '¿Cómo se siente hoy?')] },
        type: 'string',
        required: true,
      },
    ],
  }),
)

// The participant read Spanish, so the response names it and repeats no base text.
const answers = unwrap(
  buildQuestionnaireResponse(
    {
      language: 'es',
      identifier: {
        system: identifierSystem('https://mystudy.example.org/fhir/responses'),
        value: 'wellbeing-1',
      },
      status: 'completed',
      subject: { type: 'Patient', reference: 'Patient/participant-1' },
      authored: unwrap(parseFhirInstant('2026-08-19T17:30:00Z')),
      items: [{ linkId: 'feeling', answer: [{ valueString: 'Bien' }] }],
    },
    instrument,
  ),
)
const pair = preflightQuestionnairePair(instrument, answers)
// readme:end questionnaire

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
const source = readFileSync(new URL(import.meta.url), 'utf8')
interface EntryPoint {
  readonly runtime: Readonly<Record<string, unknown>>
  readonly declared: Readonly<Record<string, string>>
}
const declaredSurface = typeSurface as Readonly<
  Record<string, Readonly<Record<string, string>>>
>
const entryPoints: Readonly<Record<string, EntryPoint>> = {
  '@schmiedmayerlab/grove-fhir': {
    runtime: root,
    declared: declaredSurface['.'] ?? {},
  },
  '@schmiedmayerlab/grove-fhir/mobile': {
    runtime: mobile,
    declared: declaredSurface['./mobile'] ?? {},
  },
  '@schmiedmayerlab/grove-fhir/providers': {
    runtime: providers,
    declared: declaredSurface['./providers'] ?? {},
  },
  '@schmiedmayerlab/grove-fhir/r4': {
    runtime: r4,
    declared: declaredSurface['./r4'] ?? {},
  },
  '@schmiedmayerlab/grove-fhir/questionnaire': {
    runtime: questionnaire,
    declared: declaredSurface['./questionnaire'] ?? {},
  },
  '@schmiedmayerlab/grove-fhir/zod/r4': { runtime: zodR4, declared: {} },
  '@schmiedmayerlab/grove-fhir/zod/r4b': { runtime: zodR4b, declared: {} },
}

interface ReadmeBlock {
  readonly imports: readonly string[]
  readonly body: string
}

// Fenced TypeScript blocks, split into their leading import statements and the code.
const readmeBlocks = (): readonly ReadmeBlock[] => {
  const blocks: ReadmeBlock[] = []
  let lines: string[] | undefined
  for (const line of readme.split('\n')) {
    if (lines === undefined) {
      if (line === '```typescript') lines = []
      continue
    }
    if (line !== '```') {
      lines.push(line)
      continue
    }
    const imports: string[] = []
    let statement: string[] = []
    let consumed = 0
    for (const [index, candidate] of lines.entries()) {
      if (statement.length === 0 && !candidate.startsWith('import ')) break
      statement.push(candidate)
      if (candidate.includes(" from '")) {
        imports.push(`${statement.join('\n')}\n`)
        statement = []
        consumed = index + 1
      }
    }
    blocks.push({ imports, body: lines.slice(consumed).join('\n').trim() })
    lines = undefined
  }
  return blocks
}

const importedNames = (
  statement: string,
): { readonly module: string; readonly names: readonly string[] } => {
  const module = /from '([^']+)'/u.exec(statement)?.[1] ?? ''
  const open = statement.indexOf('{')
  const close = statement.lastIndexOf('}')
  const names = (
    open === -1 || close === -1 ?
      ''
    : statement.slice(open + 1, close))
    .split(',')
    .map((name) => name.trim().replace(/ as .*$/u, ''))
    .filter((name) => name !== '')
  return { module, names }
}

describe('README walkthrough', () => {
  it('converts the record under a context that uses every default', () => {
    expect(result.ok).toBe(true)
    expect(uploaded).toHaveLength(2)
    const resolved = parseExchangeEventContext(context)
    expect(resolved.ok).toBe(true)
    if (!resolved.ok) return
    expect(resolved.value.converterRole).toEqual({ kind: 'assembler' })
    expect(resolved.value.studies).toEqual([])
    expect(
      Date.now() - Date.parse(resolved.value.conversionInstant),
    ).toBeLessThan(60_000)
  })

  it('reads the emitted Observation back out', () => {
    expect(parsed.ok).toBe(true)
    expect(recorded.ok && recorded.value.toISOString()).toBe(
      '2026-08-19T17:30:00.000Z',
    )
    expect(measured.ok && measured.value.value).toBe(64)
    expect(when?.toISOString()).toBe('2026-08-19T17:30:00.000Z')
    expect(value).toBe(64)
    expect(label).toBeUndefined()
  })

  it('accepts every fragment beyond the minimum', () => {
    expect(buildProviderExchangeGraph(record, enrolled).ok).toBe(true)
    expect(disclosed.ok).toBe(true)
    expect(buildProviderExchangeGraph(record, stored).ok).toBe(true)
    expect(buildProviderExchangeGraph(record, relayed).ok).toBe(true)
    expect(batch.conversions).toHaveLength(1)
    expect(batch.failures).toHaveLength(0)
    expect(sameEvent).toBe(true)
    expect(retraction.ok).toBe(true)
    expect(parseExchangeGraph(graph).ok).toBe(true)
  })

  it('answers a multilingual Questionnaire in a translation', () => {
    expect(instrument.item[0]?._text?.extension).toHaveLength(1)
    expect(answers.language).toBe('es')
    expect(answers.item?.[0]?.text).toBeUndefined()
    expect(pair.ok).toBe(true)
  })

  it('keeps every README code block in this file', () => {
    const blocks = readmeBlocks()
    expect(blocks.length).toBeGreaterThan(8)
    for (const block of blocks) {
      expect(source).toContain(block.body)
      for (const statement of block.imports) {
        const { module, names } = importedNames(statement)
        const entryPoint = entryPoints[module]
        if (entryPoint === undefined) {
          expect(source).toContain(statement)
          continue
        }
        for (const name of names) {
          const bare = name.replace(/^type /u, '')
          const surface =
            name.startsWith('type ') ?
              Object.keys(entryPoint.declared)
            : Object.keys(entryPoint.runtime)
          expect(surface).toContain(bare)
        }
      }
    }
  })
})
