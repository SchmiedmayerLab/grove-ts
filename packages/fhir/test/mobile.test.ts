//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { expectTypeOf } from 'expect-type'
import {
  parseAbsoluteUri,
  parseFhirId,
  parseFhirInstant,
  type FhirInstant,
  type Result,
} from '../src/core/index.js'
import { canonicalizeBoundedJcsIdentity } from '../src/mobile/identity.js'
import * as mobile from '../src/mobile/index.js'
import {
  canonicalizeEntryIdentifier,
  canonicalizeMobileEffectiveInstant,
  createEntryIdentity,
  deriveEntryFullUrl,
  groveFhirContractVersion,
  groveFhirExchangeIdentity,
  groveFhirVersion,
  groveMobilePackageMetadata,
  mobileEffectiveCanonicalizationVectors,
  sharedMobileMeasurementCatalog,
  type MobileMeasurement,
} from '../src/mobile/index.js'
import * as mobileContract from '../src/mobile/measurement-catalog.generated.js'

const unwrap = <T>(result: Result<T>): T => {
  if (!result.ok) throw new Error(result.issues[0]?.message)
  return result.value
}

const uri = (value: string) => unwrap(parseAbsoluteUri(value))
const instant = (value: string): FhirInstant => unwrap(parseFhirInstant(value))

describe('source-neutral Mobile contract', () => {
  it('exports only source-neutral data, types, identity, and time contracts', () => {
    expect(groveFhirVersion).toBe('4.0.1')
    expect(groveFhirContractVersion).toBe('0.2.0')
    expect(groveMobilePackageMetadata.packageId).toBe(
      'org.grovealliance.fhir.mobile',
    )
    expect(Object.isFrozen(groveMobilePackageMetadata)).toBe(true)
    expect('buildConnectedHealthMeasurementBundle' in mobile).toBe(false)
    expect('connectedHealthAdapterCatalog' in mobile).toBe(false)
    expect('groveFhirProfileCanonicals' in mobile).toBe(false)
    expect('PROFILES' in mobile).toBe(false)
    expect('connectedHealthAdapterCatalog' in mobileContract).toBe(false)
    expect('connectedHealthScalarMappings' in mobileContract).toBe(false)
    expect('groveConnectedHealthPackageMetadata' in mobileContract).toBe(false)
  })
  it('contains only evidenced shared measurements', () => {
    const entries = Object.values(sharedMobileMeasurementCatalog)
    expect(entries).toHaveLength(13)
    expect(sharedMobileMeasurementCatalog).not.toHaveProperty('body-mass-index')
    expect(sharedMobileMeasurementCatalog).not.toHaveProperty('blood-glucose')

    for (const definition of entries) {
      expect(definition).not.toHaveProperty('coverage')
      expect(definition).not.toHaveProperty('coverageDetails')
    }
    expect(JSON.stringify(sharedMobileMeasurementCatalog)).not.toMatch(
      /healthkit|health-connect|sensorkit|google-health-api|oura|withings|sourceTokens/u,
    )
    expect(Object.isFrozen(sharedMobileMeasurementCatalog)).toBe(true)
    expect(Object.isFrozen(entries[0])).toBe(true)
  })

  it('keeps the source-neutral measurement union discriminated', () => {
    const measurement = {
      kind: 'heart-rate',
      value: 64,
      effective: {
        kind: 'date-time',
        value: instant('2026-08-20T12:00:00Z'),
      },
    } as const satisfies MobileMeasurement
    expectTypeOf(measurement).toExtend<MobileMeasurement>()
    expect(measurement.kind).toBe('heart-rate')
  })
})

describe('Mobile exchange entry identity', () => {
  it('canonicalizes the bounded nested string-array identity grammar', () => {
    expect(
      canonicalizeBoundedJcsIdentity([
        ['https://example.org/source', 'record-1'],
        '2',
      ]),
    ).toEqual({
      ok: true,
      value: '[["https://example.org/source","record-1"],"2"]',
    })
    expect(canonicalizeBoundedJcsIdentity('invalid-\ud800').ok).toBe(false)
  })

  it.each(groveFhirExchangeIdentity.vectors)(
    'matches the IG $case vector',
    (vector) => {
      expect(
        deriveEntryFullUrl({
          system: uri(vector.system),
          value: vector.value,
        }),
      ).toEqual({ ok: true, value: vector.fullUrl })
    },
  )

  it('retains a complete business Identifier and optional repository id', () => {
    const identifier = {
      system: uri('https://example.org/identifiers'),
      value: 'record-1',
    }
    const id = unwrap(parseFhirId('repository-id'))
    const fullUrl = unwrap(deriveEntryFullUrl(identifier))
    const result = createEntryIdentity(identifier, id)
    expect(result.ok && result.value).toEqual({
      identifier,
      id,
      fullUrl,
    })
    expect(result.ok && Object.isFrozen(result.value)).toBe(true)
    expect(Object.isFrozen(identifier)).toBe(false)
    identifier.value = 'caller-mutated-after-construction'
    expect(result.ok && result.value.identifier.value).toBe('record-1')
  })

  it.each([
    { system: '/relative', value: 'record-1' },
    { system: 'https://example.org/identifiers', value: '' },
    { system: 'https://example.org/identifiers', value: ' \t\n ' },
    { system: 'https://example.org/identifiers', value: 'invalid-\ud800' },
    { system: 'https://example.org/identifiers', value: 'invalid-\udc00' },
  ])('rejects incomplete or non-Unicode-scalar identity %#', (input) => {
    expect(
      canonicalizeEntryIdentifier({
        system: input.system as never,
        value: input.value,
      }).ok,
    ).toBe(false)
  })

  it('rejects an invalid repository id and accepts a valid surrogate pair', () => {
    const identifier = {
      system: uri('https://example.org/identifiers'),
      value: 'valid-😀',
    }
    expect(deriveEntryFullUrl(identifier).ok).toBe(true)
    expect(createEntryIdentity(identifier, 'invalid/id' as never).ok).toBe(
      false,
    )
  })
})

describe('Mobile effective-time canonicalization', () => {
  it.each(mobileEffectiveCanonicalizationVectors)(
    'matches the IG $id vector',
    ({ input, output }) => {
      expect(canonicalizeMobileEffectiveInstant(input)).toEqual({
        ok: true,
        value: output,
      })
    },
  )

  it.each([
    42,
    'not-an-instant',
    '2026-08-20T12:00:00',
    '9999-12-31T23:59:59.9996Z',
  ])('fails closed for invalid or out-of-range instant %p', (value) => {
    expect(canonicalizeMobileEffectiveInstant(value).ok).toBe(false)
  })
})
