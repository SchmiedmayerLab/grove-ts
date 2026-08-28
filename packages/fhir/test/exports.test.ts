//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { expectTypeOf } from 'expect-type'
import * as root from '../src/index.js'
import * as mobile from '../src/mobile/index.js'
import * as provenance from '../src/provenance/index.js'
import * as provider from '../src/providers/index.js'

type HasMeasurementBuilder<T> =
  'buildProviderMeasurementBundle' extends keyof T ? true : false
type HasRecordingBuilder<T> =
  'buildProviderRecordingBundle' extends keyof T ? true : false
type HasRetractionBuilder<T> =
  'buildProviderRetractionBundle' extends keyof T ? true : false
type HasInternalPackageGraph<T> =
  'groveFhirPackageGraph' extends keyof T ? true : false

describe('public entry-point boundaries', () => {
  it('keeps provider-specific APIs out of the source-neutral entry points', () => {
    expect('buildProviderMeasurementBundle' in root).toBe(false)
    expect('buildProviderRecordingBundle' in root).toBe(false)
    expect('buildProviderRetractionBundle' in root).toBe(false)
    expect('buildProviderMeasurementBundle' in mobile).toBe(false)
    expect('buildProviderRecordingBundle' in mobile).toBe(false)
    expect('buildProviderRetractionBundle' in mobile).toBe(false)
    expect(JSON.stringify(mobile.sharedMobileMeasurementCatalog)).not.toMatch(
      /healthkit|health-connect|sensorkit|google-health-api|oura|withings|sourceTokens/u,
    )
    expect('adapterMeasurementCatalog' in root).toBe(false)
    expect('adapterMeasurementCatalog' in mobile).toBe(false)
    expect('PROFILES' in provenance).toBe(false)
    expect('SYSTEMS' in provenance).toBe(false)

    expectTypeOf<HasMeasurementBuilder<typeof root>>().toEqualTypeOf<false>()
    expectTypeOf<HasRecordingBuilder<typeof root>>().toEqualTypeOf<false>()
    expectTypeOf<HasRetractionBuilder<typeof root>>().toEqualTypeOf<false>()
    expectTypeOf<HasMeasurementBuilder<typeof mobile>>().toEqualTypeOf<false>()
    expectTypeOf<HasRecordingBuilder<typeof mobile>>().toEqualTypeOf<false>()
    expectTypeOf<HasRetractionBuilder<typeof mobile>>().toEqualTypeOf<false>()
    expectTypeOf<
      HasMeasurementBuilder<typeof provenance>
    >().toEqualTypeOf<false>()
    expectTypeOf<
      HasRecordingBuilder<typeof provenance>
    >().toEqualTypeOf<false>()
    expectTypeOf<
      HasRetractionBuilder<typeof provenance>
    >().toEqualTypeOf<false>()
    expectTypeOf<HasInternalPackageGraph<typeof root>>().toEqualTypeOf<false>()
    expectTypeOf<
      HasInternalPackageGraph<typeof mobile>
    >().toEqualTypeOf<false>()
    expectTypeOf<
      HasInternalPackageGraph<typeof provenance>
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

  it('exposes bounded generated version and package metadata', () => {
    expect(root.groveFhirVersion).toBe('4.0.1')
    expect(root.groveFhirContractVersion).toBe('0.6.0')
    expect(root.groveExchangeProtocol.protocolVersion).toBe(2)
    expect(root.groveMobileContract.version).toBe('0.6.0')
    expect(
      root.groveMobileContract.identity.resourceIdentifierPriority,
    ).toEqual(
      root.groveExchangeProtocol.entryIdentity.resourceIdentifierPriority,
    )
    expect(mobile.groveMobilePackageMetadata.packageId).toBe(
      'org.grovealliance.fhir.mobile',
    )
    expect(provider.groveProviderPackageMetadata.packageId).toBe(
      'org.grovealliance.fhir.providers',
    )

    expectTypeOf(root.groveFhirVersion).toEqualTypeOf<'4.0.1'>()
    expectTypeOf(root.groveFhirContractVersion).toEqualTypeOf<'0.6.0'>()
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
    expect(clinicalAdmission.fhirRepresentation.fixedValue).toBe(
      clinicalAdmission.admittedFHIRRelease,
    )
    expect(
      provider.groveRecordingFormatRegistry.formats[
        clinicalAdmission.payloadFormat
      ].contentType,
    ).toBe('application/fhir+json')
    expect(Object.isFrozen(clinicalAdmission)).toBe(true)
    expect(Object.isFrozen(clinicalAdmission.fhirRepresentation)).toBe(true)
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
