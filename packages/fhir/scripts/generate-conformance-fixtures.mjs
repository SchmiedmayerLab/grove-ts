//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { argv, stdout } from 'node:process'
import { fileURLToPath } from 'node:url'

import { format } from 'prettier'

// These non-literal imports intentionally resolve only after `npm run build`.
const distRoot = '../dist'
const rootApi = await import(`${distRoot}/index.js`)
const providerApi = await import(`${distRoot}/providers/index.js`)
const {
  buildQuestionnaire,
  buildQuestionnaireResponse,
  groveFhirContractVersion,
  parseAbsoluteUri,
  parseCanonical,
  parseFhirInstant,
  parsePatientReference,
  parsePositiveInteger,
  parseSemVer,
} = rootApi
const {
  buildProviderRecordingBundle,
  buildProviderMeasurementBundle,
  providerRawMappings,
  providerRecordEffectiveRules,
  providerScalarMappings,
  encodeRecordingBytes,
  parseMediaType,
} = providerApi

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fixtureRoot = resolve(root, 'fixtures/conformance')
const resourceRoot = resolve(fixtureRoot, 'resources')
const check = argv.includes('--check')
const packageMetadata = JSON.parse(
  await readFile(resolve(root, 'package.json'), 'utf8'),
)
const semanticCorpus = JSON.parse(
  await readFile(
    resolve(
      root,
      '.grove-fhir/Conformance/corpora/mobile-semantics/corpus.json',
    ),
    'utf8',
  ),
)
const packageGraph = JSON.parse(
  await readFile(
    resolve(root, '.grove-fhir/catalog/package-graph.json'),
    'utf8',
  ),
)
const producerVersion = packageMetadata.version
if (typeof producerVersion !== 'string' || producerVersion.length === 0) {
  throw new Error('The FHIR package must declare a producer version.')
}

const conformancePackageSources = [
  'mobile',
  'providers',
  'sensor',
  'questionnaire',
]
const packageBySource = new Map(
  packageGraph.packages.map((entry) => [entry.source, entry]),
)
if (
  packageGraph.fhirVersion !== '4.0.1' ||
  packageGraph.version !== groveFhirContractVersion
) {
  throw new Error(
    'The synchronized package graph must match the generated R4 contract version.',
  )
}
const conformancePackages = conformancePackageSources.map((source) => {
  const entry = packageBySource.get(source)
  if (entry === undefined) {
    throw new Error(`The package graph is missing ${source}.`)
  }
  return {
    alias: source,
    packageId: entry.packageId,
    version: packageGraph.version,
  }
})
const profileCanonical = (source, profile) => {
  const entry = packageBySource.get(source)
  if (entry === undefined || !entry.profiles.includes(profile)) {
    throw new Error(`The package graph is missing ${source}/${profile}.`)
  }
  return `${entry.canonical}/StructureDefinition/${profile}`
}
const exchangeBundleProfile = profileCanonical(
  'mobile',
  'grove-mobile-exchange-bundle',
)
const questionnaireProfile = profileCanonical(
  'questionnaire',
  'grove-questionnaire',
)
const questionnaireResponseProfile = profileCanonical(
  'questionnaire',
  'grove-questionnaire-response',
)

const unwrap = (result) => {
  if (!result.ok) {
    throw new Error(result.issues.map((entry) => entry.message).join('\n'))
  }
  return result.value
}

const uri = (value) => unwrap(parseAbsoluteUri(value))
const instant = (value) => unwrap(parseFhirInstant(value))
const resourceIdentity = (system, value) => ({
  identifier: { system: uri(system), value },
})

const application = {
  identity: resourceIdentity(
    'https://grovealliance.org/fhir/testing/applications',
    'grove-ts-0.2',
  ),
  name: 'Grove TypeScript conformance producer',
  version: producerVersion,
}
const dataOrigin = {
  identity: resourceIdentity(
    'https://grovealliance.org/fhir/testing/data-origins',
    'connected-provider',
  ),
  name: 'Synthetic connected provider',
}
const admittedMeasurementIds = new Set(
  Object.values(providerScalarMappings).flatMap((sourceMappings) =>
    Object.values(sourceMappings).flatMap((mapping) => Object.keys(mapping)),
  ),
)
const semanticVectors = semanticCorpus.vectors.filter((vector) =>
  admittedMeasurementIds.has(vector.id),
)
if (semanticVectors.length !== admittedMeasurementIds.size) {
  throw new Error(
    'The semantic corpus must bind every Provider scalar measurement exactly once.',
  )
}

const effectiveFromVector = (vector) => {
  if (vector.effective.type === 'dateTime') {
    return { kind: 'date-time', value: instant(vector.effective.value) }
  }
  if (vector.effective.type === 'Period') {
    return {
      kind: 'period',
      start: instant(vector.effective.start),
      end: instant(vector.effective.end),
    }
  }
  throw new Error(`Unsupported semantic effective type: ${vector.id}`)
}

