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
type HasInternalPackageGraph<T> =
  'groveFhirPackageGraph' extends keyof T ? true : false

describe('public entry-point boundaries', () => {
  it('keeps provider-specific APIs out of the source-neutral entry points', () => {
    expect('buildProviderMeasurementBundle' in root).toBe(false)
    expect('buildProviderRecordingBundle' in root).toBe(false)
    expect('buildProviderMeasurementBundle' in mobile).toBe(false)
    expect('buildProviderRecordingBundle' in mobile).toBe(false)
    expect(JSON.stringify(mobile.sharedMobileMeasurementCatalog)).not.toMatch(
      /healthkit|health-connect|sensorkit|google-health-api|oura|withings|sourceTokens/u,
    )
    expect('PROFILES' in provenance).toBe(false)
    expect('SYSTEMS' in provenance).toBe(false)

    expectTypeOf<HasMeasurementBuilder<typeof root>>().toEqualTypeOf<false>()
    expectTypeOf<HasRecordingBuilder<typeof root>>().toEqualTypeOf<false>()
    expectTypeOf<HasMeasurementBuilder<typeof mobile>>().toEqualTypeOf<false>()
    expectTypeOf<HasRecordingBuilder<typeof mobile>>().toEqualTypeOf<false>()
    expectTypeOf<
      HasMeasurementBuilder<typeof provenance>
    >().toEqualTypeOf<false>()
    expectTypeOf<
      HasRecordingBuilder<typeof provenance>
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

    expectTypeOf<HasMeasurementBuilder<typeof provider>>().toEqualTypeOf<true>()
    expectTypeOf<HasRecordingBuilder<typeof provider>>().toEqualTypeOf<true>()
  })

  it('exposes bounded generated version and package metadata', () => {
    expect(root.groveFhirVersion).toBe('4.0.1')
    expect(root.groveFhirContractVersion).toBe('0.2.0')
    expect(mobile.groveMobilePackageMetadata.packageId).toBe(
      'org.grovealliance.fhir.mobile',
    )
    expect(provider.groveProviderPackageMetadata.packageId).toBe(
      'org.grovealliance.fhir.providers',
    )

    expectTypeOf(root.groveFhirVersion).toEqualTypeOf<'4.0.1'>()
    expectTypeOf(root.groveFhirContractVersion).toEqualTypeOf<'0.2.0'>()
  })

  it('deeply freezes every generated contract read by public builders', () => {
    const heartRate = mobile.sharedMobileMeasurementCatalog['heart-rate']
    expect(Object.isFrozen(mobile.sharedMobileMeasurementCatalog)).toBe(true)
    expect(Object.isFrozen(heartRate)).toBe(true)
    expect(Object.isFrozen(heartRate.code)).toBe(true)
    expect(Object.isFrozen(provider.providerScalarMappings)).toBe(true)
    expect(provider.providerRecordEffectiveRules.oura.daily_activity.kind).toBe(
      'complete-civil-day-period',
    )
    expect(Object.isFrozen(provider.providerRecordEffectiveRules)).toBe(true)
    expect(
      Object.isFrozen(provider.groveProviderPackageMetadata.dependencies),
    ).toBe(true)
    expect(Reflect.set(heartRate.code, 'code', 'mutated-clinical-code')).toBe(
      false,
    )
    expect(heartRate.code.code).toBe('8867-4')
  })
})
