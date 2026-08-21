//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { argv } from 'node:process'
import { fileURLToPath } from 'node:url'

import { format } from 'prettier'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const catalogRoot = resolve(packageRoot, '.grove-fhir/catalog')
const capabilityPath = resolve(
  packageRoot,
  'catalog/measurement-capabilities.json',
)
const inputPath = resolve(catalogRoot, 'measurement-catalog.json')
const packageGraphPath = resolve(catalogRoot, 'package-graph.json')
const exchangeIdentityPath = resolve(catalogRoot, 'exchange-identity.json')
const profileClaimsPath = resolve(catalogRoot, 'profile-claims.json')
const sensorCatalogPath = resolve(catalogRoot, 'sensor-catalog.json')
const healthConnectAdapterPath = resolve(
  catalogRoot,
  'health-connect-adapter.json',
)
const healthConnectIdentityPath = resolve(
  catalogRoot,
  'health-connect-identity.json',
)
const healthKitAdapterPath = resolve(catalogRoot, 'healthkit-adapter.json')
const sensorKitAdapterPath = resolve(catalogRoot, 'sensorkit-adapter.json')
const sourceRefPath = resolve(packageRoot, 'grove-fhir.json')
const semanticCorpusPath = resolve(
  packageRoot,
  '.grove-fhir/Conformance/corpora/mobile-semantics/corpus.json',
)
const outputPaths = {
  mobile: resolve(packageRoot, 'src/mobile/measurement-catalog.generated.ts'),
  questionnaire: resolve(
    packageRoot,
    'src/questionnaire/contract.generated.ts',
  ),
  provider: resolve(packageRoot, 'src/providers/contract.generated.ts'),
}

const catalog = JSON.parse(await readFile(inputPath, 'utf8'))
const packageGraph = JSON.parse(await readFile(packageGraphPath, 'utf8'))
const exchangeIdentity = JSON.parse(
  await readFile(exchangeIdentityPath, 'utf8'),
)
const profileClaims = JSON.parse(await readFile(profileClaimsPath, 'utf8'))
const sensorCatalog = JSON.parse(await readFile(sensorCatalogPath, 'utf8'))
const healthConnectAdapter = JSON.parse(
  await readFile(healthConnectAdapterPath, 'utf8'),
)
const healthConnectIdentity = JSON.parse(
  await readFile(healthConnectIdentityPath, 'utf8'),
)
const healthKitAdapter = JSON.parse(
  await readFile(healthKitAdapterPath, 'utf8'),
)
const sensorKitAdapter = JSON.parse(
  await readFile(sensorKitAdapterPath, 'utf8'),
)
const sourceRef = JSON.parse(await readFile(sourceRefPath, 'utf8'))
const semanticCorpus = JSON.parse(await readFile(semanticCorpusPath, 'utf8'))
const capabilities = JSON.parse(await readFile(capabilityPath, 'utf8'))
const measurements = catalog.measurements
if (!Array.isArray(measurements) || measurements.length === 0) {
  throw new Error('Measurement catalog must contain measurements.')
}

if (
  semanticCorpus.schemaVersion !== 1 ||
  semanticCorpus.fhirVersion !== '4.0.1' ||
  semanticCorpus.version !== catalog.version ||
  !Array.isArray(semanticCorpus.vectors) ||
  semanticCorpus.vectors.length !== measurements.length
) {
  throw new Error(
    'Mobile semantic corpus must contain one R4 vector per shared measurement.',
  )
}
const semanticVectorIds = semanticCorpus.vectors.map((vector) => vector.id)
if (
  new Set(semanticVectorIds).size !== semanticVectorIds.length ||
  measurements.some(
    (measurement) =>
      !semanticCorpus.vectors.some(
        (vector) =>
          vector.id === measurement.id &&
          vector.profile ===
            `https://grovealliance.org/fhir/mobile/StructureDefinition/${measurement.profile}`,
      ),
  )
) {
  throw new Error(
    'Mobile semantic vector ids and profiles must exactly cover the measurement catalog.',
  )
}

const effectiveCanonicalization = catalog.effectiveCanonicalization
const semanticEffectiveCanonicalization =
  semanticCorpus.effectiveCanonicalization