const measurementFromVector = (vector) => {
  const effective = effectiveFromVector(vector)
  if (vector.id === 'blood-pressure') {
    const systolic = vector.result.components.find(
      (component) => component.id === 'systolic',
    )
    const diastolic = vector.result.components.find(
      (component) => component.id === 'diastolic',
    )
    if (systolic === undefined || diastolic === undefined) {
      throw new Error('Blood-pressure semantic vector is incomplete.')
    }
    return {
      kind: vector.id,
      systolic: systolic.value,
      diastolic: diastolic.value,
      effective,
    }
  }
  if (vector.result.type !== 'Quantity') {
    throw new Error(`Unsupported semantic result type: ${vector.id}`)
  }
  return { kind: vector.id, value: vector.result.value, effective }
}

const measurements = semanticVectors.map(measurementFromVector)

const providerFor = (measurement, index) => {
  const providers = Object.entries(providerScalarMappings)
  const ordered = [
    ...providers.slice(index % providers.length),
    ...providers.slice(0, index % providers.length),
  ]
  for (const [provider, sourceMappings] of ordered) {
    for (const [sourceType, mapping] of Object.entries(sourceMappings)) {
      const effectiveRule = providerRecordEffectiveRules[provider]?.[sourceType]
      if (
        effectiveRule === undefined &&
        Object.hasOwn(mapping, measurement.kind)
      ) {
        return { provider, sourceType }
      }
    }
  }
  throw new Error(`No Provider provider admits ${measurement.kind}.`)
}

const providerMeasurementBundle = (measurement, index) => {
  const provider = providerFor(measurement, index)
  return unwrap(
    buildProviderMeasurementBundle({
      subject: unwrap(parsePatientReference('Patient/example')),
      measurements: [measurement],
      source: {
        adapter: {
          kind: 'providers',
          provider: provider.provider,
        },
        providerAccountIdentifier: {
          system: uri(
            'https://example.org/deployments/provider-account-pseudonyms',
          ),
          value: `account-${provider.provider}`,
          assurance: 'deployment-scoped-pseudonym',
        },
        sourceType: provider.sourceType,
        sourceNativeId: `source-${measurement.kind}`,
        recordingMethod: 'automatically-recorded',
        dataOrigin,
      },
      application,
      eventSequence: unwrap(parsePositiveInteger(index + 1)),
      issued: instant('2026-08-20T12:01:00Z'),
      recorded: instant('2026-08-20T12:02:00Z'),
    }),
  )
}

const measurementByKind = new Map(
  measurements.map((measurement) => [measurement.kind, measurement]),
)
const ouraDailyActivityEffective = {
  kind: 'period',
  start: instant('2026-08-20T00:00:00-07:00'),
  end: instant('2026-08-21T00:00:00-07:00'),
}
const ouraDailyActivityMeasurements = [
  'step-count',
  'active-energy',
  'distance',
].map((kind) => {
  const measurement = measurementByKind.get(kind)
  if (measurement === undefined) {
    throw new Error(`Missing semantic vector for Oura ${kind}.`)
  }
  return { ...measurement, effective: ouraDailyActivityEffective }
})
const ouraDailyActivityBundle = unwrap(
  buildProviderMeasurementBundle({
    subject: unwrap(parsePatientReference('Patient/example')),
    measurements: ouraDailyActivityMeasurements,
    source: {
      adapter: { kind: 'providers', provider: 'oura' },
      providerAccountIdentifier: {
        system: uri(
          'https://example.org/deployments/provider-account-pseudonyms',
        ),
        value: 'account-oura-daily-activity',
        assurance: 'deployment-scoped-pseudonym',
      },
      sourceType: 'daily_activity',
      sourceNativeId: 'source-oura-daily-activity',
      recordingMethod: 'automatically-recorded',
      dataOrigin,
    },
    application,
    eventSequence: unwrap(parsePositiveInteger(measurements.length + 1)),
    issued: instant('2026-08-21T07:01:00Z'),
    recorded: instant('2026-08-21T07:02:00Z'),
  }),
)

const recordingSources = Object.entries(providerRawMappings).flatMap(
  ([provider, sources]) =>
    Object.keys(sources).map((sourceType) => ({ provider, sourceType })),
)

const recordingPath = ({ provider, sourceType }) =>
  `resources/recording-${provider}-${sourceType.replaceAll(/[^A-Za-z0-9]+/gu, '-').toLowerCase()}.json`

const recordingBundle = ({ provider, sourceType }, index) =>
  unwrap(
    buildProviderRecordingBundle({
      source: {
        adapter: { kind: 'providers', provider },
        providerAccountIdentifier: {
          system: uri(
            'https://example.org/deployments/provider-account-pseudonyms',
          ),
          value: `account-${provider}`,
          assurance: 'deployment-scoped-pseudonym',
        },
        sourceType,
        sourceNativeId: `raw-source-${provider}-${String(index + 1)}`,
        dataOrigin,
      },
      attachment: {
        kind: 'embedded',
        contentType: unwrap(parseMediaType('application/octet-stream')),
        title: 'Authorized minimized provider recording',
        payloadAssertion: 'caller-authorized-opaque-payload',
        dataBase64: unwrap(encodeRecordingBytes(Uint8Array.of(1, 2, 3))),
      },
      subject: unwrap(parsePatientReference('Patient/example')),
      application,
      eventSequence: unwrap(
        parsePositiveInteger(measurements.length + index + 1),
      ),
      documentDate: instant('2026-08-20T12:01:00Z'),
      recorded: instant('2026-08-20T12:02:00Z'),
    }),
  )

