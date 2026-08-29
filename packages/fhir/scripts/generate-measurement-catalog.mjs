//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { readFile, writeFile } from 'node:fs/promises'
import { argv } from 'node:process'
import { URL } from 'node:url'

import { format } from 'prettier'

import { loadMeasurementCatalogInputs } from './measurement-catalog-inputs.mjs'
import { renderMeasurementCatalogSources } from './measurement-catalog-renderer.mjs'

const {
  capabilities,
  catalog,
  exchangeCorpus,
  exchangeProtocol,
  formatRegistry,
  healthConnectAdapter,
  healthKitAdapter,
  outputPaths,
  packageGraph,
  profileClaims,
  providerAdapter,
  semanticCorpus,
  sensorCatalog,
  sensorKitAdapter,
  sourceRef,
} = await loadMeasurementCatalogInputs(import.meta.url, argv)

const adapterOwners = [
  'google-health',
  'healthkit',
  'health-connect',
  'oura',
  'providers',
  'sensorkit',
  'withings',
]
const uniqueNonemptyStrings = (values) =>
  Array.isArray(values) &&
  values.length > 0 &&
  values.every((value) => typeof value === 'string' && value.length > 0) &&
  new Set(values).size === values.length
const isMobileOwned = (measurement) =>
  measurement.owner === undefined || measurement.owner === 'mobile'

const measurements = catalog.measurements
if (!Array.isArray(measurements) || measurements.length === 0) {
  throw new Error('Measurement catalog must contain measurements.')
}