const expectedEffectiveCanonicalizationVectorIds = [
  'positive-below-half',
  'positive-half-to-even',
  'positive-half-to-next-even',
  'negative-half-to-even',
  'negative-half-to-previous-even',
  'offset-preserved',
]
if (
  effectiveCanonicalization?.precision !== 'millisecond' ||
  effectiveCanonicalization.rounding !== 'half-even' ||
  effectiveCanonicalization.epoch !== '1970-01-01T00:00:00Z' ||
  !effectiveCanonicalization.offsetPolicy?.includes(
    'Preserve the caller/source numeric UTC offset',
  ) ||
  semanticEffectiveCanonicalization?.precision !== 'millisecond' ||
  semanticEffectiveCanonicalization.rounding !== 'half-even' ||
  semanticEffectiveCanonicalization.epoch !== '1970-01-01T00:00:00Z' ||
  semanticEffectiveCanonicalization.offsetPolicy !== 'preserve-source-offset' ||
  !Array.isArray(semanticEffectiveCanonicalization.vectors) ||
  JSON.stringify(
    semanticEffectiveCanonicalization.vectors.map((vector) => vector.id),
  ) !== JSON.stringify(expectedEffectiveCanonicalizationVectorIds) ||
  semanticEffectiveCanonicalization.vectors.some(
    (vector) =>
      typeof vector.input !== 'string' || typeof vector.output !== 'string',
  )
) {
  throw new Error(
    'Mobile effective-time canonicalization contract is incomplete or changed.',
  )
}

const keys = new Set()
for (const measurement of measurements) {
  if (typeof measurement.id !== 'string' || keys.has(measurement.id)) {
    throw new Error(
      `Measurement id is missing or duplicated: ${String(measurement.id)}`,
    )
  }
  keys.add(measurement.id)

  for (const field of ['profile', 'code', 'effective', 'coverage']) {
    if (measurement[field] === undefined) {
      throw new Error(
        `Normative measurement ${measurement.id} is missing ${field}.`,
      )
    }
  }
  if (
    measurement.quantity === null &&
    !['blood-pressure', 'sleep-stage'].includes(measurement.id)
  ) {
    throw new Error(
      `Normative measurement ${measurement.id} requires a quantity definition.`,
    )
  }

  const supportedSources = Object.values(measurement.coverage).filter(
    (status) => status === 'supported',
  )
  if (supportedSources.length < 2) {
    throw new Error(
      `Shared Mobile measurement ${measurement.id} requires at least two evidenced supported sources.`,
    )
  }
}

const implemented = Object.fromEntries(
  measurements.map((measurement) => [measurement.id, measurement]),
)

const bloodPressure = measurements.find(
  (measurement) => measurement.id === 'blood-pressure',
)
if (
  bloodPressure?.components?.length !== 2 ||
  bloodPressure.components[0]?.id !== 'systolic' ||
  bloodPressure.components[1]?.id !== 'diastolic'
) {
  throw new Error(
    'Blood pressure requires ordered systolic and diastolic component contracts.',
  )
}

for (const component of bloodPressure.components) {
  if (
    typeof component.system !== 'string' ||
    typeof component.code !== 'string' ||
    typeof component.quantity?.system !== 'string' ||
    typeof component.quantity.code !== 'string'
  ) {
    throw new Error('Blood-pressure component coding is incomplete.')
  }
}

const sleepStage = measurements.find(
  (measurement) => measurement.id === 'sleep-stage',
)
if (
  typeof sleepStage?.resultCodeSystem !== 'string' ||
  typeof sleepStage.valueSet !== 'string' ||
  !Array.isArray(sleepStage.allowedValues) ||
  sleepStage.allowedValues.join(',') !==
    'awake,in-bed,out-of-bed,asleep-unspecified,light,deep,rem,unknown'
) {
  throw new Error('Sleep-stage terminology contract is incomplete.')
}

if (packageGraph.fhirVersion !== '4.0.1' || catalog.fhirVersion !== '4.0.1') {
  throw new Error(
    'The TypeScript package consumes FHIR R4 (4.0.1) catalogs only.',
  )
}

for (const consumedCatalog of [
  sensorCatalog,
  healthConnectAdapter,
  healthConnectIdentity,
  healthKitAdapter,
  sensorKitAdapter,
]) {
  if (
    consumedCatalog.fhirVersion !== '4.0.1' ||
    consumedCatalog.version !== packageGraph.version
  ) {
    throw new Error(
      'Every consumed IG catalog must target the same FHIR R4 release.',
    )
  }
}

if (
  sourceRef.repository !== 'https://github.com/SchmiedmayerLab/grove-fhir' ||
  !/^[\da-f]{40}$/u.test(sourceRef.sha)
) {
  throw new Error('The IG commit these catalogs were read from must be pinned.')
}

const packages = Object.fromEntries(
  packageGraph.packages.map((entry) => [entry.source, entry]),
)
for (const source of [
  'mobile',
  'questionnaire',
  'sensor',
  'sensorkit',
  'healthkit',
  'health-connect',
  'providers',
]) {
  if (packages[source] === undefined) {
    throw new Error(`Package graph is missing ${source}.`)
  }
}

