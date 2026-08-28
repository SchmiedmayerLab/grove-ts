//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import type { AbsoluteUri, FhirInstant } from '../src/core/index.js'
import {
  parseAbsoluteUri,
  parseFhirInstant,
  type Result,
} from '../src/index.js'
import type {
  ApplicationDeviceInput,
  DeploymentIdentityInput,
  MobileMeasurement,
  ResourceIdentityInput,
} from '../src/mobile/index.js'
import type {
  buildProviderMeasurementBundle,
  ConnectedProvider,
  ProviderPatientReferenceInput,
  ProviderMeasurementBundleInput,
  ProviderResearchStudyReferenceInput,
} from '../src/providers/index.js'
import type { GroveMobileExchangeBundle } from '../src/r4/index.js'

export const unwrap = <T>(result: Result<T>): T => {
  if (!result.ok) {
    throw new Error(result.issues.map((issue) => issue.message).join('\n'))
  }
  return result.value
}

export const uri = (value: string): AbsoluteUri =>
  unwrap(parseAbsoluteUri(value))
export const instant = (value: string): FhirInstant =>
  unwrap(parseFhirInstant(value))
export const patient: ProviderPatientReferenceInput = {
  type: 'Patient',
  identifier: {
    system: uri('https://example.org/deployments/patient-pseudonyms'),
    value: 'patient-example',
    assurance: 'deployment-scoped-pseudonym',
  },
}
export const study = (value: string): ProviderResearchStudyReferenceInput => ({
  type: 'ResearchStudy',
  identifier: {
    system: uri('https://example.org/deployments/research-studies'),
    value,
  },
})
export const resourceIdentity = (
  system: string,
  value: string,
): ResourceIdentityInput => ({
  identifier: { system: uri(system), value },
})

export const application: ApplicationDeviceInput = {
  sourceDeviceToken: 'converter-app',
  name: 'Example converter',
  version: '0.0.0',
}

export const deploymentIdentity: DeploymentIdentityInput = {
  opaqueIdentifierSystems: {
    'source-record': uri('https://example.org/identity/source-record/test/1'),
    'source-output': uri('https://example.org/identity/source-output/test/1'),
    'writer-record': uri('https://example.org/identity/writer-record/test/1'),
    'provider-record': uri(
      'https://example.org/identity/provider-record/test/1',
    ),
    'provider-output': uri(
      'https://example.org/identity/provider-output/test/1',
    ),
    'source-artifact': uri(
      'https://example.org/identity/source-artifact/test/1',
    ),
    'provider-artifact': uri(
      'https://example.org/identity/provider-artifact/test/1',
    ),
    'source-context': uri('https://example.org/identity/source-context/test/1'),
    'recording-device': uri(
      'https://example.org/identity/recording-device/test/1',
    ),
    'device-snapshot': uri(
      'https://example.org/identity/device-snapshot/test/1',
    ),
  },
  eventIdentifierSystem: uri('https://example.org/identity/event'),
  entryNodeIdentifierSystem: uri('https://example.org/identity/entry-node'),
  keyId: 'test-key',
  keyEpoch: '1',
  secretBase64Url: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY',
  producerInstance: '1f5c58aa-6ec6-4e79-a682-829a9debd3f5',
}

export const dateTime: FhirInstant = instant('2026-08-20T12:00:00Z')
export const start: FhirInstant = instant('2026-08-20T00:00:00Z')
export const end: FhirInstant = instant('2026-08-20T12:00:00Z')
export const dailyEnd: FhirInstant = instant('2026-08-21T00:00:00Z')

export const heartRateMeasurement: Extract<
  MobileMeasurement,
  { readonly kind: 'heart-rate' }
> = {
  kind: 'heart-rate',
  value: 64,
  effective: { kind: 'date-time', value: dateTime },
}

export const bloodPressureMeasurement: Extract<
  MobileMeasurement,
  { readonly kind: 'blood-pressure' }
