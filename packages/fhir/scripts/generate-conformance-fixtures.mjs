//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { Buffer } from 'node:buffer'
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
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
  deriveEventIdentifier,
  deriveOpaqueIdentitySystems,
  groveMobilePackageMetadata,
  groveRecordingFormatRegistry,
  parseAbsoluteUri,
  parseEventSequence,
  parseFhirInstant,
  parseIdentifierSystem,
  parseKeyEpoch,
  parseSemVer,
  retractionTargets,
  sharedMobileMeasurementCatalog,
  validateOpaqueIdentityScope,
} = rootApi
const {
  adapterMeasurementCatalog,
  buildProviderExchangeGraph,
  buildProviderRecordingGraph,
  buildProviderRetractionEvent,
  providerAdapterCatalog,
  providerRawOutputRoles,
  providerRecordEffectiveRules,
  providerScalarOutputRoles,
  encodeRecordingBytes,
  parseMediaType,
} = providerApi

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const localIgIndex = argv.indexOf('--ig')
const upstreamRoot =
  localIgIndex === -1 ?
    resolve(root, '.grove-fhir')
  : resolve(argv[localIgIndex + 1] ?? '')
const fixtureRoot = resolve(root, 'fixtures/conformance')
const check = argv.includes('--check')
const packageMetadata = JSON.parse(
  await readFile(resolve(root, 'package.json'), 'utf8'),
)
const semanticCorpus = JSON.parse(
  await readFile(
    resolve(upstreamRoot, 'Conformance/corpora/mobile-semantics/corpus.json'),
    'utf8',
  ),
)
const sharedMobileExchangeFiles = [
  'exchange-bundle.json',
  'retraction-bundle.json',
  'corpus.json',
]
// The corpora this package binds in its own tests travel with the fixtures, so the
// tests read committed bytes rather than the fetched contract.
const sharedCorpusFiles = [
  ...sharedMobileExchangeFiles.map((name) => `mobile-exchange/${name}`),
  'receiver-lifecycle/events.json',
  'receiver-lifecycle/sequences.json',
  'receiver-lifecycle/revision-sequences.json',
  ...(
    await readdir(
      resolve(upstreamRoot, 'Conformance/corpora/receiver-lifecycle/resources'),
    )
  )
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => `receiver-lifecycle/resources/${name}`),
  'study-attribution/source-event.json',
  'study-attribution/context-two-studies.json',
  'study-attribution/negative-cases.json',
]
const sharedCorpora = new Map(
  await Promise.all(
    sharedCorpusFiles.map(async (name) => [
      name,
      await readFile(
        resolve(upstreamRoot, 'Conformance/corpora', name),
        'utf8',
      ),
    ]),
  ),
)
const packageGraph = JSON.parse(
  await readFile(resolve(upstreamRoot, 'catalog/package-graph.json'), 'utf8'),
)
const producerVersion = packageMetadata.version
if (typeof producerVersion !== 'string' || producerVersion.length === 0) {
  throw new Error('The FHIR package must declare a producer version.')
}

