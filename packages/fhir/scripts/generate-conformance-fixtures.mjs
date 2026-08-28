//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { Buffer } from 'node:buffer'
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
  groveExchangeProtocol,
  groveFhirContractVersion,
  parseAbsoluteUri,
  parseCanonical,
  parseFhirInstant,
  parseSemVer,
  sharedMobileMeasurementCatalog,
} = rootApi
const {
  adapterMeasurementCatalog,
  buildProviderRecordingBundle,
  buildProviderMeasurementBundle,
  buildProviderRetractionBundle,
  providerAdapterCatalog,
  providerRawOutputRoles,
  providerRecordEffectiveRules,
  providerScalarOutputDiscriminators,
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
const resourceRoot = resolve(fixtureRoot, 'resources')
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
const mobileExchangeCorpusRoot = resolve(
  upstreamRoot,
  'Conformance/corpora/mobile-exchange',
)
const sharedMobileExchangeFiles = [
  'exchange-bundle.json',
  'retraction-bundle.json',
  'corpus.json',
]
const sharedMobileExchange = new Map(
  await Promise.all(
    sharedMobileExchangeFiles.map(async (name) => [
      `mobile-exchange/${name}`,
      JSON.parse(
        await readFile(resolve(mobileExchangeCorpusRoot, name), 'utf8'),
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
const instant = (value) => unwrap(parseFhirInstant(value))
const providerSubject = {
  type: 'Patient',
  identifier: {
    system: uri('https://grovealliance.org/fhir/testing/patient-pseudonyms'),
    value: 'patient-example',
    assurance: 'deployment-scoped-pseudonym',
  },
}

const application = {
  sourceDeviceToken: 'grove-ts-conformance-producer',
  name: 'Grove TypeScript conformance producer',
  version: producerVersion,
}
const dataOrigin = {
  sourceDeviceToken: 'synthetic-connected-provider',
  name: 'Synthetic connected provider',
}
const providerScopeIdentifier = (provider) => {
  const scope = providerAdapterCatalog.providers.find(
    ({ id }) => id === provider,
  )?.identifierScope
  if (scope === 'account') {
    return {
      system: uri(
        'https://example.org/deployments/provider-account-pseudonyms',
      ),
      value: `account-${provider}`,
      assurance: 'deployment-scoped-account-pseudonym',
    }
  }
  if (scope === 'global' || scope === 'none') {
    return {
      system: uri('https://example.org/provider-key-spaces'),
      value: `${provider}-document-id-global`,
      assurance: 'documented-global-key-space',
    }
  }
  throw new Error(`Provider ${provider} has no closed identifier scope.`)
}
const deploymentIdentity = {
  opaqueIdentifierSystems: Object.fromEntries(
    groveExchangeProtocol.opaqueIdentity.identityKinds.map(({ kind }) => [
      kind,
      uri(
        `https://grovealliance.org/fhir/testing/identity/${kind}/fixture-key/1`,
      ),
    ]),
  ),
  eventIdentifierSystem: uri(
    'https://grovealliance.org/fhir/testing/identity/event',
  ),
  entryNodeIdentifierSystem: uri(
    'https://grovealliance.org/fhir/testing/identity/entry-node',
  ),
  keyId: 'fixture-key',
  keyEpoch: '1',
  secretBase64Url: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY',
  producerInstance: '33fc1b64-6b4c-4bb8-994a-82a8d72eb5dc',
}
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

const providerMeasurementBundle = (measurement, index) => {
  const provider = providerFor(measurement, index)
  return unwrap(
    buildProviderMeasurementBundle({
      subject: providerSubject,
      measurements: [measurement],
      source: {
        adapter: {
          kind: 'providers',
          provider: provider.provider,
        },
        providerScopeIdentifier: providerScopeIdentifier(provider.provider),
        sourceType: provider.sourceType,
        sourceNativeId: `source-${measurement.kind}`,
        recordingMethod: 'automatically-recorded',
        dataOrigin,
      },
      application,
      eventSequence: measurementEventSequences[index],
      deploymentIdentity,
      occurred: instant('2026-08-20T12:00:00Z'),
      recorded: instant('2026-08-20T12:02:00Z'),
      assembled: instant('2026-08-20T12:03:00Z'),
    }),
  )
}

const exclusiveProviderMeasurementBundle = (
  { provider, sourceType, measurement },
  index,
) =>
  unwrap(
    buildProviderMeasurementBundle({
      subject: providerSubject,
      measurements: [measurement],
      source: {
        adapter: { kind: 'providers', provider },
        providerScopeIdentifier: providerScopeIdentifier(provider),
        sourceType,
        sourceNativeId: `source-${measurement.kind}`,
        recordingMethod: 'automatically-recorded',
        dataOrigin,
      },
      application,
      eventSequence: exclusiveMeasurementEventSequences[index],
      deploymentIdentity,
      occurred: instant('2026-08-20T12:00:00Z'),
      recorded: instant('2026-08-20T12:02:00Z'),
      assembled: instant('2026-08-20T12:03:00Z'),
    }),
  )

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
    subject: providerSubject,
    measurements: ouraDailyActivityMeasurements,
    source: {
      adapter: { kind: 'providers', provider: 'oura' },
      providerScopeIdentifier: providerScopeIdentifier('oura'),
      sourceType: 'daily_activity',
      sourceNativeId: 'source-oura-daily-activity',
      recordingMethod: 'automatically-recorded',
      dataOrigin,
    },
    application,
    eventSequence: ouraDailyActivityEventSequence,
    deploymentIdentity,
    occurred: instant('2026-08-21T07:00:00Z'),
    recorded: instant('2026-08-21T07:02:00Z'),
    assembled: instant('2026-08-21T07:03:00Z'),
  }),
)

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

const recordingBundle = ({ provider, sourceType }, index) =>
  unwrap(
    buildProviderRecordingBundle({
      source: {
        adapter: { kind: 'providers', provider },
        providerScopeIdentifier: providerScopeIdentifier(provider),
        sourceType,
        sourceNativeId: `raw-source-${provider}-${String(index + 1)}`,
        dataOrigin,
      },
      attachment: {
        kind: 'embedded',
        contentType: unwrap(
          parseMediaType('application/vnd.grovealliance.provider+json'),
        ),
        title: 'Authorized minimized provider recording',
        format: 'provider-recording',
        payloadAssertion: 'caller-authorized-opaque-payload',
        dataBase64: unwrap(
          encodeRecordingBytes(Buffer.from('{"synthetic":true}', 'utf8')),
        ),
      },
      subject: providerSubject,
      application,
      eventSequence: recordingEventSequences[index],
      deploymentIdentity,
      documentDate: instant('2026-08-20T12:01:00Z'),
      occurred: instant('2026-08-20T12:00:00Z'),
      recorded: instant('2026-08-20T12:02:00Z'),
      assembled: instant('2026-08-20T12:03:00Z'),
    }),
  )

const primaryRetractionMeasurement = measurements[0]
if (primaryRetractionMeasurement === undefined) {
  throw new Error(
    'A primary-output retraction fixture requires one measurement.',
  )
}
const primaryRetractionProvider = providerFor(primaryRetractionMeasurement, 0)
const primaryRetractionOutputRole =
  providerScalarOutputRoles[primaryRetractionProvider.provider]?.[
    primaryRetractionProvider.sourceType
  ]?.[primaryRetractionMeasurement.kind]
if (primaryRetractionOutputRole === undefined) {
  throw new Error('The primary-output retraction role is not catalog-owned.')
}
const primaryRetractionOutputDiscriminator =
  providerScalarOutputDiscriminators[primaryRetractionProvider.provider]?.[
    primaryRetractionProvider.sourceType
  ]?.[primaryRetractionMeasurement.kind]
if (primaryRetractionOutputDiscriminator === undefined) {
  throw new Error(
    'The primary-output retraction discriminator is not catalog-owned.',
  )
}
const primaryRetractionEventSequence = eventSequenceAt(
  measurements.length +
    exclusiveMeasurementCases.length +
    1 +
    recordingSources.length,
)
const primaryRetractionBundle = unwrap(
  buildProviderRetractionBundle({
    source: {
      provider: primaryRetractionProvider.provider,
      providerScopeIdentifier: providerScopeIdentifier(
        primaryRetractionProvider.provider,
      ),
      sourceType: primaryRetractionProvider.sourceType,
      sourceNativeId: `source-${primaryRetractionMeasurement.kind}`,
    },
    targets: [
      {
        role: 'primary-output',
        resourceType: 'Observation',
        outputRole: primaryRetractionOutputRole,
        outputDiscriminator: primaryRetractionOutputDiscriminator,
      },
      {
        role: 'device-snapshot',
        resourceType: 'Device',
        priorEventSequence: measurementEventSequences[0],
        deviceRole: 'application',
        sourceDeviceToken: application.sourceDeviceToken,
      },
    ],
    application,
    eventSequence: primaryRetractionEventSequence,
    deploymentIdentity,
    occurred: instant('2026-08-22T12:00:00Z'),
    recorded: instant('2026-08-22T12:01:00Z'),
    assembled: instant('2026-08-22T12:02:00Z'),
  }),
)

const artifactRetractionSource = recordingSources[0]
if (artifactRetractionSource === undefined) {
  throw new Error(
    'A source-artifact retraction fixture requires one recording.',
  )
}
const artifactRetractionEventSequence = eventSequenceAt(
  measurements.length +
    exclusiveMeasurementCases.length +
    2 +
    recordingSources.length,
)
const artifactRetractionBundle = unwrap(
  buildProviderRetractionBundle({
    source: {
      provider: artifactRetractionSource.provider,
      providerScopeIdentifier: providerScopeIdentifier(
        artifactRetractionSource.provider,
      ),
      sourceType: artifactRetractionSource.sourceType,
      sourceNativeId: `raw-source-${artifactRetractionSource.provider}-1`,
    },
    targets: [
      {
        role: 'source-artifact',
        resourceType: 'DocumentReference',
        formatCode: 'provider-recording',
        partIndex: '0',
      },
      {
        role: 'device-snapshot',
        resourceType: 'Device',
        priorEventSequence: recordingEventSequences[0],
        deviceRole: 'application',
        sourceDeviceToken: application.sourceDeviceToken,
      },
    ],
    application,
    eventSequence: artifactRetractionEventSequence,
    deploymentIdentity,
    occurred: instant('2026-08-22T13:00:00Z'),
    recorded: instant('2026-08-22T13:01:00Z'),
    assembled: instant('2026-08-22T13:02:00Z'),
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
    subject: { type: 'Patient', reference: 'Patient/example' },
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
const exclusiveMeasurementPath = ({ provider, measurement }) =>
  `resources/provider-${provider}-${measurement.kind}.json`
for (const [index, entry] of exclusiveMeasurementCases.entries()) {
  resources.set(
    exclusiveMeasurementPath(entry),
    exclusiveProviderMeasurementBundle(entry, index),
  )
}
const ouraDailyActivityPath = 'resources/provider-oura-daily-activity.json'
resources.set(ouraDailyActivityPath, ouraDailyActivityBundle)
for (const [index, source] of recordingSources.entries()) {
  resources.set(recordingPath(source), recordingBundle(source, index))
}
resources.set(
  'resources/provider-primary-output-retraction.json',
  primaryRetractionBundle,
)
resources.set(
  'resources/provider-source-artifact-retraction.json',
  artifactRetractionBundle,
)
resources.set('resources/questionnaire.json', questionnaire)
resources.set('resources/questionnaire-response.json', questionnaireResponse)
for (const [path, value] of sharedMobileExchange) resources.set(path, value)

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

const eventIdentifiers = new Map()
for (const [path, value] of resources) {
  if (value?.resourceType !== 'Bundle' || value.identifier === undefined)
    continue
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
  schemaVersion: 1,
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

// Validate what we are about to publish, against the release's own model, before it is written.
// The official Validator checks these later in CI; catching a malformed emission here names the
// resource and the element rather than surfacing as a validator report a build later.
const { resourceSchema } = await import('@schmiedmayerlab/grove-fhir/zod/r4')
const nonResourceArtifacts = new Set(['mobile-exchange/corpus.json'])
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

await mkdir(resourceRoot, { recursive: true })
await mkdir(resolve(fixtureRoot, 'mobile-exchange'), { recursive: true })
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