> = {
  kind: 'blood-pressure',
  systolic: 118,
  diastolic: 76,
  effective: { kind: 'date-time', value: dateTime },
}

export const baseInput = (
  provider: ConnectedProvider,
  sourceType: string,
  measurement: MobileMeasurement,
): ProviderMeasurementBundleInput =>
  ({
    subject: patient,
    measurements: [measurement],
    source: {
      adapter: { kind: 'providers', provider },
      providerScopeIdentifier:
        provider === 'oura' ?
          {
            system: uri('https://example.org/provider-key-spaces'),
            value: 'oura-document-uuid-global',
            assurance: 'documented-global-key-space',
          }
        : {
            system: uri('https://example.org/deployments/provider-accounts'),
            value: `pseudonym-${provider}-001`,
            assurance: 'deployment-scoped-account-pseudonym',
          },
      sourceType,
      sourceNativeId: `native-${provider}-${sourceType}`,
      recordingMethod: 'automatically-recorded',
      dataOrigin: {
        sourceDeviceToken: `data-origin-${provider}`,
        name: provider,
      },
    },
    application,
    eventSequence: '1',
    deploymentIdentity,
    occurred: instant('2026-08-20T12:00:00Z'),
    recorded: instant('2026-08-20T12:02:00Z'),
    assembled: instant('2026-08-20T12:03:00Z'),
  }) as ProviderMeasurementBundleInput

export const scalarCases: ReadonlyArray<{
  readonly provider: ConnectedProvider
  readonly sourceType: string
  readonly measurement: MobileMeasurement
}> = [
  {
    provider: 'google-health-api',
    sourceType: 'weight',
    measurement: {
      kind: 'body-weight',
      value: 72.5,
      effective: { kind: 'date-time', value: dateTime },
    },
  },
  {
    provider: 'google-health-api',
    sourceType: 'core-body-temperature',
    measurement: {
      kind: 'body-temperature',
      value: 36.8,
      effective: { kind: 'date-time', value: dateTime },
    },
  },
  {
    provider: 'google-health-api',
    sourceType: 'height',
    measurement: {
      kind: 'body-height',
      value: 178,
      effective: { kind: 'date-time', value: dateTime },
    },
  },
  {
    provider: 'google-health-api',
    sourceType: 'steps',
    measurement: {
      kind: 'step-count',
      value: 8234,
      effective: { kind: 'period', start, end },
    },
  },
  {
    provider: 'oura',
    sourceType: 'daily_activity',
    measurement: {
      kind: 'distance',
      value: 6123,
      effective: { kind: 'period', start, end: dailyEnd },
    },
  },
  {
    provider: 'google-health-api',
    sourceType: 'active-energy-burned',
    measurement: {
      kind: 'active-energy',
      value: 430,
      effective: { kind: 'period', start, end },
    },
  },
  {
    provider: 'oura',
    sourceType: 'sleep',
    measurement: {
      kind: 'sleep-duration',
      value: 7.4,
      effective: { kind: 'period', start, end },
    },
  },
  {
    provider: 'withings',
    sourceType: 'getmeas:9+10',
    measurement: bloodPressureMeasurement,
  },
  {
    provider: 'withings',
    sourceType: 'getmeas:11',
    measurement: heartRateMeasurement,
  },
  {
    provider: 'withings',
    sourceType: 'getmeas:54',
    measurement: {
      kind: 'oxygen-saturation',
      value: 98,
      effective: { kind: 'date-time', value: dateTime },
    },
  },
]

export const resources = (
  result: ReturnType<typeof buildProviderMeasurementBundle>,
): ReadonlyArray<GroveMobileExchangeBundle['entry'][number]['resource']> => {
  if (!result.ok) throw new Error(JSON.stringify(result.issues))
  return result.value.entry.map((entry) => entry.resource)
}

export const mutableRecord = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Expected ${label} to be a JSON object.`)
  }
  return value as Record<string, unknown>
}
