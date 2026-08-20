//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import assert from 'node:assert/strict'
import { stdout } from 'node:process'

const packageName = '@schmiedmayerlab/grove-fhir'
const [root, mobile, connectedHealth, provenance, questionnaire, r4] =
  await Promise.all([
    import(packageName),
    import(`${packageName}/mobile`),
    import(`${packageName}/connected-health`),
    import(`${packageName}/provenance`),
    import(`${packageName}/questionnaire`),
    import(`${packageName}/r4`),
  ])

const providerExports = [
  'buildConnectedHealthMeasurementBundle',
  'buildConnectedHealthRecordingBundle',
  'connectedHealthRawMappings',
  'connectedHealthScalarMappings',
]
const internalGraphExports = [
  'groveFhirPackageCanonicals',
  'groveFhirPackageGraph',
  'groveFhirProfileCanonicals',
  'groveFhirProfileClaims',
  'groveFhirSourceRef',
]

for (const name of providerExports) {
  assert.equal(
    name in root,
    false,
    `${name} leaked through the root entry point`,
  )
  assert.equal(
    name in mobile,
    false,
    `${name} leaked through the source-neutral Mobile entry point`,
  )
  assert.equal(
    name in provenance,
    false,
    `${name} leaked through the source-neutral Provenance entry point`,
  )
  assert.equal(
    name in connectedHealth,
    true,
    `${name} is missing from the Connected Health entry point`,
  )
}

for (const name of internalGraphExports) {
  for (const [label, entryPoint] of [
    ['root', root],
    ['Mobile', mobile],
    ['Connected Health', connectedHealth],
    ['Provenance', provenance],
    ['Questionnaire', questionnaire],
  ]) {
    assert.equal(
      name in entryPoint,
      false,
      `${name} leaked through the ${label} entry point`,
    )
  }
}

assert.equal(typeof mobile.canonicalizeMobileEffectiveInstant, 'function')
assert.equal(root.groveFhirVersion, '4.0.1')
assert.equal(root.groveFhirContractVersion, '0.2.0')
assert.equal(
  mobile.groveMobilePackageMetadata.packageId,
  'org.grovealliance.fhir.mobile',
)
assert.equal(
  connectedHealth.groveConnectedHealthPackageMetadata.packageId,
  'org.grovealliance.fhir.connected-health',
)
assert.equal(
  questionnaire.groveQuestionnairePackageMetadata.packageId,
  'org.grovealliance.fhir.questionnaire',
)
assert.equal(typeof root.parseFhirInstant, 'function')
assert.equal(typeof r4.parseCollectionBundle, 'function')
assert.equal(typeof provenance.parseProvenance, 'function')
assert.equal(typeof questionnaire.buildQuestionnaire, 'function')

stdout.write('Verified all Grove FHIR package entry points.\n')