const mobileMeasurements = measurements.filter(isMobileOwned)
if (
  semanticCorpus.schemaVersion !== 0 ||
  semanticCorpus.fhirVersion !== '4.0.1' ||
  semanticCorpus.version !== catalog.version ||
  !Array.isArray(semanticCorpus.vectors) ||
  semanticCorpus.vectors.length !== mobileMeasurements.length
) {
  throw new Error(
    'Mobile semantic corpus must contain one R4 vector per shared measurement.',
  )
}
const semanticVectorIds = semanticCorpus.vectors.map((vector) => vector.id)
if (
  new Set(semanticVectorIds).size !== semanticVectorIds.length ||
  mobileMeasurements.some(
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
const standardVitalProfiles = new Set(
  [
    'bp',
    'bodyheight',
    'bodytemp',
    'bodyweight',
    'heartrate',
    'oxygensat',
    'resprate',
  ].map((id) => `http://hl7.org/fhir/StructureDefinition/${id}`),
)
const vitalSignsCategory = {
  system: 'http://terminology.hl7.org/CodeSystem/observation-category',
  code: 'vital-signs',
  display: 'Vital Signs',
}
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
    measurement.owner !== undefined &&
    !adapterOwners.includes(measurement.owner)
  ) {
    throw new Error(
      `Normative measurement ${measurement.id} declares unknown owner ${String(measurement.owner)}.`,
    )
  }
  if (
    measurement.category !== undefined &&
    (typeof measurement.category !== 'object' ||
      measurement.category === null ||
      ['system', 'code', 'display'].some(
        (field) =>
          typeof measurement.category[field] !== 'string' ||
          measurement.category[field].trim() === '',
      ))
  ) {
    throw new Error(
      `Normative measurement ${measurement.id} has an incomplete Observation category.`,
    )
  }
  if (
    standardVitalProfiles.has(measurement.standardProfile) &&
    JSON.stringify(measurement.category) !== JSON.stringify(vitalSignsCategory)
  ) {
    throw new Error(
      `Standard vital-sign measurement ${measurement.id} must materialize its inherited vital-signs category.`,
    )
  }
  if (measurement.valueKind === 'quantity') {
    if (measurement.quantity === null) {
      throw new Error(
        `Normative measurement ${measurement.id} requires a quantity definition.`,
      )
    }
  } else if (measurement.valueKind === 'codeableConcept') {
    if (
      measurement.quantity !== null ||
      typeof measurement.resultCodeSystem !== 'string' ||
      typeof measurement.valueSet !== 'string' ||
      !Array.isArray(measurement.allowedValues) ||
      measurement.allowedValues.length === 0
    ) {
      throw new Error(
        `Normative measurement ${measurement.id} requires a closed coded-result contract.`,
      )
    }
  } else if (measurement.valueKind === 'dateTime') {
    if (measurement.quantity !== null) {
      throw new Error(
        `Date-time measurement ${measurement.id} must not declare a quantity.`,
      )
    }
  } else if (measurement.valueKind === 'grouping') {
    // A panel states its members rather than a value of its own, so it declares neither a quantity
    // nor a coded result; the members are complete Observations that stand alone.
    if (measurement.quantity !== null) {
      throw new Error(
        `Grouping measurement ${measurement.id} must not declare a quantity.`,
      )
    }
  } else if (
    measurement.valueKind !== 'components' ||
    measurement.quantity !== null
  ) {
    throw new Error(
      `Normative measurement ${measurement.id} declares unknown value kind ${String(measurement.valueKind)}.`,
    )
  }

  const supportedSources = Object.values(measurement.coverage).filter(
    (status) => status === 'supported',
  )
  const evidencedSources = Object.values(measurement.coverage).filter(
    (status) => ['platform-exclusive', 'supported'].includes(status),
  )
  if (isMobileOwned(measurement) && supportedSources.length < 2) {
    throw new Error(
      `Shared Mobile measurement ${measurement.id} requires at least two evidenced supported sources.`,
    )
  }
  if (evidencedSources.length === 0) {
    throw new Error(
      `Normative measurement ${measurement.id} requires at least one evidenced supported source.`,
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

const pinnedRef = sourceRef.ref
if (
  sourceRef.repository !== 'https://github.com/SchmiedmayerLab/grove-fhir' ||
  typeof pinnedRef !== 'string' ||
  !/^[\da-f]{40}$/u.test(pinnedRef) ||
  typeof sourceRef.archiveSha256 !== 'string' ||
  !/^[\da-f]{64}$/u.test(sourceRef.archiveSha256)
) {
  throw new Error(
    'The IG catalogs must be pinned by an immutable commit and exact archive SHA-256.',
  )
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
const mobileProfiles = selectEntries(profiles, [
  'grove-application-device',
  'grove-host-device',
  'grove-mobile-conversion-provenance',
  'grove-mobile-exchange-bundle',
  'grove-mobile-retraction-bundle',
  'grove-mobile-retraction-provenance',
  'grove-recording-device',
  'grove-sensor-recording-document',
])
const providerObservationProfileIds = providerAdapter.providers.map(
  ({ id, observationProfile }) => {
    const profile = Object.entries(profiles).find(
      ([, canonical]) => canonical === observationProfile,
    )?.[0]
    if (profile === undefined) {
      throw new Error(
        `Provider ${id} refers to unknown Observation profile ${String(observationProfile)}.`,
      )
    }
    return profile
  },
)
const providerProfiles = selectEntries(profiles, [
  ...measurements.map((measurement) => measurement.profile),
  ...providerObservationProfileIds,
  'grove-application-device',
  'grove-host-device',
  'grove-mobile-conversion-provenance',
  'grove-mobile-exchange-bundle',
  'grove-mobile-retraction-bundle',
  'grove-mobile-retraction-provenance',
  'grove-recording-device',
  'grove-sensor-recording-document',
  'providers-conversion-provenance',
  'providers-observation',
  'providers-recording-document',
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
  profileClaims.observationAdapterClaim?.adapterProfiles?.includes(
    profiles['providers-observation'],
  ) ||
  !providerAdapter.providers.every(({ observationProfile }) =>
    profileClaims.observationAdapterClaim?.adapterProfiles?.includes(
      observationProfile,
    ),
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
  profileClaims.healthConnectPlatformExclusiveClaims?.cardinality !== 1 ||
  expectedHealthConnectGlucoseProfiles.some(
    (profile) =>
      !profileClaims.healthConnectPlatformExclusiveClaims.profiles.includes(
        profile,
      ),
  ) ||
  connectedRecordingClaim?.cardinality !== 2 ||
  connectedRecordingClaim.profiles?.[0] !==
    profiles['grove-sensor-recording-document'] ||
  connectedRecordingClaim.profiles?.[1] !==
    profiles['providers-recording-document'] ||
  connectedProvenanceClaim?.profile !==
    profiles['providers-conversion-provenance']
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

const healthConnectDataOriginApplication =
  healthConnectAdapter.dataOriginApplication
if (
  healthConnectDataOriginApplication?.sourceField !==
    'Metadata.dataOrigin.packageName' ||
  healthConnectDataOriginApplication.r4Element !==
    'Provenance.entity.agent.who' ||
  healthConnectDataOriginApplication.referenceType !== 'Device' ||
  healthConnectDataOriginApplication.referenceMode !== 'identifier-only' ||
  healthConnectDataOriginApplication.identifierSystem !==
    'https://grovealliance.org/fhir/health-connect/NamingSystem/android-package-name' ||
  healthConnectDataOriginApplication.literalReferenceAllowed !== false ||
  healthConnectDataOriginApplication.eventBundleEntryRequired !== false ||
  healthConnectDataOriginApplication.profileClaimRequired !== false
) {
  throw new Error(
    'Health Connect DataOrigin application must remain a typed identifier-only logical Device Reference.',
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
const healthKitClinicalRecordAdmission =
  healthKitAdapter.clinicalRecordAdmission
const healthKitClinicalFhirRepresentation =
  healthKitClinicalRecordAdmission?.fhirRepresentation
const healthKitApplicationDeviceIdentity =
  healthKitAdapter.applicationDeviceIdentity
const healthKitBundleIdentifier =
  healthKitApplicationDeviceIdentity?.bundleIdentifier
if (
  typeof healthKitClinicalRecordAdmission !== 'object' ||
  healthKitClinicalRecordAdmission === null ||
  Array.isArray(healthKitClinicalRecordAdmission) ||
  Object.keys(healthKitClinicalRecordAdmission).sort().join(',') !==
    'admittedFHIRRelease,fhirRepresentation,payloadFormat,profile,rejectedFHIRReleases,rule,sourceFHIRReleaseField' ||
  healthKitClinicalRecordAdmission.profile !==
    profiles['healthkit-clinical-record-document'] ||
  typeof healthKitClinicalRecordAdmission.payloadFormat !== 'string' ||
  formatRegistry.formats?.[healthKitClinicalRecordAdmission.payloadFormat]
    ?.status !== 'active' ||
  formatRegistry.formats[healthKitClinicalRecordAdmission.payloadFormat]
    .contentType !== 'application/fhir+json' ||
  typeof healthKitClinicalRecordAdmission.sourceFHIRReleaseField !== 'string' ||
  healthKitClinicalRecordAdmission.sourceFHIRReleaseField.trim() === '' ||
  typeof healthKitClinicalRecordAdmission.admittedFHIRRelease !== 'string' ||
  healthKitClinicalRecordAdmission.admittedFHIRRelease.trim() === '' ||
  !uniqueNonemptyStrings(
    healthKitClinicalRecordAdmission.rejectedFHIRReleases,
  ) ||
  healthKitClinicalRecordAdmission.rejectedFHIRReleases.includes(
    healthKitClinicalRecordAdmission.admittedFHIRRelease,
  ) ||
  typeof healthKitClinicalRecordAdmission.rule !== 'string' ||
  healthKitClinicalRecordAdmission.rule.trim() === '' ||
  typeof healthKitClinicalFhirRepresentation !== 'object' ||
  healthKitClinicalFhirRepresentation === null ||
  Array.isArray(healthKitClinicalFhirRepresentation) ||
  Object.keys(healthKitClinicalFhirRepresentation).sort().join(',') !==
    'cardinality,extensionUrl,fixedValue,resourceType,valueElement' ||
  healthKitClinicalFhirRepresentation.resourceType !== 'DocumentReference' ||
  typeof healthKitClinicalFhirRepresentation.extensionUrl !== 'string' ||
  !URL.canParse(healthKitClinicalFhirRepresentation.extensionUrl) ||
  healthKitClinicalFhirRepresentation.valueElement !== 'valueCode' ||
  healthKitClinicalFhirRepresentation.cardinality?.min !== 1 ||
  healthKitClinicalFhirRepresentation.cardinality.max !== 1 ||
  healthKitClinicalFhirRepresentation.fixedValue !==
    healthKitClinicalRecordAdmission.admittedFHIRRelease
) {
  throw new Error(
    'HealthKit clinical-record FHIR admission must remain complete and closed.',
  )
}
if (
  typeof healthKitApplicationDeviceIdentity !== 'object' ||
  healthKitApplicationDeviceIdentity === null ||
  Array.isArray(healthKitApplicationDeviceIdentity) ||
  Object.keys(healthKitApplicationDeviceIdentity).sort().join(',') !==
    'bundleIdentifier,classificationRule,profile,snapshotIdentifierRole' ||
  healthKitApplicationDeviceIdentity.profile !==
    profiles['healthkit-application-device'] ||
  healthKitApplicationDeviceIdentity.snapshotIdentifierRole !==
    'device-snapshot' ||
  typeof healthKitApplicationDeviceIdentity.classificationRule !== 'string' ||
  healthKitApplicationDeviceIdentity.classificationRule.trim() === '' ||
  typeof healthKitBundleIdentifier !== 'object' ||
  healthKitBundleIdentifier === null ||
  Array.isArray(healthKitBundleIdentifier) ||
  Object.keys(healthKitBundleIdentifier).sort().join(',') !==
    'cardinality,meaning,system,typeCode,typeSystem' ||
  healthKitBundleIdentifier.system !==
    'https://grovealliance.org/fhir/healthkit/NamingSystem/apple-bundle-id' ||
  healthKitBundleIdentifier.typeSystem !==
    'https://grovealliance.org/fhir/healthkit/CodeSystem/healthkit-identifier-type' ||
  healthKitBundleIdentifier.typeCode !== 'apple-bundle-id' ||
  healthKitBundleIdentifier.cardinality !== '1..1' ||
  typeof healthKitBundleIdentifier.meaning !== 'string' ||
  healthKitBundleIdentifier.meaning.trim() === ''
) {
  throw new Error(
    'HealthKit application Device identity must remain complete and closed.',
  )
}
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
if (
  providerAdapter.fhirVersion !== '4.0.1' ||
  providerAdapter.version !== packageGraph.version ||
  providerAdapter.packageId !== 'org.grovealliance.fhir.providers' ||
  providerAdapter.canonical !== packageCanonicals['providers'] ||
  providerAdapter.adapterProfile !== profiles['providers-observation'] ||
  providerAdapter.recordingDocument?.sourceNeutralProfile !==
    profiles['grove-sensor-recording-document'] ||
  providerAdapter.recordingDocument?.adapterProfile !==
    profiles['providers-recording-document'] ||
  providerAdapter.recordingDocument?.outputRole !== 'native-recording' ||
  providerAdapter.recordingDocument?.outputDiscriminator !== 'single' ||
  providerAdapter.rawPayloadAdmission?.allowedAssertions?.join(',') !==
    rawPayloadAssertions.join(',') ||
  providerAdapter.rawPayloadAdmission?.notFHIRAuthorization !== true ||
  providerAdapter.conversionProvenanceProfile !==
    profiles['providers-conversion-provenance'] ||
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

const markerResourceTypes = (definition, kind) => {
  if (
    kind === 'extension-url' &&
    definition?.valueElement === 'valueCode' &&
    Array.isArray(definition.contexts)
  ) {
    const resourceTypes = definition.contexts
    if (
      resourceTypes.length === 0 ||
      resourceTypes.some(
        (resourceType) =>
          typeof resourceType !== 'string' ||
          !/^[A-Z][A-Za-z]+$/u.test(resourceType),
      ) ||
      new Set(resourceTypes).size !== resourceTypes.length
    ) {
      throw new Error(
        'The extension-url adapter source marker contexts are incomplete.',
      )
    }
    return resourceTypes
  }
  if (
    typeof definition !== 'object' ||
    definition === null ||
    Array.isArray(definition) ||
    definition.cardinality !== 'exactly one' ||
    typeof definition.r4Element !== 'string'
  ) {
    throw new Error(`The ${kind} adapter source marker is incomplete.`)
  }
  const terminal =
    kind === 'coding-system' ? 'code.coding' : 'extension.valueCode'
  const resourceTypes = definition.r4Element.split(' or ').map((path) => {
    const match = /^([A-Z][A-Za-z]+)\.(.+)$/u.exec(path)
    if (match?.[1] === undefined || match[2] !== terminal) {
      throw new Error(
        `The ${kind} adapter source marker has an unsupported R4 element path ${path}.`,
      )
    }
    return match[1]
  })
  if (
    resourceTypes.length === 0 ||
    new Set(resourceTypes).size !== resourceTypes.length
  ) {
    throw new Error(`The ${kind} adapter source marker paths are not unique.`)
  }
  return resourceTypes
}

const adapterClaim = (catalogDefinition) => {
  const adapter = catalogDefinition.identity?.adapterId
  const claim = profileClaims.adapterConversionProvenanceClaims?.find(
    (candidate) => candidate.adapter === adapter,
  )
  if (
    typeof adapter !== 'string' ||
    claim === undefined ||
    !Array.isArray(claim.targetAdapterProfiles) ||
    claim.targetAdapterProfiles.length === 0 ||
    new Set(claim.targetAdapterProfiles).size !==
      claim.targetAdapterProfiles.length
  ) {
    throw new Error('An adapter source marker has no closed profile claim.')
  }
  return claim
}

const extensionMarker = (definition) => {
  const valueSystem = definition?.codeSystem ?? definition?.valueSystem
  if (
    typeof definition?.url !== 'string' ||
    definition.url.trim() === '' ||
    typeof valueSystem !== 'string' ||
    valueSystem.trim() === ''
  ) {
    throw new Error('An adapter source extension marker is incomplete.')
  }
  return {
    kind: 'extension-url',
    url: definition.url,
    resourceTypes: markerResourceTypes(definition, 'extension-url'),
  }
}

const adapterSourceMarkerClaims = [
  {
    catalog: healthKitAdapter,
    markers: [extensionMarker(healthKitAdapter.sourceTypeExtension)],
  },
  {
    catalog: healthConnectAdapter,
    markers: [extensionMarker(healthConnectAdapter.sourceTypeExtension)],
  },
  {
    catalog: providerAdapter,
    markers: [
      extensionMarker(providerAdapter.sourceTypeExtension),
      extensionMarker(providerAdapter.providerExtension),
    ],
  },
  {
    catalog: sensorKitAdapter,
    markers: [extensionMarker(sensorKitAdapter.sourceTypeExtension)],
  },
].map(({ catalog: catalogDefinition, markers }) => {
  const claim = adapterClaim(catalogDefinition)
  return {
    adapter: claim.adapter,
    profiles: claim.targetAdapterProfiles,
    markers,
  }
})

const ownedAdapterProfiles = adapterSourceMarkerClaims.flatMap(
  ({ profiles: ownedProfiles }) => ownedProfiles,
)
if (new Set(ownedAdapterProfiles).size !== ownedAdapterProfiles.length) {
  throw new Error('Adapter source-marker profile ownership must be disjoint.')
}

const providerScalarOutputRoles = {}
const providerScalarOutputDiscriminators = {}
const providerRawOutputRoles = {}
const providerRawOutputDiscriminators = {}
const providerRecordEffectiveRules = {}
const completeCivilDayEffectiveRule =
  'the source civil day represented as a complete day Period; midpoint substitution is forbidden'
for (const provider of providerAdapter.providers) {
  if (
    typeof provider.measurementOwner !== 'string' ||
    provider.measurementOwner.length === 0 ||
    typeof provider.observationProfile !== 'string' ||
    !profileClaims.observationAdapterClaim.adapterProfiles.includes(
      provider.observationProfile,
    ) ||
    provider.sourceTypes?.length !== provider.sourceTypeCount ||
    new Set(provider.sourceTypes.map((entry) => entry.token)).size !==
      provider.sourceTypeCount
  ) {
    throw new Error(`Provider ${provider.id} source inventory is incomplete.`)
  }

  const sourceMappings = {}
  const sourceDiscriminators = {}
  const rawSourceMappings = {}
  const rawSourceDiscriminators = {}
  const recordEffectiveRules = {}
  for (const sourceType of provider.sourceTypes) {
    const structuredElements = (sourceType.elements ?? []).filter(
      (element) =>
        element.status === 'supported' ||
        element.status === 'platform-exclusive',
    )
    const measurementIds = [
      ...new Set(
        (sourceType.elements ?? [])
          .filter(
            (element) =>
              (element.status === 'supported' ||
                element.status === 'platform-exclusive') &&
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
      sourceDiscriminators[sourceType.token] = Object.fromEntries(
        measurementIds.map((measurementId) => [measurementId, 'single']),
      )
    }
    const effectiveRules = [
      ...new Set(
        structuredElements
          .map((element) => element.effective)
          .filter((rule) => typeof rule === 'string'),
      ),
    ]
    if (effectiveRules.includes(completeCivilDayEffectiveRule)) {
      if (
        effectiveRules.length !== 1 ||
        structuredElements.some(
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
        providerAdapter.recordingDocument.outputRole
      rawSourceDiscriminators[sourceType.token] =
        providerAdapter.recordingDocument.outputDiscriminator
    }
  }
  for (const grouped of provider.groupedMappings ?? []) {
    if (
      grouped.status !== 'supported' ||
      typeof grouped.token !== 'string' ||
      grouped.token.length === 0 ||
      typeof grouped.outputRole !== 'string' ||
      grouped.outputRole.length === 0 ||
      typeof grouped.outputDiscriminator !== 'string' ||
      grouped.outputDiscriminator.length === 0 ||
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
        grouped.outputRole,
      ]),
    )
    sourceDiscriminators[grouped.token] = Object.fromEntries(
      grouped.measurementIds.map((measurementId) => [
        measurementId,
        grouped.outputDiscriminator,
      ]),
    )
  }
  for (const [sourceType, mappings] of Object.entries(sourceMappings)) {
    const discriminators = sourceDiscriminators[sourceType]
    if (
      discriminators === undefined ||
      JSON.stringify(Object.keys(discriminators)) !==
        JSON.stringify(Object.keys(mappings))
    ) {
      throw new Error(
        `Provider ${provider.id}/${sourceType} output coordinate keys are inconsistent.`,
      )
    }
    const coordinates = Object.entries(mappings).map(
      ([measurementId, outputRole]) =>
        `${outputRole.length}:${outputRole}${discriminators[measurementId].length}:${discriminators[measurementId]}`,
    )
    if (new Set(coordinates).size !== coordinates.length) {
      throw new Error(
        `Provider ${provider.id}/${sourceType} output coordinates must be unique.`,
      )
    }
    for (const measurementId of Object.keys(mappings)) {
      const definition = implemented[measurementId]
      if (
        !isMobileOwned(definition) &&
        (definition?.owner !== provider.measurementOwner ||
          !['codeableConcept', 'quantity'].includes(definition.valueKind))
      ) {
        throw new Error(
          `Provider ${provider.id}/${sourceType} cannot admit owner-exclusive measurement ${measurementId} outside its exact scalar facade.`,
        )
      }
    }
  }
  providerScalarOutputRoles[provider.id] = sourceMappings
  providerScalarOutputDiscriminators[provider.id] = sourceDiscriminators
  providerRawOutputRoles[provider.id] = rawSourceMappings
  providerRawOutputDiscriminators[provider.id] = rawSourceDiscriminators
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
      daily_cardiovascular_age: {
        kind: 'complete-civil-day-period',
        measurementIds: ['oura-cardiovascular-age'],
        outputsShareEffective: true,
      },
      daily_readiness: {
        kind: 'complete-civil-day-period',
        measurementIds: ['oura-readiness-score'],
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
  Object.values(providerRawOutputRoles).flatMap((mapping) =>
    Object.keys(mapping),
  ).length !== 4
) {
  throw new Error('Provider must admit exactly four raw source tokens.')
}
if (
  JSON.stringify(
    Object.fromEntries(
      Object.entries(providerRawOutputRoles).map(([provider, mappings]) => [
        provider,
        Object.keys(mappings),
      ]),
    ),
  ) !==
  JSON.stringify(
    Object.fromEntries(
      Object.entries(providerRawOutputDiscriminators).map(
        ([provider, mappings]) => [provider, Object.keys(mappings)],
      ),
    ),
  )
) {
  throw new Error(
    'Provider raw output role/discriminator keys are inconsistent.',
  )
}

const providerIdentity = providerAdapter.identity
const expectedProviderSourceComponents = [
  'provider-code',
  'source-type',
  'provider-scope-system',
  'provider-scope-value',
  'native-record-id',
]
const expectedProviderOutputComponents = [
  ...expectedProviderSourceComponents,
  'output-role',
  'output-discriminator',
]
const expectedProviderArtifactComponents = [
  ...expectedProviderSourceComponents,
  'format-code',
  'part-index',
]
if (
  providerIdentity?.contract !== 'catalog/exchange-protocol.json' ||
  providerIdentity.protocolVersion !== 0 ||
  providerIdentity.adapterId !== 'providers' ||
  providerIdentity.sourceRecord?.identityKind !== 'provider-record' ||
  providerIdentity.sourceRecord?.identifierRole !== 'source-record' ||
  JSON.stringify(providerIdentity.sourceRecord?.components) !==
    JSON.stringify(expectedProviderSourceComponents) ||
  providerIdentity.sourceOutput?.identityKind !== 'provider-output' ||
  providerIdentity.sourceOutput?.identifierRole !== 'source-output' ||
  JSON.stringify(providerIdentity.sourceOutput?.components) !==
    JSON.stringify(expectedProviderOutputComponents) ||
  providerIdentity.writerRecord?.identityKind !== 'writer-record' ||
  providerIdentity.writerRecord?.identifierRole !== 'writer-record' ||
  providerIdentity.sourceArtifact?.identityKind !== 'provider-artifact' ||
  providerIdentity.sourceArtifact?.identifierRole !== 'source-artifact' ||
  JSON.stringify(providerIdentity.sourceArtifact?.components) !==
    JSON.stringify(expectedProviderArtifactComponents) ||
  providerAdapter.providers.some(
    ({ identifierScope, providerScopeMode, identifierScopeReason }) =>
      !['account', 'global'].includes(identifierScope) ||
      providerScopeMode !==
        (identifierScope === 'account' ?
          'deployment-scoped-account-pseudonym'
        : 'documented-global-key-space') ||
      typeof identifierScopeReason !== 'string' ||
      identifierScopeReason.trim() === '',
  ) ||
  typeof providerIdentity.resourceIdPolicy !== 'string'
) {
  throw new Error('Provider deterministic identity contract is incomplete.')
}

if (
  formatRegistry.fhirVersion !== '4.0.1' ||
  formatRegistry.version !== packageGraph.version ||
  typeof formatRegistry.codeSystem !== 'string' ||
  typeof formatRegistry.valueSet !== 'string' ||
  Object.keys(formatRegistry.formats ?? {}).length === 0 ||
  Object.hasOwn(formatRegistry.formats ?? {}, 'fhir-resource-array') ||
  formatRegistry.formats?.['fhir-collection-bundle']?.contentType !==
    'application/fhir+json' ||
  formatRegistry.formats?.['fhir-r4-resource']?.contentType !==
    'application/fhir+json' ||
  formatRegistry.formats?.['provider-recording']?.contentType !==
    'application/json'
) {
  throw new Error('Recording format registry is incomplete.')
}
// The registry's payload specifications stay in the IG; the TypeScript contract
// carries only what emission and admission need.
const recordingFormatRegistry = {
  codeSystem: formatRegistry.codeSystem,
  valueSet: formatRegistry.valueSet,
  version: formatRegistry.version,
  formats: Object.fromEntries(
    Object.entries(formatRegistry.formats).map(([code, entry]) => {
      if (
        typeof entry.title !== 'string' ||
        typeof entry.contentType !== 'string' ||
        entry.status !== 'active'
      ) {
        throw new Error(`Recording format ${code} is incomplete.`)
      }
      return [
        code,
        {
          title: entry.title,
          contentType: entry.contentType,
          status: entry.status,
        },
      ]
    }),
  ),
}

const providerAdmittedMeasurements = new Set(
  Object.values(providerScalarOutputRoles).flatMap((sourceMappings) =>
    Object.values(sourceMappings).flatMap((mapping) => Object.keys(mapping)),
  ),
)
const sharedAdmittedMeasurements = new Set(
  [...providerAdmittedMeasurements].filter((id) =>
    isMobileOwned(implemented[id]),
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

const protocolIdentityKinds = exchangeProtocol.opaqueIdentity?.identityKinds
const identityKindsByName = new Map(
  (protocolIdentityKinds ?? []).map((definition) => [
    definition.kind,
    definition,
  ]),
)
const protocolIdentifierRoles = new Set(
  (protocolIdentityKinds ?? []).map(({ identifierRole }) => identifierRole),
)
const identityVectors = exchangeProtocol.testVectors?.identities
const invalidIdentityVectors = exchangeProtocol.testVectors?.invalidIdentities
const providerCodes = new Set(providerAdapter.providers.map(({ id }) => id))
const providerIdentityKinds = new Set([
  'provider-record',
  'provider-output',
  'provider-artifact',
])
const genericSourceIdentityKinds = new Set([
  'source-record',
  'source-output',
  'source-artifact',
])
const sourceOutputVector = identityVectors?.find(
  ({ id }) => id === 'multi-output-sample',
)
const sourceContextVector = identityVectors?.find(
  ({ id }) => id === 'healthkit-medication-source-context',
)
const opaqueIdentityValue =
  /^v0:[A-Za-z0-9._-]+:[1-9][0-9]*:[A-Za-z0-9_-]{43}$/u
const retractionTargetRules =
  exchangeProtocol.lifecycle?.retraction?.targetRoles
const retractionTargetEntries =
  (
    typeof retractionTargetRules === 'object' &&
    retractionTargetRules !== null &&
    !Array.isArray(retractionTargetRules)
  ) ?
    Object.entries(retractionTargetRules)
  : []
const adapterOnlyOutputProfileClaims =
  exchangeProtocol.lifecycle?.active?.adapterOnlyOutputProfileClaims
const activeEntryResourcePolicy =
  exchangeProtocol.lifecycle?.active?.entryResourcePolicy
const adapterOnlyClaimRows = [
  profileClaims.healthConnectSpecimenClaim,
  ...(profileClaims.healthKitPlatformExclusiveResourceClaims ?? []),
]
const adapterOnlyClaimTypes = adapterOnlyClaimRows.map(
  ({ resourceType }) => resourceType,
)
const expectedHealthKitSingleProfiles = measurements
  .filter((measurement) => measurement.owner === 'healthkit')
  .map((measurement) => profiles[measurement.profile])
const healthKitSingleProfiles =
  profileClaims.healthKitSingleProfileObservationClaims?.profiles
const documentProfileClaimRows = [
  profileClaims.sensorRecordingDocumentClaim,
  profileClaims.healthKitRecordingDocumentClaim,
  profileClaims.healthKitClinicalRecordDocumentClaim,
  profileClaims.providerRecordingDocumentClaim,
  profileClaims.sensorKitRecordingDocumentClaim,
]
const exactSet = (left, right) =>
  Array.isArray(left) &&
  Array.isArray(right) &&
  left.length === right.length &&
  new Set(left).size === left.length &&
  left.every((value) => right.includes(value))
const activeOutputResourceTypes = [
  'Observation',
  'DocumentReference',
  'Specimen',
  'VisionPrescription',
  'MedicationAdministration',
  'MedicationStatement',
]
const activeSupportingResourceTypes = [
  'Patient',
  'Device',
  'ResearchStudy',
  'ResearchSubject',
  'PlanDefinition',
  'QuestionnaireResponse',
]
const activeDeviceClaims = profileClaims.activeDeviceClaims
const activeQuestionnaireResponseClaim =
  profileClaims.activeQuestionnaireResponseClaim
const expectedReferencePaths = [
  ['Observation', 'subject', ['Patient']],
  ['Observation', 'device', ['Device']],
  ['Observation', 'specimen', ['Specimen']],
  ['Observation', 'focus', ['Location']],
  ['Observation', 'hasMember', ['Observation']],
  [
    'Observation',
    'derivedFrom',
    ['Observation', 'DocumentReference', 'QuestionnaireResponse'],
  ],
  ['DocumentReference', 'subject', ['Patient']],
  ['QuestionnaireResponse', 'subject', ['Patient']],
  ['Specimen', 'subject', ['Patient']],
  ['MedicationAdministration', 'subject', ['Patient']],
  ['MedicationStatement', 'subject', ['Patient']],
  ['VisionPrescription', 'patient', ['Patient']],
  ['ResearchSubject', 'individual', ['Patient']],
  ['ResearchSubject', 'study', ['ResearchStudy']],
  ['ResearchStudy', 'protocol', ['PlanDefinition']],
  ['Device', 'parent', ['Device']],
]
const expectedExtensionTargets = [
  [
    'http://hl7.org/fhir/StructureDefinition/observation-gatewayDevice',
    ['Device'],
  ],
  [
    'http://hl7.org/fhir/StructureDefinition/workflow-researchStudy',
    ['ResearchStudy'],
  ],
]
const referencePaths = exchangeProtocol.referencePolicy?.paths?.map(
  ({ resourceType, path, targetTypes }) => [resourceType, path, targetTypes],
)
const extensionTargets =
  exchangeProtocol.referencePolicy?.extensionTargets?.map(
    ({ url, targetTypes }) => [url, targetTypes],
  )
const exchangeRuleDiagnostics = Object.fromEntries(
  (exchangeCorpus.cases ?? []).map(({ expectedRule }) => [
    expectedRule?.code,
    {
      reason: expectedRule?.reason,
      severity: expectedRule?.severity,
    },
  ]),
)
const exchangeRuleRows = exchangeCorpus.cases?.map(
  ({ expectedRule }) => expectedRule,
)
if (
  exchangeProtocol.schemaVersion !== 0 ||
  exchangeProtocol.version !== packageGraph.version ||
  exchangeProtocol.protocolVersion !== 0 ||
  exchangeProtocol.releaseVersion !== packageGraph.version ||
  exchangeProtocol.fhirVersion !== '4.0.1' ||
  exchangeProtocol.profiles?.activeBundle !==
    profiles['grove-mobile-exchange-bundle'] ||
  exchangeProtocol.profiles?.conversionProvenance !==
    profiles['grove-mobile-conversion-provenance'] ||
  exchangeProtocol.profiles?.retractionBundle !==
    profiles['grove-mobile-retraction-bundle'] ||
  exchangeProtocol.profiles?.retractionProvenance !==
    profiles['grove-mobile-retraction-provenance'] ||
  exchangeProtocol.opaqueIdentity?.algorithm !== 'HMAC-SHA-256' ||
  exchangeProtocol.opaqueIdentity?.keyRequirements?.minimumBytes !== 32 ||
  exchangeProtocol.opaqueIdentity?.domain !==
    'org.grovealliance.fhir.identity.v0' ||
  exchangeProtocol.entryIdentity?.entryNode?.domain !==
    'org.grovealliance.fhir.entry-node.v0' ||
  exchangeProtocol.entryIdentity?.fullUrl?.namespace !==
    '43df4575-bff7-5a57-9a80-2472cd2b0623' ||
  !uniqueNonemptyStrings(
    exchangeProtocol.entryIdentity?.resourceIdentifierPriority,
  ) ||
  exchangeProtocol.entryIdentity.resourceIdentifierPriority.some(
    (role) => !protocolIdentifierRoles.has(role),
  ) ||
  exchangeProtocol.extensions?.entryNodeKey !==
    `${packageCanonicals.mobile}/StructureDefinition/grove-exchange-entry-node-key` ||
  exchangeProtocol.extensions?.retractionTargetRole !==
    `${packageCanonicals.mobile}/StructureDefinition/grove-retraction-target-role` ||
  exchangeProtocol.codeSystems?.identifierRole !==
    `${packageCanonicals.mobile}/CodeSystem/grove-identifier-role` ||
  exchangeProtocol.codeSystems?.lifecycleEvent !==
    `${packageCanonicals.mobile}/CodeSystem/grove-lifecycle-event` ||
  exchangeProtocol.codeSystems?.retractionTargetRole !==
    `${packageCanonicals.mobile}/CodeSystem/grove-retraction-target-role` ||
  exchangeProtocol.lifecycle?.retraction?.activityCode !==
    'source-record-retracted' ||
  adapterOnlyOutputProfileClaims?.authority !== 'catalog/profile-claims.json' ||
  !exactSet(
    adapterOnlyOutputProfileClaims?.resourceTypes,
    adapterOnlyClaimTypes,
  ) ||
  !exactSet(
    activeEntryResourcePolicy?.outputResourceTypes,
    activeOutputResourceTypes,
  ) ||
  !exactSet(
    activeEntryResourcePolicy?.supportingResourceTypes,
    activeSupportingResourceTypes,
  ) ||
  activeEntryResourcePolicy?.lifecycleResourceType !== 'Provenance' ||
  activeEntryResourcePolicy.otherResourceTypesAllowed !== false ||
  activeEntryResourcePolicy.containedResourcesAllowed !== false ||
  activeEntryResourcePolicy.supportingResourcesMustBeConnected !== true ||
  activeEntryResourcePolicy.profileClaimAuthority !==
    'catalog/profile-claims.json' ||
  adapterOnlyClaimRows.some(
    (claim) =>
      claim?.cardinality !== 1 ||
      claim.otherProfilesAllowed !== false ||
      typeof claim.profile !== 'string' ||
      !uniqueNonemptyStrings(claim.requiredIdentifierRoles),
  ) ||
  !exactSet(healthKitSingleProfiles, expectedHealthKitSingleProfiles) ||
  profileClaims.healthKitSingleProfileObservationClaims?.cardinality !== 1 ||
  profileClaims.healthKitSingleProfileObservationClaims
    ?.otherProfilesAllowed !== false ||
  documentProfileClaimRows.some(
    (claim) =>
      typeof claim !== 'object' ||
      claim === null ||
      claim.otherProfilesAllowed !== false ||
      claim.cardinality !== claim.profiles?.length ||
      !uniqueNonemptyStrings(claim.profiles) ||
      !uniqueNonemptyStrings(claim.requiredIdentifierRoles),
  ) ||
  !Array.isArray(activeDeviceClaims) ||
  activeDeviceClaims.length !== 4 ||
  activeDeviceClaims.some(
    (claim) =>
      claim?.resourceType !== 'Device' ||
      claim.cardinality !== 1 ||
      claim.otherProfilesAllowed !== false ||
      claim.profiles?.length !== 1 ||
      !uniqueNonemptyStrings(claim.profiles) ||
      !uniqueNonemptyStrings(claim.requiredIdentifierRoles),
  ) ||
  activeQuestionnaireResponseClaim?.resourceType !== 'QuestionnaireResponse' ||
  activeQuestionnaireResponseClaim.cardinality !== 1 ||
  activeQuestionnaireResponseClaim.otherProfilesAllowed !== false ||
  activeQuestionnaireResponseClaim.profiles?.length !== 1 ||
  !uniqueNonemptyStrings(activeQuestionnaireResponseClaim.profiles) ||
  JSON.stringify(referencePaths) !== JSON.stringify(expectedReferencePaths) ||
  JSON.stringify(extensionTargets) !==
    JSON.stringify(expectedExtensionTargets) ||
  typeof exchangeProtocol.referencePolicy?.literalClosure !== 'string' ||
  typeof exchangeProtocol.referencePolicy?.declaredType !== 'string' ||
  typeof exchangeProtocol.referencePolicy?.governedShape !== 'string' ||
  exchangeCorpus.schemaVersion !== 0 ||
  !Array.isArray(exchangeRuleRows) ||
  exchangeRuleRows.length !== 34 ||
  Object.keys(exchangeRuleDiagnostics).length !==
    new Set(exchangeRuleRows.map(({ code }) => code)).size ||
  exchangeRuleRows.some(
    (rule) =>
      typeof rule?.code !== 'string' ||
      !rule.code.startsWith('mobile-') ||
      typeof rule.reason !== 'string' ||
      rule.reason.length === 0 ||
      typeof rule.location !== 'string' ||
      rule.location.length === 0 ||
      rule.severity !== 'error' ||
      exchangeRuleDiagnostics[rule.code]?.reason !== rule.reason ||
      exchangeRuleDiagnostics[rule.code]?.severity !== rule.severity,
  ) ||
  typeof exchangeProtocol.recordingDevice?.instanceRule !== 'string' ||
  typeof exchangeProtocol.recordingDevice?.unknownInstance !== 'string' ||
  typeof exchangeProtocol.recordingDevice?.snapshots !== 'string' ||
  typeof exchangeProtocol.recordingDevice?.roles !== 'string' ||
  !['application', 'host', 'recording-device'].every((role) =>
    exchangeProtocol.recordingDevice.roles.includes(role),
  ) ||
  retractionTargetEntries.length === 0 ||
  retractionTargetEntries.some(
    ([role, rule]) =>
      role.length === 0 ||
      typeof rule !== 'object' ||
      rule === null ||
      !protocolIdentifierRoles.has(rule.identifierRole) ||
      !uniqueNonemptyStrings(rule.resourceTypes),
  ) ||
  !Array.isArray(protocolIdentityKinds) ||
  protocolIdentityKinds.length === 0 ||
  identityKindsByName.size !== protocolIdentityKinds.length ||
  protocolIdentityKinds?.some(
    ({ kind, identifierRole, components }) =>
      typeof kind !== 'string' ||
      kind.length === 0 ||
      typeof identifierRole !== 'string' ||
      identifierRole.length === 0 ||
      !uniqueNonemptyStrings(components),
  ) ||
  !Array.isArray(identityVectors) ||
  identityVectors.length === 0 ||
  new Set(identityVectors.map(({ id }) => id)).size !==
    identityVectors.length ||
  identityVectors.some((vector) => {
    const definition = identityKindsByName.get(vector.identityKind)
    return (
      typeof vector.id !== 'string' ||
      vector.id.length === 0 ||
      definition === undefined ||
      !Array.isArray(vector.components) ||
      vector.components.length !== definition.components.length ||
      vector.components.some(
        (component) => typeof component !== 'string' || component.length === 0,
      ) ||
      (providerIdentityKinds.has(vector.identityKind) &&
        !providerCodes.has(vector.components[0])) ||
      (genericSourceIdentityKinds.has(vector.identityKind) &&
        providerCodes.has(vector.components[0])) ||
      !opaqueIdentityValue.test(vector.value)
    )
  }) ||
  !Array.isArray(invalidIdentityVectors) ||
  invalidIdentityVectors.length !== 4 ||
  new Set(invalidIdentityVectors.map(({ id }) => id)).size !==
    invalidIdentityVectors.length ||
  invalidIdentityVectors.some((vector) => {
    const definition = identityKindsByName.get(vector.identityKind)
    const emptyComponentCount =
      Array.isArray(vector.components) ?
        vector.components.filter((component) => component === '').length
      : 0
    const providerKindRequired =
      vector.expectedError === 'provider-kind-required' &&
      genericSourceIdentityKinds.has(vector.identityKind) &&
      providerCodes.has(vector.components?.[0])
    return (
      typeof vector.id !== 'string' ||
      vector.id.length === 0 ||
      definition === undefined ||
      !Array.isArray(vector.components) ||
      vector.components.length !== definition.components.length ||
      vector.components.some((component) => typeof component !== 'string') ||
      !(
        (vector.expectedError === 'empty-component' &&
          emptyComponentCount === 1) ||
        providerKindRequired
      )
    )
  }) ||
  new Set(
    invalidIdentityVectors
      .filter(({ expectedError }) => expectedError === 'provider-kind-required')
      .map(({ identityKind }) => identityKind),
  ).size !== genericSourceIdentityKinds.size ||
  sourceOutputVector?.identityKind !== 'source-output' ||
  sourceOutputVector.components?.length !== 7 ||
  sourceOutputVector.value !==
    'v0:test-key:1:MYPFjAMsSt0suOqpN29y_KjG__sagIpCbYKAfVKx6ck' ||
  sourceContextVector?.identityKind !== 'source-context'
) {
  throw new Error('Exchange protocol catalog is incomplete or inconsistent.')
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
if (capabilities.igVersion !== catalog.version) {
  throw new Error(
    `Capability matrix declares IG version ${String(capabilities.igVersion)} against catalog ${String(catalog.version)}.`,
  )
}
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
  implementedCapabilities.length !== sharedAdmittedMeasurements.size ||
  [...providerAdmittedMeasurements].some((key) => {
    const capability = capabilities.measurements.find(
      (entry) => entry.key === key,
    )
    return (
      capability === undefined ||
      !['implemented', 'platform-exclusive'].includes(capability.status)
    )
  })
) {
  throw new Error(
    'Capability matrix shared and platform-exclusive rows must exactly match the Provider facade.',
  )
}
const rawMappingRows = Object.entries(providerRawOutputRoles).flatMap(
  ([provider, mappings]) =>
    Object.entries(mappings).map(([sourceType, outputRole]) => ({
      provider,
      sourceType,
      outputRole,
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
          capability.outputRole === mapping.outputRole &&
          capability.profile === profiles['providers-recording-document'] &&
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
  if (!isMobileOwned(normative)) {
    if (
      capability !== undefined &&
      (capability.status !== 'platform-exclusive' ||
        capability.profile !== normative.profile)
    ) {
      throw new Error(
        `Owner-exclusive capability ${normative.id} must retain its exact platform-exclusive contract.`,
      )
    }
    continue
  }
  const admitted = sharedAdmittedMeasurements.has(normative.id)
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
      `Implemented capability ${String(capability?.key ?? normative.id)} does not match the shared IG catalog.`,
    )
  }
}

const semanticDefinition = (definition) => {
  const semantic = { ...definition }
  delete semantic.coverage
  delete semantic.coverageDetails
  delete semantic.generation
  return semantic
}

const sharedMobileSemanticCatalog = Object.fromEntries(
  mobileMeasurements.map((measurement) => [
    measurement.id,
    semanticDefinition(measurement),
  ]),
)

const adapterMeasurementCatalog = {}
for (const measurement of measurements) {
  if (isMobileOwned(measurement)) continue
  adapterMeasurementCatalog[measurement.owner] ??= {}
  adapterMeasurementCatalog[measurement.owner][measurement.id] =
    semanticDefinition(measurement)
}

const generated = {
  sourceRef,
  packageGraph,
  mobilePackageMetadata,
  questionnairePackageMetadata,
  providerPackageMetadata,
  exchangeProtocol,
  exchangeRuleDiagnostics,
  profileClaims,
  packageCanonicals,
  profiles,
  measurements: implemented,
  effectiveCanonicalization,
  effectiveCanonicalizationVectors: semanticEffectiveCanonicalization.vectors,
  providerAdapter,
  providerScalarOutputDiscriminators,
  providerScalarOutputRoles,
  providerRawOutputRoles,
  providerRawOutputDiscriminators,
  providerRecordEffectiveRules,
  questionnaireProfiles,
  mobileProfiles,
  providerProfiles,
  providerPackageCanonicals,
  adapterMeasurementCatalog,
  adapterSourceMarkerClaims,
  healthKitClinicalRecordAdmission,
  healthKitApplicationDeviceIdentity,
  healthConnectDataOriginApplication,
  recordingFormatRegistry,
}

for (const value of Object.values(generated)) {
  if (value === undefined) {
    throw new Error('Generated catalog values must be defined.')
  }
}

const unformattedOutputs = renderMeasurementCatalogSources({
  adapterMeasurementCatalog,
  adapterSourceMarkerClaims,
  effectiveCanonicalization,
  effectiveCanonicalizationVectors: semanticEffectiveCanonicalization.vectors,
  exchangeProtocol,
  exchangeRuleDiagnostics,
  healthConnectDataOriginApplication,
  healthKitApplicationDeviceIdentity,
  healthKitClinicalRecordAdmission,
  mobilePackageMetadata,
  mobileProfiles,
  packageGraph,
  profileClaims,
  providerAdapter,
  providerScalarOutputDiscriminators,
  providerPackageCanonicals,
  providerPackageMetadata,
  providerProfiles,
  providerRawOutputRoles,
  providerRawOutputDiscriminators,
  providerRecordEffectiveRules,
  providerScalarOutputRoles,
  questionnairePackageMetadata,
  questionnaireProfiles,
  recordingFormatRegistry,
  sharedMobileSemanticCatalog,
})
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