const packageMetadata = (source) => {
  const entry = packages[source]
  return {
    fhirVersion: packageGraph.fhirVersion,
    version: packageGraph.version,
    packageId: entry.packageId,
    canonical: entry.canonical,
    dependencies: entry.dependencies,
  }
}
const mobilePackageMetadata = packageMetadata('mobile')
const questionnairePackageMetadata = packageMetadata('questionnaire')
const providerPackageMetadata = packageMetadata('providers')

const profiles = {}
const packageCanonicals = {}
for (const entry of packageGraph.packages) {
  packageCanonicals[entry.source] = entry.canonical
  for (const profile of entry.profiles) {
    if (profiles[profile] !== undefined) {
      throw new Error(`Profile id is duplicated: ${profile}.`)
    }
    profiles[profile] = `${entry.canonical}/StructureDefinition/${profile}`
  }
}

for (const measurement of measurements) {
  if (profiles[measurement.profile] === undefined) {
    throw new Error(
      `Measurement ${measurement.id} refers to unknown profile ${measurement.profile}.`,
    )
  }
}

const selectEntries = (source, keys) =>
  Object.fromEntries(
    keys.map((key) => {
      if (!Object.hasOwn(source, key) || source[key] === undefined) {
        throw new Error(`Generated contract is missing required key ${key}.`)
      }
      return [key, source[key]]
    }),
  )

const questionnaireProfiles = selectEntries(profiles, [
  'grove-questionnaire',
  'grove-questionnaire-response',
])
const providerProfiles = selectEntries(profiles, [
  ...measurements.map((measurement) => measurement.profile),
  'grove-application-device',
  'grove-mobile-exchange-bundle',
  'grove-recording-device',
  'grove-sensor-recording-document',
  'provider-conversion-provenance',
  'provider-observation',
  'provider-recording-document',
])
const providerPackageCanonicals = selectEntries(packageCanonicals, [
  'mobile',
  'sensor',
  'providers',
])

if (
  profileClaims.fhirVersion !== '4.0.1' ||
  profileClaims.observationAdapterClaim?.cardinality !== 2 ||
  profileClaims.observationAdapterClaim?.inheritedProfilesAreNotDeclared !==
    true ||
  !profileClaims.observationAdapterClaim?.adapterProfiles?.includes(
    profiles['provider-observation'],
  ) ||
  !profileClaims.observationAdapterClaim?.forbiddenExplicitProfiles?.includes(
    profiles['grove-mobile-observation'],
  )
) {
  throw new Error('Observation direct-profile claim is incomplete.')
}

const expectedHealthConnectGlucoseProfiles = [
  'health-connect-capillary-blood-glucose',
  'health-connect-interstitial-glucose',
  'health-connect-serum-plasma-glucose',
  'health-connect-whole-blood-glucose',
].map((profile) => profiles[profile])
const connectedRecordingClaim = profileClaims.providerRecordingDocumentClaim
const connectedProvenanceClaim =
  profileClaims.adapterConversionProvenanceClaims?.find(
    (claim) => claim.adapter === 'providers',
  )
if (
  profileClaims.healthConnectProviderSpecificClaims?.cardinality !== 1 ||
  expectedHealthConnectGlucoseProfiles.some(
    (profile) =>
      !profileClaims.healthConnectProviderSpecificClaims.profiles.includes(
        profile,
      ),
  ) ||
  connectedRecordingClaim?.cardinality !== 2 ||
  connectedRecordingClaim.profiles?.[0] !==
    profiles['grove-sensor-recording-document'] ||
  connectedRecordingClaim.profiles?.[1] !==
    profiles['provider-recording-document'] ||
  connectedProvenanceClaim?.profile !==
    profiles['provider-conversion-provenance']
) {
  throw new Error('Adapter-specific profile claims are incomplete.')
}

const expectedSensorContracts = new Map([
  ['sampled-data', profiles['grove-sensor-sampled-data-observation']],
  ['ecg', profiles['grove-sensor-ecg-observation']],
  ['recording-document', profiles['grove-sensor-recording-document']],
  ['conversion-provenance', profiles['grove-sensor-conversion-provenance']],
])
if (
  sensorCatalog.contracts?.length !== expectedSensorContracts.size ||
  sensorCatalog.contracts.some(
    (contract) => expectedSensorContracts.get(contract.id) !== contract.profile,
  )
) {
  throw new Error('Sensor contracts do not match the package graph profiles.')
}
const rawPayloadAssertions = [
  'caller-authorized-opaque-payload',
  'verified-sanitized-input',
]
const sensorRecordingContract = sensorCatalog.contracts.find(
  (contract) => contract.id === 'recording-document',
)
if (
  sensorRecordingContract?.payloadAdmission?.requiredProducerInput !==
    'exactly one explicit caller assertion before emission' ||
  sensorRecordingContract.payloadAdmission.allowedAssertions?.join(',') !==
    rawPayloadAssertions.join(',')
) {
  throw new Error('Sensor raw-payload admission assertions are incomplete.')
}

