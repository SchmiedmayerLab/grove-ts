//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { stdout } from 'node:process'
import { fileURLToPath } from 'node:url'

const packageName = '@schmiedmayerlab/grove-fhir'
const [root, mobile, provider, questionnaire, r4] = await Promise.all([
  import(packageName),
  import(`${packageName}/mobile`),
  import(`${packageName}/providers`),
  import(`${packageName}/questionnaire`),
  import(`${packageName}/r4`),
])

// The packed tarball must expose exactly the surface the source test locks.
const exportSurface = JSON.parse(
  await readFile(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../test/export-surface.json',
    ),
    'utf8',
  ),
)

for (const [name, entryPoint] of [
  ['.', root],
  ['./r4', r4],
  ['./mobile', mobile],
  ['./providers', provider],
  ['./questionnaire', questionnaire],
]) {
  assert.deepEqual(
    Object.keys(entryPoint).sort((left, right) => left.localeCompare(right)),
    exportSurface[name],
    `The packed ${name} entry point does not expose the recorded surface`,
  )
}

assert.equal(typeof mobile.canonicalizeMobileEffectiveInstant, 'function')
assert.equal(root.groveFhirVersion, '4.0.1')
assert.equal('groveFhirContractVersion' in root, false)
assert.equal(root.groveExchangeProtocol.schemaVersion, 0)
assert.equal(root.groveExchangeProtocol.protocolVersion, 0)
assert.equal('version' in root.groveExchangeProtocol, false)
assert.equal('releaseVersion' in root.groveExchangeProtocol, false)
assert.equal('version' in root.groveMobileContract, false)
assert.equal('version' in root.groveRecordingFormatRegistry, false)
assert.equal(
  mobile.groveMobilePackageMetadata.packageId,
  'org.grovealliance.fhir.mobile',
)
assert.equal(
  root.parseSemVer(mobile.groveMobilePackageMetadata.version).ok,
  true,
)
assert.equal(
  provider.groveProviderPackageMetadata.packageId,
  'org.grovealliance.fhir.providers',
)
assert.equal(
  questionnaire.groveQuestionnairePackageMetadata.packageId,
  'org.grovealliance.fhir.questionnaire',
)
assert.equal(typeof root.parseFhirInstant, 'function')
assert.equal(typeof r4.parseR4CollectionBundle, 'function')
assert.equal(typeof r4.parseGroveMobileExchangeBundle, 'function')
assert.equal(typeof r4.parseGroveMobileRetractionBundle, 'function')
assert.equal(typeof provider.parseProviderRetractionInput, 'function')
assert.equal(typeof provider.providerOutputCoordinates, 'function')
assert.equal(typeof provider.providerOutputRole, 'function')
assert.equal(typeof questionnaire.buildQuestionnaire, 'function')

stdout.write('Verified all Grove FHIR package entry points.\n')
