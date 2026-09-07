//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { expectTypeOf } from 'expect-type'
import exportSurface from './export-surface.json' with { type: 'json' }
import * as root from '../src/index.js'
import * as mobile from '../src/mobile/index.js'
import * as provider from '../src/providers/index.js'
import * as questionnaire from '../src/questionnaire/index.js'
import * as r4 from '../src/r4/index.js'

type HasMeasurementBuilder<T> =
  'buildProviderMeasurementBundle' extends keyof T ? true : false
type HasRecordingBuilder<T> =
  'buildProviderRecordingBundle' extends keyof T ? true : false
type HasRetractionBuilder<T> =
  'buildProviderRetractionBundle' extends keyof T ? true : false
type HasInternalPackageGraph<T> =
  'groveFhirPackageGraph' extends keyof T ? true : false
type HasContractVersion<T> =
  'groveFhirContractVersion' extends keyof T ? true : false
type HasRuntimeVersion<T> = 'version' extends keyof T ? true : false

const byText = (left: string, right: string): number =>
  left.localeCompare(right)

describe('public entry-point boundaries', () => {
  it.each([
    ['.', root],
    ['./r4', r4],
    ['./mobile', mobile],
    ['./providers', provider],
    ['./questionnaire', questionnaire],
  ] as const)('exports exactly the recorded %s surface', (name, entryPoint) => {
    expect(Object.keys(entryPoint).sort(byText)).toEqual(exportSurface[name])
  })

  it('keeps provider-specific APIs out of the source-neutral entry points', () => {
    expect(JSON.stringify(mobile.sharedMobileMeasurementCatalog)).not.toMatch(
      /healthkit|health-connect|sensorkit|google-health-api|oura|withings|sourceTokens/u,
    )

    expectTypeOf<HasMeasurementBuilder<typeof root>>().toEqualTypeOf<false>()
    expectTypeOf<HasRecordingBuilder<typeof root>>().toEqualTypeOf<false>()
    expectTypeOf<HasRetractionBuilder<typeof root>>().toEqualTypeOf<false>()
    expectTypeOf<HasMeasurementBuilder<typeof mobile>>().toEqualTypeOf<false>()
    expectTypeOf<HasRecordingBuilder<typeof mobile>>().toEqualTypeOf<false>()
    expectTypeOf<HasRetractionBuilder<typeof mobile>>().toEqualTypeOf<false>()
    expectTypeOf<HasInternalPackageGraph<typeof root>>().toEqualTypeOf<false>()
    expectTypeOf<
      HasInternalPackageGraph<typeof mobile>
    >().toEqualTypeOf<false>()
  })

  it('exposes the closed provider facade only from Provider', () => {
    expect(typeof provider.buildProviderMeasurementBundle).toBe('function')
    expect(typeof provider.buildProviderRecordingBundle).toBe('function')
    expect(typeof provider.buildProviderRetractionBundle).toBe('function')

    expectTypeOf<HasMeasurementBuilder<typeof provider>>().toEqualTypeOf<true>()
    expectTypeOf<HasRecordingBuilder<typeof provider>>().toEqualTypeOf<true>()
    expectTypeOf<HasRetractionBuilder<typeof provider>>().toEqualTypeOf<true>()
  })

  it('exposes FHIR and package metadata without a runtime release gate', () => {
    expect(root.groveFhirVersion).toBe('4.0.1')
    expect(root.groveExchangeProtocol.schemaVersion).toBe(0)
    expect(root.groveExchangeProtocol.protocolVersion).toBe(0)
    expect(root.groveExchangeProtocol).not.toHaveProperty('version')
    expect(root.groveExchangeProtocol).not.toHaveProperty('releaseVersion')
    expect(root.groveMobileContract).not.toHaveProperty('version')
    expect(root.groveRecordingFormatRegistry).not.toHaveProperty('version')
    expect(root.groveProfileClaims).not.toHaveProperty('version')
    expect(provider.providerAdapterCatalog).not.toHaveProperty('version')
    expect(
      root.groveMobileContract.identity.resourceIdentifierPriority,
    ).toEqual(
      root.groveExchangeProtocol.entryIdentity.resourceIdentifierPriority,
    )
    expect(mobile.groveMobilePackageMetadata.packageId).toBe(
      'org.grovealliance.fhir.mobile',
    )
    expect(root.parseSemVer(mobile.groveMobilePackageMetadata.version).ok).toBe(
      true,
    )
    expect(provider.groveProviderPackageMetadata.packageId).toBe(
      'org.grovealliance.fhir.providers',
    )

    expectTypeOf(root.groveFhirVersion).toEqualTypeOf<'4.0.1'>()
    expectTypeOf<HasContractVersion<typeof root>>().toEqualTypeOf<false>()
    expectTypeOf<
      HasRuntimeVersion<typeof root.groveMobileContract>
    >().toEqualTypeOf<false>()
  })

  it('exposes owner-exclusive measurements only from the Provider contract', () => {
    expect(Object.keys(provider.adapterMeasurementCatalog)).toEqual([
      'healthkit',
      'health-connect',
      'withings',
      'oura',
      'google-health',
    ])
    const standHour =
      provider.adapterMeasurementCatalog.healthkit['apple-stand-hour']
    expect(standHour.owner).toBe('healthkit')
    expect(standHour.allowedValues).toEqual(['stood', 'idle'])
    expect(standHour).not.toHaveProperty('coverage')
    expect(standHour).not.toHaveProperty('generation')
    expect(Object.isFrozen(provider.adapterMeasurementCatalog)).toBe(true)
    expect(Object.isFrozen(standHour)).toBe(true)
    expect(provider.healthKitApplicationDeviceIdentity).toMatchObject({
      profile:
        'https://grovealliance.org/fhir/healthkit/StructureDefinition/healthkit-application-device',
      snapshotIdentifierRole: 'device-snapshot',
      bundleIdentifier: {
        system:
          'https://grovealliance.org/fhir/healthkit/NamingSystem/apple-bundle-id',
        typeCode: 'apple-bundle-id',
        cardinality: '1..1',
      },
    })
    expect(Object.isFrozen(provider.healthKitApplicationDeviceIdentity)).toBe(
      true,
    )
    expect(
      Object.isFrozen(
        provider.healthKitApplicationDeviceIdentity.bundleIdentifier,
      ),
    ).toBe(true)
    const clinicalAdmission = provider.healthKitClinicalRecordAdmission
    const contentTypeByRelease =
      clinicalAdmission.fhirRepresentation.contentTypeByRelease
    const byText = (left: string, right: string): number =>
      left.localeCompare(right)
    expect(Object.keys(contentTypeByRelease).sort(byText)).toEqual(
      [...clinicalAdmission.admittedFHIRReleases].sort(byText),
    )
    expect(
      [
        ...provider.groveRecordingFormatRegistry.formats[
          clinicalAdmission.payloadFormat
        ].contentTypes,
      ].sort(byText),
    ).toEqual(Object.values(contentTypeByRelease).sort(byText))
    expect(Object.isFrozen(clinicalAdmission)).toBe(true)
    expect(Object.isFrozen(clinicalAdmission.fhirRepresentation)).toBe(true)
    expect(
      Object.isFrozen(
        clinicalAdmission.fhirRepresentation.contentTypeByRelease,
      ),
    ).toBe(true)
  })

  it('deeply freezes every generated contract read by public builders', () => {
    const heartRate = mobile.sharedMobileMeasurementCatalog['heart-rate']
    expect(Object.isFrozen(mobile.sharedMobileMeasurementCatalog)).toBe(true)
    expect(Object.isFrozen(heartRate)).toBe(true)
    expect(Object.isFrozen(heartRate.code)).toBe(true)
    expect(Object.isFrozen(provider.providerScalarOutputRoles)).toBe(true)
    expect(Object.isFrozen(provider.providerScalarOutputDiscriminators)).toBe(
      true,
    )
    expect(provider.providerRecordEffectiveRules.oura.daily_activity.kind).toBe(
      'complete-civil-day-period',
    )
    expect(Object.isFrozen(provider.providerRecordEffectiveRules)).toBe(true)
    expect(
      Object.isFrozen(provider.groveProviderPackageMetadata.dependencies),
    ).toBe(true)
    expect(Object.isFrozen(provider.providerRawOutputDiscriminators)).toBe(true)
    expect(Reflect.set(heartRate.code, 'code', 'mutated-clinical-code')).toBe(
      false,
    )
    expect(heartRate.code.code).toBe('8867-4')
  })
})