if (
  healthConnectAdapter.source?.recordTypeCount !== 41 ||
  healthConnectAdapter.recordTypes?.length !== 41
) {
  throw new Error(
    'Health Connect source inventory must contain all 41 Record types.',
  )
}
const healthConnectProviderSpecificMeasurements = new Set([
  'blood-glucose',
  'capillary-blood-glucose',
  'interstitial-glucose',
  'serum-plasma-glucose',
])
for (const recordType of healthConnectAdapter.recordTypes) {
  for (const output of recordType.outputs ?? []) {
    if (
      implemented[output.measurement] === undefined &&
      !healthConnectProviderSpecificMeasurements.has(output.measurement)
    ) {
      throw new Error(
        `Health Connect ${recordType.token} refers to unknown measurement ${output.measurement}.`,
      )
    }
  }
}

const healthConnectSpecimens =
  healthConnectAdapter.contextMappings?.bloodGlucoseSpecimen?.values
if (
  !Array.isArray(healthConnectSpecimens) ||
  healthConnectSpecimens.filter((entry) => entry.status === 'supported')
    .length !== 5 ||
  !healthConnectSpecimens.some(
    (entry) =>
      entry.id === 'tears' && entry.status === 'intentionally-unsupported',
  ) ||
  !healthConnectSpecimens.some(
    (entry) =>
      entry.id === 'unknown' && entry.status === 'intentionally-unsupported',
  )
) {
  throw new Error('Health Connect glucose specimen mapping must fail closed.')
}

const healthConnectStages = healthConnectAdapter.contextMappings?.sleepStage
if (
  healthConnectStages?.sourceCodeSystem !==
    'https://grovealliance.org/fhir/health-connect/CodeSystem/health-connect-sleep-stage' ||
  healthConnectStages.values?.length !== 8 ||
  healthConnectStages.values.some(
    (entry) => !sleepStage.allowedValues.includes(entry.shared),
  )
) {
  throw new Error('Health Connect sleep-stage mapping is incomplete.')
}

if (
  healthConnectIdentity.digest?.algorithm !== 'SHA-256' ||
  healthConnectIdentity.vectors?.length !== 7 ||
  healthConnectIdentity.canonicalizationVectors?.length !== 3
) {
  throw new Error(
    'Health Connect deterministic identity vectors are incomplete.',
  )
}

const healthKitSourceRowCount = healthKitAdapter.source?.rowCount
const healthKitDerivedAggregateCount =
  healthKitAdapter.source?.derivedAggregateCount ?? 0
const healthKitRows = healthKitAdapter.rows
const healthKitDerivedAggregates = healthKitAdapter.derivedAggregates ?? []
const healthKitStatusVocabulary = new Set(
  Object.keys(healthKitAdapter.statusVocabulary ?? {}),
)
if (
  !Number.isInteger(healthKitSourceRowCount) ||
  healthKitSourceRowCount <= 0 ||
  !Array.isArray(healthKitRows) ||
  healthKitRows.length !== healthKitSourceRowCount ||
  new Set(healthKitRows.map((entry) => entry.sourceTypeIdentifier)).size !==
    healthKitSourceRowCount ||
  healthKitRows.some(
    (entry) =>
      typeof entry.sourceTypeIdentifier !== 'string' ||
      entry.sourceTypeIdentifier.trim().length === 0 ||
      !healthKitStatusVocabulary.has(entry.status) ||
      !Array.isArray(entry.measurementIDs) ||
      !Array.isArray(entry.profiles),
  )
) {
  throw new Error(
    'HealthKit source rows must exactly match the catalog-owned public source inventory.',
  )
}
if (
  !Number.isInteger(healthKitDerivedAggregateCount) ||
  healthKitDerivedAggregateCount < 0 ||
  !Array.isArray(healthKitDerivedAggregates) ||
  healthKitDerivedAggregates.length !== healthKitDerivedAggregateCount ||
  new Set(healthKitDerivedAggregates.map((entry) => entry.id)).size !==
    healthKitDerivedAggregateCount ||
  healthKitDerivedAggregates.some(
    (entry) =>
      typeof entry.id !== 'string' ||
      entry.id.trim().length === 0 ||
      !healthKitStatusVocabulary.has(entry.status) ||
      !Array.isArray(entry.sourceTypeIdentifiers) ||
      entry.sourceTypeIdentifiers.length === 0 ||
      !Array.isArray(entry.measurementIDs) ||
      !Array.isArray(entry.profiles),
  )
) {
  throw new Error(
    'HealthKit derived aggregates must remain a complete, separate catalog-owned inventory.',
  )
}

