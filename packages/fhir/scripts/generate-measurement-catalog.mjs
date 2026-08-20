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
const catalogRoot = resolve(packageRoot, 'catalog/grove-fhir')
const capabilityPath = resolve(
  packageRoot,
  'catalog/measurement-capabilities.json',
)
const inputPath = resolve(catalogRoot, 'measurement-catalog.json')
const packageGraphPath = resolve(catalogRoot, 'package-graph.json')
const exchangeIdentityPath = resolve(catalogRoot, 'exchange-identity.json')
const profileClaimsPath = resolve(catalogRoot, 'profile-claims.json')
const outputPath = resolve(
  packageRoot,
  'src/mobile/measurement-catalog.generated.ts',
)

const catalog = JSON.parse(await readFile(inputPath, 'utf8'))
const packageGraph = JSON.parse(await readFile(packageGraphPath, 'utf8'))
const exchangeIdentity = JSON.parse(
  await readFile(exchangeIdentityPath, 'utf8'),
)
const profileClaims = JSON.parse(await readFile(profileClaimsPath, 'utf8'))
const capabilities = JSON.parse(await readFile(capabilityPath, 'utf8'))
const measurements = catalog.measurements
if (!Array.isArray(measurements) || measurements.length === 0) {
  throw new Error('Measurement catalog must contain measurements.')
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
}

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

for (const id of [
  'blood-glucose',
  'capillary-blood-glucose',
  'interstitial-glucose',
]) {
  const specimen = measurements.find(
    (measurement) => measurement.id === id,
  )?.specimen
  if (
    typeof specimen?.system !== 'string' ||
    typeof specimen.code !== 'string'
  ) {
    throw new Error(`Glucose measurement ${id} requires a specimen coding.`)
  }
}
const serumPlasma = measurements.find(
  (measurement) => measurement.id === 'serum-plasma-glucose',
)
if (
  serumPlasma?.specimenAlternatives?.length !== 2 ||
  serumPlasma.specimenAlternatives[0]?.id !== 'plasma' ||
  serumPlasma.specimenAlternatives[1]?.id !== 'serum'
) {
  throw new Error('Serum/plasma glucose requires stable specimen alternatives.')
}
for (const specimen of serumPlasma.specimenAlternatives) {
  if (
    typeof specimen.system !== 'string' ||
    typeof specimen.code !== 'string'
  ) {
    throw new Error('Serum/plasma specimen coding is incomplete.')
  }
}

if (packageGraph.fhirVersion !== '4.0.1' || catalog.fhirVersion !== '4.0.1') {
  throw new Error(
    'The TypeScript package consumes FHIR R4 (4.0.1) catalogs only.',
  )
}

const packages = Object.fromEntries(
  packageGraph.packages.map((entry) => [entry.source, entry]),
)
for (const source of [
  'mobile',
  'questionnaire',
  'sensor',
  'healthkit',
  'health-connect',
  'connected-health',
]) {
  if (packages[source] === undefined) {
    throw new Error(`Package graph is missing ${source}.`)
  }
}

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

if (
  profileClaims.fhirVersion !== '4.0.1' ||
  profileClaims.observationAdapterClaim?.cardinality !== 2 ||
  profileClaims.observationAdapterClaim?.inheritedProfilesAreNotDeclared !==
    true ||
  !profileClaims.observationAdapterClaim?.adapterProfiles?.includes(
    profiles['connected-health-observation'],
  ) ||
  !profileClaims.observationAdapterClaim?.forbiddenExplicitProfiles?.includes(
    profiles['grove-mobile-observation'],
  )
) {
  throw new Error('Observation direct-profile claim is incomplete.')
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

const implemented = Object.fromEntries(
  measurements.map((measurement) => [measurement.id, measurement]),
)

const implementedCapabilities = capabilities.measurements?.filter(
  (measurement) => measurement.status === 'implemented',
)
if (
  !Array.isArray(implementedCapabilities) ||
  implementedCapabilities.length !== measurements.length
) {
  throw new Error(
    'Capability matrix must contain exactly one implemented row per normative measurement.',
  )
}
for (const capability of implementedCapabilities) {
  const normative = implemented[capability.key]
  if (
    normative === undefined ||
    capability.profile !== normative.profile ||
    capability.effective !== normative.effective ||
    !Array.isArray(capability.sources) ||
    capability.sources.length < 2
  ) {
    throw new Error(
      `Implemented capability ${String(capability.key)} does not match the shared IG catalog.`,
    )
  }
}

const generated = {
  packageGraph,
  exchangeIdentity,
  profileClaims,
  packageCanonicals,
  profiles,
  measurements: implemented,
}

for (const value of Object.values(generated)) {
  if (value === undefined) {
    throw new Error('Generated catalog values must be defined.')
  }
}

const header = `//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//
// Generated by scripts/generate-measurement-catalog.mjs. Do not edit directly.

/* eslint-disable sonarjs/no-clear-text-protocols */

`
const unformattedOutput = `${header}export const groveFhirPackageGraph = ${JSON.stringify(packageGraph, null, 2)} as const

export const groveFhirExchangeIdentity = ${JSON.stringify(exchangeIdentity, null, 2)} as const

export const groveFhirProfileClaims = ${JSON.stringify(profileClaims, null, 2)} as const

export const groveFhirPackageCanonicals = ${JSON.stringify(packageCanonicals, null, 2)} as const

export const groveFhirProfileCanonicals = ${JSON.stringify(profiles, null, 2)} as const

export const implementedMeasurementCatalog = ${JSON.stringify(implemented, null, 2)} as const

export type ImplementedMeasurementKind = keyof typeof implementedMeasurementCatalog
`
const output = await format(unformattedOutput, {
  parser: 'typescript',
  semi: false,
  singleQuote: true,
})

if (argv.includes('--check')) {
  const existing = await readFile(outputPath, 'utf8')
  if (existing !== output) {
    throw new Error(
      'Generated measurement catalog is stale. Run npm run generate:catalog.',
    )
  }
} else {
  await writeFile(outputPath, output)
}