const questionnaireUrl = uri(
  'https://grovealliance.org/fhir/testing/Questionnaire/grove-ts-conformance',
)
const questionnaireVersion = unwrap(parseSemVer('1.0.0'))
const questionnaire = unwrap(
  buildQuestionnaire({
    url: questionnaireUrl,
    version: questionnaireVersion,
    name: 'GroveTsConformance',
    title: 'Grove TypeScript conformance instrument',
    status: 'active',
    subjectTypes: ['Patient'],
    items: [
      {
        linkId: 'wellbeing',
        text: 'How are you feeling?',
        type: 'choice',
        required: true,
        answerOption: [
          {
            valueCoding: {
              system: uri(
                'https://grovealliance.org/fhir/testing/CodeSystem/wellbeing',
              ),
              code: 'well',
              display: 'Well',
            },
          },
          {
            valueCoding: {
              system: uri(
                'https://grovealliance.org/fhir/testing/CodeSystem/wellbeing',
              ),
              code: 'unwell',
              display: 'Unwell',
            },
          },
        ],
      },
    ],
  }),
)
const questionnaireResponse = unwrap(
  buildQuestionnaireResponse({
    questionnaire: unwrap(
      parseCanonical(`${questionnaireUrl}|${questionnaireVersion}`),
    ),
    identifier: {
      system: uri(
        'https://grovealliance.org/fhir/testing/questionnaire-responses',
      ),
      value: 'grove-ts-conformance-response',
    },
    status: 'completed',
    subject: unwrap(parsePatientReference('Patient/example')),
    authored: instant('2026-08-20T12:00:00Z'),
    items: [
      {
        linkId: 'wellbeing',
        text: 'How are you feeling?',
        answer: [
          {
            valueCoding: {
              system: uri(
                'https://grovealliance.org/fhir/testing/CodeSystem/wellbeing',
              ),
              code: 'well',
              display: 'Well',
            },
          },
        ],
      },
    ],
  }),
)

const resources = new Map(
  measurements.map((measurement, index) => [
    `resources/mobile-${measurement.kind}.json`,
    providerMeasurementBundle(measurement, index),
  ]),
)
const ouraDailyActivityPath = 'resources/provider-oura-daily-activity.json'
resources.set(ouraDailyActivityPath, ouraDailyActivityBundle)
for (const [index, source] of recordingSources.entries()) {
  resources.set(recordingPath(source), recordingBundle(source, index))
}
resources.set('resources/questionnaire.json', questionnaire)
resources.set('resources/questionnaire-response.json', questionnaireResponse)

const manifest = {
  schemaVersion: 1,
  fhirVersion: packageGraph.fhirVersion,
  producer: { name: 'Grove TypeScript', version: producerVersion },
  packages: conformancePackages,
  resources: [
    ...measurements.map((measurement) => ({
      path: `resources/mobile-${measurement.kind}.json`,
      requiredProfiles: [exchangeBundleProfile],
    })),
    {
      path: ouraDailyActivityPath,
      requiredProfiles: [exchangeBundleProfile],
    },
    ...recordingSources.map((source) => ({
      path: recordingPath(source),
      requiredProfiles: [exchangeBundleProfile],
    })),
    {
      path: 'resources/questionnaire.json',
      requiredProfiles: [questionnaireProfile],
    },
    {
      path: 'resources/questionnaire-response.json',
      requiredProfiles: [questionnaireResponseProfile],
    },
  ],
  semanticVectors: semanticVectors.map(({ id }) => ({
    id,
    path: `resources/mobile-${id}.json`,
    resourcePointer: '/entry/0/resource',
  })),
}

const serialized = new Map(
  await Promise.all(
    [...resources, ['manifest.json', manifest]].map(async ([path, value]) => [
      path,
      await format(JSON.stringify(value), { parser: 'json' }),
    ]),
  ),
)
const license = `SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)

SPDX-License-Identifier: MIT
`
for (const relative of [...serialized.keys()]) {
  serialized.set(`${relative}.license`, license)
}

await mkdir(resourceRoot, { recursive: true })
for (const [relative, value] of serialized) {
  const path = resolve(fixtureRoot, relative)
  if (check) {
    const existing = await readFile(path, 'utf8').catch(() => undefined)
    if (existing !== value) {
      throw new Error(`Conformance fixture is stale: ${relative}`)
    }
  } else {
    await writeFile(path, value)
  }
}

stdout.write(
  `${check ? 'Checked' : 'Generated'} ${resources.size} R4 resources from the public API.\n`,
)