const expectedConnectedProviders = ['google-health-api', 'oura', 'withings']
const providerAdapterPath = resolve(catalogRoot, 'providers-adapter.json')
const providerAdapter = JSON.parse(await readFile(providerAdapterPath, 'utf8'))
if (
  providerAdapter.fhirVersion !== '4.0.1' ||
  providerAdapter.version !== packageGraph.version ||
  providerAdapter.packageId !== 'org.grovealliance.fhir.providers' ||
  providerAdapter.canonical !== packageCanonicals['providers'] ||
  providerAdapter.adapterProfile !== profiles['provider-observation'] ||
  providerAdapter.recordingDocument?.sourceNeutralProfile !==
    profiles['grove-sensor-recording-document'] ||
  providerAdapter.recordingDocument?.adapterProfile !==
    profiles['provider-recording-document'] ||
  providerAdapter.recordingDocument?.outputDiscriminator !==
    'native-recording' ||
  providerAdapter.rawPayloadAdmission?.allowedAssertions?.join(',') !==
    rawPayloadAssertions.join(',') ||
  providerAdapter.rawPayloadAdmission?.notFHIRAuthorization !== true ||
  providerAdapter.conversionProvenanceProfile !==
    profiles['provider-conversion-provenance'] ||
  providerAdapter.sourceTypeExtension?.url !==
    `${packageCanonicals['providers']}/StructureDefinition/provider-source-type` ||
  providerAdapter.sourceTypeExtension?.codeSystem !==
    `${packageCanonicals['providers']}/CodeSystem/provider-source-type`
) {
  throw new Error('Provider adapter catalog metadata is inconsistent.')
}

if (
  !Array.isArray(providerAdapter.providers) ||
  providerAdapter.providers.map((provider) => provider.id).join(',') !==
    expectedConnectedProviders.join(',')
) {
  throw new Error('Provider providers must be the exact closed provider set.')
}

const providerScalarMappings = {}
const providerRawMappings = {}
const providerRecordEffectiveRules = {}
const completeCivilDayEffectiveRule =
  'the source civil day represented as a complete day Period; midpoint substitution is forbidden'
for (const provider of providerAdapter.providers) {
  if (
    provider.sourceTypes?.length !== provider.sourceTypeCount ||
    new Set(provider.sourceTypes.map((entry) => entry.token)).size !==
      provider.sourceTypeCount
  ) {
    throw new Error(`Provider ${provider.id} source inventory is incomplete.`)
  }

  const sourceMappings = {}
  const rawSourceMappings = {}
  const recordEffectiveRules = {}
  for (const sourceType of provider.sourceTypes) {
    const supportedElements = (sourceType.elements ?? []).filter(
      (element) => element.status === 'supported',
    )
    const measurementIds = [
      ...new Set(
        (sourceType.elements ?? [])
          .filter(
            (element) =>
              element.status === 'supported' &&
              element.groupedMapping === undefined,
          )
          .flatMap((element) => element.measurementIds ?? []),
      ),
    ]
    for (const measurementId of measurementIds) {
      if (implemented[measurementId] === undefined) {
        throw new Error(
          `Provider ${provider.id}/${sourceType.token} refers to unknown measurement ${measurementId}.`,
        )
      }
    }
    if (measurementIds.length > 0) {
      sourceMappings[sourceType.token] = Object.fromEntries(
        measurementIds.map((measurementId) => [measurementId, measurementId]),
      )
    }
    const effectiveRules = [
      ...new Set(
        supportedElements
          .map((element) => element.effective)
          .filter((rule) => typeof rule === 'string'),
      ),
    ]
    if (effectiveRules.includes(completeCivilDayEffectiveRule)) {
      if (
        effectiveRules.length !== 1 ||
        supportedElements.some(
          (element) => element.effective !== completeCivilDayEffectiveRule,
        )
      ) {
        throw new Error(
          `Provider ${provider.id}/${sourceType.token} mixes complete-civil-day and incompatible effective rules.`,
        )
      }
      recordEffectiveRules[sourceType.token] = {
        kind: 'complete-civil-day-period',
        measurementIds,
        outputsShareEffective: true,
      }
    }
    const rawElements = (sourceType.elements ?? []).filter(
      (element) => element.status === 'mapped-standard',
    )
    if (rawElements.length > 0) {
      if (
        rawElements.some(
          (element) =>
            element.sensorProfile !==
            profiles['grove-sensor-recording-document'],
        )
      ) {
        throw new Error(
          `Provider ${provider.id}/${sourceType.token} has an unreviewed raw mapping.`,
        )
      }
      rawSourceMappings[sourceType.token] =
        providerAdapter.recordingDocument.outputDiscriminator
    }
  }
  for (const grouped of provider.groupedMappings ?? []) {
    if (
      grouped.status !== 'supported' ||
      typeof grouped.token !== 'string' ||
      typeof grouped.outputDiscriminator !== 'string' ||
      !Array.isArray(grouped.measurementIds) ||
      grouped.measurementIds.length === 0
    ) {
      throw new Error(`Provider ${provider.id} grouped mapping is incomplete.`)
    }
    for (const measurementId of grouped.measurementIds) {
      if (implemented[measurementId] === undefined) {
        throw new Error(
          `Provider ${provider.id}/${grouped.token} refers to unknown measurement ${measurementId}.`,
        )
      }
    }
    sourceMappings[grouped.token] = Object.fromEntries(
      grouped.measurementIds.map((measurementId) => [
        measurementId,
        grouped.outputDiscriminator,
      ]),
    )
  }
  for (const [sourceType, mappings] of Object.entries(sourceMappings)) {
    const discriminators = Object.values(mappings)
    if (new Set(discriminators).size !== discriminators.length) {
      throw new Error(
        `Provider ${provider.id}/${sourceType} output discriminators must be unique.`,
      )
    }
  }
  providerScalarMappings[provider.id] = sourceMappings
  providerRawMappings[provider.id] = rawSourceMappings
  if (Object.keys(recordEffectiveRules).length > 0) {
    providerRecordEffectiveRules[provider.id] = recordEffectiveRules
  }
}