const conformancePackageSources = [
  'google-health',
  'mobile',
  'oura',
  'providers',
  'sensor',
  'questionnaire',
  'withings',
]
const packageBySource = new Map(
  packageGraph.packages.map((entry) => [entry.source, entry]),
)
if (
  packageGraph.schemaVersion !== 0 ||
  packageGraph.fhirVersion !== '4.0.1' ||
  packageGraph.version !== groveMobilePackageMetadata.version
) {
  throw new Error(
    'The synchronized package graph must use the supported schema, target FHIR R4, and match the generated package coordinates.',
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
const retractionBundleProfile = profileCanonical(
  'mobile',
  'grove-mobile-retraction-bundle',
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
const identifierSystem = (value) => unwrap(parseIdentifierSystem(value))
const instant = (value) => unwrap(parseFhirInstant(value))
const sequence = (value) => unwrap(parseEventSequence(value))
const subject = {
  kind: 'logical',
  identifier: {
    system: identifierSystem(
      'https://grovealliance.org/fhir/testing/patient-pseudonyms',
    ),
    value: 'patient-example',
  },
}

const application = {
  sourceDeviceToken: 'grove-ts-conformance-producer',
  name: 'Grove TypeScript conformance producer',
  version: producerVersion,
}
const host = {
  sourceDeviceToken: 'grove-ts-conformance-host',
  operatingSystemVersion: 'Node.js 24',
}
const writer = {
  sourceDeviceToken: 'synthetic-connected-provider',
  name: 'Synthetic connected provider',
}
const repositoryScope = (provider) => {
  const scope = providerAdapterCatalog.providers.find(
    ({ id }) => id === provider,
  )?.identifierScope
  if (scope === 'account') {
    return {
      system: identifierSystem(
        'https://example.org/deployments/provider-account-pseudonyms',
      ),
      value: `account-${provider}`,
    }
  }
  if (scope === 'global' || scope === 'none') {
    return {
      system: identifierSystem('https://example.org/provider-key-spaces'),
      value: `${provider}-document-id-global`,
    }
  }
  throw new Error(`Provider ${provider} has no closed identifier scope.`)
}
// The deployment names its systems by the catalog's recommended form (D1).
const identityScope = unwrap(
  validateOpaqueIdentityScope({
    systems: unwrap(
      deriveOpaqueIdentitySystems(
        uri('https://grovealliance.org/fhir/testing'),
        'fixture-key',
        unwrap(parseKeyEpoch('1')),
      ),
    ),
    keyId: 'fixture-key',
    keyEpoch: unwrap(parseKeyEpoch('1')),
    secretBase64Url: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY',
    producerInstance: '33fc1b64-6b4c-4bb8-994a-82a8d72eb5dc',
  }),
)
const context = (provider, eventSequence, conversionInstant, extra = {}) => ({
  subject,
  event: unwrap(deriveEventIdentifier(identityScope, sequence(eventSequence))),
  identityScope,
  repositoryScope: repositoryScope(provider),
  application,
  host,
  conversionInstant: instant(conversionInstant),
  ...extra,
})
// The shared semantic corpus covers Mobile semantics; owner-exclusive Provider
// measurements are generated separately from their exact catalog definitions below.
const providerAdmittedMeasurementIds = new Set(
  Object.values(providerScalarOutputRoles).flatMap((sourceMappings) =>
    Object.values(sourceMappings).flatMap((mapping) => Object.keys(mapping)),
  ),
)
const admittedMeasurementIds = new Set(
  [...providerAdmittedMeasurementIds].filter((id) =>
    Object.hasOwn(sharedMobileMeasurementCatalog, id),
  ),
)
const semanticVectors = semanticCorpus.vectors.filter((vector) =>
  admittedMeasurementIds.has(vector.id),
)
if (semanticVectors.length !== admittedMeasurementIds.size) {
  throw new Error(
    'The semantic corpus must bind every shared Provider scalar measurement exactly once.',
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
  if (vector.result.type === 'CodeableConcept') {
    return { kind: vector.id, value: vector.result.code, effective }
  }
  if (vector.result.type !== 'Quantity') {
    throw new Error(`Unsupported semantic result type: ${vector.id}`)
  }
  return { kind: vector.id, value: vector.result.value, effective }
}

const measurements = semanticVectors.map(measurementFromVector)
const eventSequenceAt = (zeroBasedOrdinal) => String(zeroBasedOrdinal + 1)
const measurementEventSequences = measurements.map((_, index) =>
  eventSequenceAt(index),
)

const providerRows = new Map(
  providerAdapterCatalog.providers.map((provider) => [provider.id, provider]),
)
const exclusiveMeasurementCases = []
const includedExclusiveMeasurements = new Set()
for (const [provider, sourceMappings] of Object.entries(
  providerScalarOutputRoles,
)) {
  const providerRow = providerRows.get(provider)
  if (
    providerRow === undefined ||
    typeof providerRow.measurementOwner !== 'string'
  ) {
    throw new Error(`Provider ${provider} has no measurement owner.`)
  }
  for (const [sourceType, mapping] of Object.entries(sourceMappings)) {
    for (const kind of Object.keys(mapping)) {
      if (
        Object.hasOwn(sharedMobileMeasurementCatalog, kind) ||
        includedExclusiveMeasurements.has(kind)
      ) {
        continue
      }
      const definition =
        adapterMeasurementCatalog[providerRow.measurementOwner]?.[kind]
      if (
        definition === undefined ||
        definition.owner !== providerRow.measurementOwner
      ) {
        throw new Error(
          `Provider ${provider}/${sourceType} has no exact owner definition for ${kind}.`,
        )
      }
      const recordRule = providerRecordEffectiveRules[provider]?.[sourceType]
      const effective =
        recordRule !== undefined || definition.effective === 'Period' ?
          {
            kind: 'period',
            start: instant('2026-08-20T00:00:00-07:00'),
            end: instant('2026-08-21T00:00:00-07:00'),
          }
        : { kind: 'date-time', value: instant('2026-08-20T12:00:00Z') }
      const value =
        definition.valueKind === 'quantity' ? definition.quantity?.example
        : definition.valueKind === 'codeableConcept' ?
          definition.allowedValues?.[0]
        : undefined
      if (typeof value !== 'number' && typeof value !== 'string') {
        throw new Error(
          `Provider ${provider}/${sourceType}/${kind} has no scalar example.`,
        )
      }
      exclusiveMeasurementCases.push({
        provider,
        sourceType,
        measurement: { kind, value, effective },
      })
      includedExclusiveMeasurements.add(kind)
    }
  }
}
const admittedExclusiveMeasurementIds = new Set(
  [...providerAdmittedMeasurementIds].filter(
    (id) => !Object.hasOwn(sharedMobileMeasurementCatalog, id),
  ),
)
if (
  exclusiveMeasurementCases.length !== admittedExclusiveMeasurementIds.size ||
  [...admittedExclusiveMeasurementIds].some(
    (id) => !includedExclusiveMeasurements.has(id),
  )
) {
  throw new Error(
    'Every admitted owner-exclusive Provider scalar measurement requires one fixture.',
  )
}
const exclusiveMeasurementEventSequences = exclusiveMeasurementCases.map(
  (_, index) => eventSequenceAt(measurements.length + index),
)
const ouraDailyActivityEventSequence = eventSequenceAt(
  measurements.length + exclusiveMeasurementCases.length,
)

const providerFor = (measurement, index) => {
  const providers = Object.entries(providerScalarOutputRoles)
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

const measurementRecord = (provider, sourceType, sourceNativeId, kinds) => ({
  source: {
    adapter: { kind: 'providers', provider },
    sourceType,
    sourceNativeId,
    recordingMethod: 'automatically-recorded',
    writer,
  },
  measurements: kinds,
})

const conversionInstant = '2026-08-20T12:03:00Z'
const conversions = new Map()
const measurementGraph = (measurement, index) => {
  const provider = providerFor(measurement, index)
  const conversion = unwrap(
    buildProviderExchangeGraph(
      measurementRecord(
        provider.provider,
        provider.sourceType,
        `source-${measurement.kind}`,
        [measurement],
      ),
      context(
        provider.provider,
        measurementEventSequences[index],
        conversionInstant,
      ),
    ),
  )
  conversions.set(`resources/mobile-${measurement.kind}.json`, conversion)
  return conversion.graph
}

const exclusiveMeasurementGraph = (
  { provider, sourceType, measurement },
  index,
) =>
  unwrap(
    buildProviderExchangeGraph(
      measurementRecord(provider, sourceType, `source-${measurement.kind}`, [
        measurement,
      ]),
      context(
        provider,
        exclusiveMeasurementEventSequences[index],
        conversionInstant,
      ),
    ),
  ).graph

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
const ouraDailyActivityGraph = unwrap(
  buildProviderExchangeGraph(
    measurementRecord(
      'oura',
      'daily_activity',
      'source-oura-daily-activity',
      ouraDailyActivityMeasurements,
    ),
    context('oura', ouraDailyActivityEventSequence, '2026-08-21T07:03:00Z'),
  ),
).graph

const recordingSources = Object.entries(providerRawOutputRoles).flatMap(
  ([provider, sources]) =>
    Object.keys(sources).map((sourceType) => ({ provider, sourceType })),
)
const recordingEventSequences = recordingSources.map((_, index) =>
  eventSequenceAt(
    measurements.length + exclusiveMeasurementCases.length + 1 + index,
  ),
)

const recordingPath = ({ provider, sourceType }) =>
  `resources/recording-${provider}-${sourceType.replaceAll(/[^A-Za-z0-9]+/gu, '-').toLowerCase()}.json`

const recordingConversions = new Map()
const recordingGraph = ({ provider, sourceType }, index) => {
  const conversion = unwrap(
    buildProviderRecordingGraph(
      {
        adapter: { kind: 'providers', provider },
        sourceType,
        sourceNativeId: `raw-source-${provider}-${String(index + 1)}`,
        writer,
        effective: {
          kind: 'period',
          start: instant('2026-08-20T00:00:00Z'),
          end: instant('2026-08-20T12:00:00Z'),
        },
      },
      {
        kind: 'embedded',
        contentType: unwrap(
          parseMediaType(
            groveRecordingFormatRegistry.formats['provider-recording']
              .contentTypes[0],
          ),
        ),
        title: 'Authorized minimized provider recording',
        format: 'provider-recording',
        payloadAssertion: 'caller-authorized-opaque-payload',
        dataBase64: unwrap(
          encodeRecordingBytes(Buffer.from('{"synthetic":true}', 'utf8')),
        ),
      },
      context(provider, recordingEventSequences[index], conversionInstant),
    ),
  )
  recordingConversions.set(recordingPath({ provider, sourceType }), conversion)
  return conversion.graph
}

// The retraction names what the accepted graph itself says is retractable: the one
// primary output and the converter's own application snapshot.
const targetsOf = (graph) =>
  unwrap(retractionTargets(graph)).filter(
    (target) =>
      target.role !== 'device-snapshot' ||
      graph.entry.find(({ resource }) =>
        resource.identifier?.some(
          ({ value }) => value === target.identifier.value,
        ),
      )?.resource.deviceName?.[0]?.name === application.name,
  )

const primaryRetractionMeasurement = measurements[0]
if (primaryRetractionMeasurement === undefined) {
  throw new Error(
    'A primary-output retraction fixture requires one measurement.',
  )
}
const primaryRetractionEventSequence = eventSequenceAt(
  measurements.length +
    exclusiveMeasurementCases.length +
    1 +
    recordingSources.length,
)
const artifactRetractionEventSequence = eventSequenceAt(
  measurements.length +
    exclusiveMeasurementCases.length +
    2 +
    recordingSources.length,
)
const studyContextEventSequence = eventSequenceAt(
  measurements.length +
    exclusiveMeasurementCases.length +
    3 +
    recordingSources.length,
)

const questionnaireUrl = uri(
  'https://grovealliance.org/fhir/testing/Questionnaire/grove-ts-conformance',
)
const questionnaireVersion = unwrap(parseSemVer('1.0.0'))
const questionnaire = unwrap(
  buildQuestionnaire({
    url: questionnaireUrl,
    version: questionnaireVersion,
    language: 'en-US',
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
  buildQuestionnaireResponse(
    {
      language: 'en-US',
      identifier: {
        system: identifierSystem(
          'https://grovealliance.org/fhir/testing/questionnaire-responses',
        ),
        value: 'grove-ts-conformance-response',
      },
      status: 'completed',
      subject: { type: 'Patient', reference: 'Patient/example' },
      authored: instant('2026-08-20T12:00:00Z'),
      items: [
        {
          linkId: 'wellbeing',
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
    },
    questionnaire,
  ),
)

const resources = new Map(
  measurements.map((measurement, index) => [
    `resources/mobile-${measurement.kind}.json`,
    measurementGraph(measurement, index),
  ]),
)
const exclusiveMeasurementPath = ({ provider, measurement }) =>
  `resources/provider-${provider}-${measurement.kind}.json`
for (const [index, entry] of exclusiveMeasurementCases.entries()) {
  resources.set(
    exclusiveMeasurementPath(entry),
    exclusiveMeasurementGraph(entry, index),
  )
}
const ouraDailyActivityPath = 'resources/provider-oura-daily-activity.json'
resources.set(ouraDailyActivityPath, ouraDailyActivityGraph)
for (const [index, source] of recordingSources.entries()) {
  resources.set(recordingPath(source), recordingGraph(source, index))
}

const primaryConversion = conversions.get(
  `resources/mobile-${primaryRetractionMeasurement.kind}.json`,
)
const primaryRetractionProvider = providerFor(primaryRetractionMeasurement, 0)
resources.set(
  'resources/provider-primary-output-retraction.json',
  unwrap(
    buildProviderRetractionEvent(
      targetsOf(primaryConversion.graph),
      context(
        primaryRetractionProvider.provider,
        primaryRetractionEventSequence,
        '2026-08-22T12:02:00Z',
      ),
      primaryConversion.identifiers.sourceRecord,
      instant('2026-08-22T12:00:00Z'),
    ),
  ),
)
const artifactRetractionSource = recordingSources[0]
if (artifactRetractionSource === undefined) {
  throw new Error(
    'A source-artifact retraction fixture requires one recording.',
  )
}
const artifactConversion = recordingConversions.get(
  recordingPath(artifactRetractionSource),
)
resources.set(
  'resources/provider-source-artifact-retraction.json',
  unwrap(
    buildProviderRetractionEvent(
      targetsOf(artifactConversion.graph),
      context(
        artifactRetractionSource.provider,
        artifactRetractionEventSequence,
        '2026-08-22T13:02:00Z',
      ),
      artifactConversion.identifiers.sourceRecord,
      instant('2026-08-22T13:00:00Z'),
    ),
  ),
)

// One event under the recommended study shape: a bundled Patient and one enrollment.
const studyContextPath = 'resources/provider-study-context.json'
const studyContextMeasurement = measurementByKind.get('heart-rate')
if (studyContextMeasurement === undefined) {
  throw new Error('The study-context fixture requires the heart-rate vector.')
}
const studyContextProvider = providerFor(studyContextMeasurement, 0)
resources.set(
  studyContextPath,
  unwrap(
    buildProviderExchangeGraph(
      measurementRecord(
        studyContextProvider.provider,
        studyContextProvider.sourceType,
        'source-study-context-heart-rate',
        [studyContextMeasurement],
      ),
      context(
        studyContextProvider.provider,
        studyContextEventSequence,
        conversionInstant,
        {
          subject: {
            kind: 'bundled',
            identifier: subject.identifier,
            patient: {
              resourceType: 'Patient',
              identifier: [
                {
                  system: subject.identifier.system,
                  value: subject.identifier.value,
                },
              ],
            },
          },
          converterRole: { kind: 'gateway' },
          studies: [
            {
              study: {
                system: identifierSystem(
                  'https://grovealliance.org/fhir/testing/studies',
                ),
                value: 'grove-ts-conformance-study',
              },
              protocolUrl: uri(
                'https://grovealliance.org/fhir/testing/PlanDefinition/grove-ts-conformance',
              ),
              protocolVersion: '1',
              enrollment: {
                system: identifierSystem(
                  'https://grovealliance.org/fhir/testing/enrollments',
                ),
                value: 'grove-ts-conformance-enrollment',
              },
            },
          ],
        },
      ),
    ),
  ).graph,
)
resources.set('resources/questionnaire.json', questionnaire)
resources.set('resources/questionnaire-response.json', questionnaireResponse)
for (const [path, text] of sharedCorpora) resources.set(path, JSON.parse(text))

const abstractProviderObservationProfile = providerAdapterCatalog.adapterProfile
for (const [path, value] of resources) {
  const candidates =
    value?.resourceType === 'Bundle' ?
      (value.entry ?? []).map(({ resource }) => resource)
    : [value]
  if (
    candidates.some(
      (resource) =>
        resource?.resourceType === 'Observation' &&
        resource.meta?.profile?.includes(abstractProviderObservationProfile),
    )
  ) {
    throw new Error(
      `${path} directly claims the abstract ProvidersObservation parent instead of an exact provider envelope.`,
    )
  }
}

// The copied receiver corpus replays identifiers by design; only this package's own
// emissions and the normative bases must be distinct.
const eventIdentifiers = new Map()
for (const [path, value] of resources) {
  if (
    value?.resourceType !== 'Bundle' ||
    value.identifier === undefined ||
    path.startsWith('receiver-lifecycle/') ||
    path.startsWith('study-attribution/')
  ) {
    continue
  }
  const { system, value: identifierValue } = value.identifier
  if (typeof system !== 'string' || typeof identifierValue !== 'string') {
    throw new Error(`${path} has an incomplete event identifier.`)
  }
  const key = `${system.length}:${system}${identifierValue.length}:${identifierValue}`
  const prior = eventIdentifiers.get(key)
  if (prior !== undefined) {
    throw new Error(
      `${path} reuses the event identifier already emitted by ${prior}.`,
    )
  }
  eventIdentifiers.set(key, path)
}

const manifest = {
  schemaVersion: 0,
  fhirVersion: packageGraph.fhirVersion,
  producer: { name: 'Grove TypeScript', version: producerVersion },
  packages: conformancePackages,
  resources: [
    ...measurements.map((measurement) => ({
      path: `resources/mobile-${measurement.kind}.json`,
      requiredProfiles: [exchangeBundleProfile],
    })),
    ...exclusiveMeasurementCases.map((entry) => ({
      path: exclusiveMeasurementPath(entry),
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
      path: 'resources/provider-primary-output-retraction.json',
      requiredProfiles: [retractionBundleProfile],
    },
    {
      path: 'resources/provider-source-artifact-retraction.json',
      requiredProfiles: [retractionBundleProfile],
    },
    {
      path: studyContextPath,
      requiredProfiles: [exchangeBundleProfile],
    },
    {
      path: 'mobile-exchange/exchange-bundle.json',
      requiredProfiles: [exchangeBundleProfile],
    },
    {
      path: 'mobile-exchange/retraction-bundle.json',
      requiredProfiles: [retractionBundleProfile],
    },
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
      sharedCorpora.get(path) ??
        (await format(JSON.stringify(value), { parser: 'json' })),
    ]),
  ),
)
const license = `SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)

SPDX-License-Identifier: MIT
`
for (const relative of [...serialized.keys()]) {
  serialized.set(`${relative}.license`, license)
}

// Validate what we are about to publish, against the release's own model, before it is written.
// The official Validator checks these later in CI; catching a malformed emission here names the
// resource and the element rather than surfacing as a validator report a build later.
const { resourceSchema } = await import('@schmiedmayerlab/grove-fhir/zod/r4')
const nonResourceArtifacts = new Set(
  [...sharedCorpora.keys()].filter(
    (path) =>
      !path.includes('/resources/') &&
      !path.endsWith('-bundle.json') &&
      !path.endsWith('source-event.json') &&
      !path.endsWith('context-two-studies.json'),
  ),
)
const invalid = []
for (const [relative, resource] of resources) {
  if (nonResourceArtifacts.has(relative)) continue
  const result = resourceSchema.safeParse(resource)
  if (!result.success) {
    invalid.push(
      `${relative}: ${result.error.issues
        .map((issue) => `${issue.path.join('.') || '<root>'} ${issue.message}`)
        .join('; ')}`,
    )
  }
}
if (invalid.length > 0) {
  throw new Error(
    `Generated fixtures do not satisfy the R4 schemas:\n  ${invalid.join('\n  ')}`,
  )
}

const fixtureDirectories = [
  'resources',
  'mobile-exchange',
  'receiver-lifecycle',
  'receiver-lifecycle/resources',
  'study-attribution',
]
for (const directory of fixtureDirectories) {
  await mkdir(resolve(fixtureRoot, directory), { recursive: true })
}
const staleFixtureFiles = []
for (const directory of fixtureDirectories) {
  const expected = new Set(
    [...serialized.keys()]
      .filter((relative) => relative.startsWith(`${directory}/`))
      .map((relative) => relative.slice(directory.length + 1))
      .filter((relative) => !relative.includes('/')),
  )
  const stale = (await readdir(resolve(fixtureRoot, directory))).filter(
    (name) =>
      (name.endsWith('.json') || name.endsWith('.json.license')) &&
      !expected.has(name),
  )
  staleFixtureFiles.push(...stale.map((name) => `${directory}/${name}`))
}
if (check && staleFixtureFiles.length > 0) {
  throw new Error(
    `Conformance fixture directory contains stale generated files: ${staleFixtureFiles.join(', ')}`,
  )
}
if (!check) {
  await Promise.all(
    staleFixtureFiles.map((relative) => unlink(resolve(fixtureRoot, relative))),
  )
}
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