if (
  JSON.stringify(providerRecordEffectiveRules) !==
  JSON.stringify({
    oura: {
      daily_activity: {
        kind: 'complete-civil-day-period',
        measurementIds: ['step-count', 'active-energy', 'distance'],
        outputsShareEffective: true,
      },
    },
    withings: {
      'getactivity:steps': {
        kind: 'complete-civil-day-period',
        measurementIds: ['step-count'],
        outputsShareEffective: true,
      },
      'getactivity:distance': {
        kind: 'complete-civil-day-period',
        measurementIds: ['distance'],
        outputsShareEffective: true,
      },
      'getactivity:calories': {
        kind: 'complete-civil-day-period',
        measurementIds: ['active-energy'],
        outputsShareEffective: true,
      },
    },
  })
) {
  throw new Error(
    'Provider complete-civil-day record rules changed unexpectedly.',
  )
}

if (
  Object.values(providerRawMappings).flatMap((mapping) => Object.keys(mapping))
    .length !== 4
) {
  throw new Error('Provider must admit exactly four raw source tokens.')
}

const providerIdentity = providerAdapter.identity
if (
  providerIdentity?.digest !==
    'SHA-256 over the UTF-8 preimage, lowercase hexadecimal, prefixed with v1:' ||
  providerIdentity.sourceRecord?.system !==
    'https://grovealliance.org/fhir/providers/NamingSystem/provider-source-record-id' ||
  providerIdentity.output?.system !==
    'https://grovealliance.org/fhir/providers/NamingSystem/provider-output-id' ||
  providerIdentity.output?.outputDiscriminatorRule
    ?.ordinarySupportedMeasurement !==
    'the exact measurementId string from the supported element mapping' ||
  providerIdentity.output?.outputDiscriminatorRule?.groupedMapping !==
    'the exact outputDiscriminator declared on that groupedMappings row' ||
  providerIdentity.output?.outputDiscriminatorRule?.mappedStandardRaw !==
    'native-recording' ||
  providerIdentity.output?.outputDiscriminatorRule?.noFallback !== true ||
  providerIdentity.vectors?.length !== 5 ||
  providerIdentity.vectors.filter((vector) => vector.role === 'sourceRecord')
    .length !== 3 ||
  providerIdentity.vectors.filter((vector) => vector.role === 'output')
    .length !== 2 ||
  providerIdentity.conversion?.system !==
    'https://grovealliance.org/fhir/providers/NamingSystem/provider-conversion-id' ||
  providerIdentity.exchange?.system !==
    'https://grovealliance.org/fhir/providers/NamingSystem/provider-exchange-id'
) {
  throw new Error('Provider deterministic identity contract is incomplete.')
}

const providerAdmittedMeasurements = new Set(
  Object.values(providerScalarMappings).flatMap((sourceMappings) =>
    Object.values(sourceMappings).flatMap((mapping) => Object.keys(mapping)),
  ),
)
for (const row of healthKitAdapter.rows) {
  for (const measurement of row.measurementIDs) {
    const expectedProfiles =
      measurement === 'electrocardiogram' ?
        [
          profiles['grove-sensor-ecg-observation'],
          profiles['healthkit-ecg-observation'],
        ]
      : measurement === 'body-mass-index' ?
        [
          'http://hl7.org/fhir/StructureDefinition/bmi',
          profiles['healthkit-observation'],
        ]
      : [profiles[implemented[measurement]?.profile]]
    if (
      expectedProfiles.some(
        (expectedProfile) => !row.profiles.includes(expectedProfile),
      )
    ) {
      throw new Error(
        `HealthKit ${row.sourceTypeIdentifier} refers to an unknown or mismatched measurement ${measurement}.`,
      )
    }
  }
}

if (
  exchangeIdentity.profile !== profiles['grove-mobile-exchange-bundle'] ||
  typeof exchangeIdentity.entryIdentifierExtension !== 'string' ||
  exchangeIdentity.fullUrlAlgorithm?.name !== 'uuid-v5-jcs-identifier-v1'
) {
  throw new Error('Exchange identity catalog is incomplete or inconsistent.')
}

for (const vector of exchangeIdentity.vectors ?? []) {
  if (
    typeof vector.system !== 'string' ||
    typeof vector.value !== 'string' ||
    typeof vector.input !== 'string' ||
    typeof vector.fullUrl !== 'string'
  ) {
    throw new Error('Exchange identity vectors must be complete.')
  }
}

const implementedCapabilities = capabilities.measurements?.filter(
  (measurement) => measurement.status === 'implemented',
)
const recordingCapabilities = capabilities.measurements?.filter(
  (measurement) => measurement.status === 'implemented-recording',
)
const adapterProfiledCapabilities = capabilities.measurements?.filter(
  (measurement) => measurement.status === 'adapter-profiled',
)
const capabilityKeys = capabilities.measurements?.map((entry) => entry.key)
const capabilityStatuses = new Set(Object.keys(capabilities.statuses ?? {}))
if (
  !Array.isArray(capabilityKeys) ||
  new Set(capabilityKeys).size !== capabilityKeys.length ||
  capabilities.measurements.some(
    (entry) =>
      !capabilityStatuses.has(entry.status) ||
      !Array.isArray(entry.sources) ||
      entry.sources.length === 0,
  )
) {
  throw new Error(
    'Capability matrix rows require unique keys, known statuses, and source coverage.',
  )
}
if (
  !Array.isArray(implementedCapabilities) ||
  implementedCapabilities.length !== providerAdmittedMeasurements.size
) {
  throw new Error(
    'Capability matrix implemented rows must exactly match the Provider facade.',
  )
}
const rawMappingRows = Object.entries(providerRawMappings).flatMap(
  ([provider, mappings]) =>
    Object.entries(mappings).map(([sourceType, outputDiscriminator]) => ({
      provider,
      sourceType,
      outputDiscriminator,
    })),
)
if (
  !Array.isArray(recordingCapabilities) ||
  recordingCapabilities.length !== rawMappingRows.length ||
  rawMappingRows.some(
    (mapping) =>
      !recordingCapabilities.some(
        (capability) =>
          capability.provider === mapping.provider &&
          capability.sourceType === mapping.sourceType &&
          capability.outputDiscriminator === mapping.outputDiscriminator &&
          capability.profile === profiles['provider-recording-document'] &&
          capability.sourceNeutralProfile ===
            profiles['grove-sensor-recording-document'],
      ),
  )
) {
  throw new Error(
    'Capability matrix native-recording rows must exactly match the Provider catalog.',
  )
}
const expectedAdapterProfiledCapabilities = new Map([
  ['body-mass-index', 'http://hl7.org/fhir/StructureDefinition/bmi'],
  ['blood-glucose', profiles['health-connect-whole-blood-glucose']],
  [
    'capillary-blood-glucose',
    profiles['health-connect-capillary-blood-glucose'],
  ],
  ['serum-plasma-glucose', profiles['health-connect-serum-plasma-glucose']],
  ['interstitial-glucose', profiles['health-connect-interstitial-glucose']],
])
if (
  !Array.isArray(adapterProfiledCapabilities) ||
  adapterProfiledCapabilities.length !==
    expectedAdapterProfiledCapabilities.size ||
  adapterProfiledCapabilities.some(
    (capability) =>
      expectedAdapterProfiledCapabilities.get(capability.key) !==
      capability.profile,
  )
) {
  throw new Error(
    'Capability matrix adapter-profiled rows must match the IG profile claims.',
  )
}
for (const normative of measurements) {
  const capability = capabilities.measurements.find(
    (entry) => entry.key === normative.id,
  )
  const admitted = providerAdmittedMeasurements.has(normative.id)
  if (
    capability === undefined ||
    capability.status !==
      (admitted ? 'implemented' : 'profiled-not-admitted') ||
    capability.profile !== normative.profile ||
    capability.effective !== normative.effective ||
    capability.code?.system !== normative.code.system ||
    capability.code?.code !== normative.code.code ||
    (normative.quantity !== null &&
      capability.unit?.code !== normative.quantity.code) ||
    !Array.isArray(capability.sources)
  ) {
    throw new Error(
      `Implemented capability ${String(capability.key)} does not match the shared IG catalog.`,
    )
  }
}

const generated = {
  sourceRef,
  packageGraph,
  mobilePackageMetadata,
  questionnairePackageMetadata,
  providerPackageMetadata,
  exchangeIdentity,
  profileClaims,
  packageCanonicals,
  profiles,
  measurements: implemented,
  effectiveCanonicalization,
  effectiveCanonicalizationVectors: semanticEffectiveCanonicalization.vectors,
  providerAdapter,
  providerScalarMappings,
  providerRawMappings,
  providerRecordEffectiveRules,
  questionnaireProfiles,
  providerProfiles,
  providerPackageCanonicals,
}

const sharedMobileSemanticCatalog = Object.fromEntries(
  Object.entries(implemented).map(([id, definition]) => {
    const semantic = { ...definition }
    delete semantic.coverage
    delete semantic.coverageDetails
    return [id, semantic]
  }),
)

for (const value of Object.values(generated)) {
  if (value === undefined) {
    throw new Error('Generated catalog values must be defined.')
  }
}

const frozenExport = (name, value) => {
  const valueName = `${name}Value`
  return `const ${valueName} = ${JSON.stringify(value, null, 2)} as const

export const ${name}: typeof ${valueName} = deepFreeze(${valueName})`
}

const header = (disableClearText) => `//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//
// Generated by scripts/generate-measurement-catalog.mjs. Do not edit directly.

${disableClearText ? '/* eslint-disable sonarjs/no-clear-text-protocols */\n' : ''}

import { deepFreeze } from '../core/index.js'

`
const versions = `export const groveFhirContractVersion = ${JSON.stringify(packageGraph.version)} as const

export const groveFhirVersion = ${JSON.stringify(packageGraph.fhirVersion)} as const
`

const mobileUnformattedOutput = `${header(true)}${versions}

${frozenExport('groveMobilePackageMetadata', mobilePackageMetadata)}

${frozenExport('groveFhirExchangeIdentity', exchangeIdentity)}

${frozenExport('sharedMobileMeasurementCatalog', sharedMobileSemanticCatalog)}

${frozenExport('mobileEffectiveCanonicalization', effectiveCanonicalization)}

${frozenExport('mobileEffectiveCanonicalizationVectors', semanticEffectiveCanonicalization.vectors)}

export type SharedMobileMeasurementKind = keyof typeof sharedMobileMeasurementCatalog
`

const questionnaireUnformattedOutput = `${header(false)}${versions}

${frozenExport('groveQuestionnairePackageMetadata', questionnairePackageMetadata)}

${frozenExport('groveQuestionnaireProfileCanonicals', questionnaireProfiles)}
`

const providerUnformattedOutput = `${header(false)}${versions}

${frozenExport('groveProviderPackageMetadata', providerPackageMetadata)}

${frozenExport('groveProviderPackageCanonicals', providerPackageCanonicals)}

${frozenExport('groveProviderProfileCanonicals', providerProfiles)}

${frozenExport('providerAdapterCatalog', providerAdapter)}

${frozenExport('providerScalarMappings', providerScalarMappings)}

${frozenExport('providerRecordEffectiveRules', providerRecordEffectiveRules)}

${frozenExport('providerRawMappings', providerRawMappings)}

export type ProviderScalarMappings = typeof providerScalarMappings

export type ProviderRecordEffectiveRules = typeof providerRecordEffectiveRules

export type ProviderRawMappings = typeof providerRawMappings
`

const unformattedOutputs = {
  mobile: mobileUnformattedOutput,
  questionnaire: questionnaireUnformattedOutput,
  provider: providerUnformattedOutput,
}
for (const [scope, unformattedOutput] of Object.entries(unformattedOutputs)) {
  const output = await format(unformattedOutput, {
    parser: 'typescript',
    semi: false,
    singleQuote: true,
  })
  const outputPath = outputPaths[scope]
  if (argv.includes('--check')) {
    const existing = await readFile(outputPath, 'utf8')
    if (existing !== output) {
      throw new Error(
        `Generated ${scope} catalog is stale. Run npm run generate:catalog.`,
      )
    }
  } else {
    await writeFile(outputPath, output)
  }
}
