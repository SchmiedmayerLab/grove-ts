//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  parseAbsoluteUri,
  parseEventSequence,
  parseFhirInstant,
  parseKeyEpoch,
  type AbsoluteUri,
  type FhirInstant,
  type Result,
} from '../src/core/index.js'
import {
  deriveEventIdentifier,
  deriveOpaqueIdentitySystems,
  validateOpaqueIdentityScope,
  type ApplicationDevice,
  type BusinessIdentifier,
  type DeploymentIdentifierSystems,
  type ExchangeEventContext,
  type HostDevice,
  type MobileMeasurement,
  type OpaqueIdentityScope,
  type OpaqueIdentityScopeInput,
  type StudyEnrollment,
  type Subject,
} from '../src/mobile/index.js'
import type {
  ConnectedProvider,
  NormalizedProviderRecord,
} from '../src/providers/index.js'
import type { ExchangeGraph, Observation } from '../src/r4/index.js'

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

export const subject: Subject = {
  kind: 'logical',
  identifier: {
    system: uri('https://example.org/deployments/patient-pseudonyms'),
    value: 'patient-example',
  },
}

export const study = (value: string): StudyEnrollment => ({
  study: {
    system: uri('https://example.org/deployments/research-studies'),
    value,
  },
  protocol: {
    url: uri(`https://example.org/PlanDefinition/${value}`),
    version: '1',
  },
  enrollment: {
    system: uri('https://example.org/deployments/enrollments'),
    value: `${value}-enrollment`,
  },
})

export const application: ApplicationDevice = {
  sourceDeviceToken: 'converter-app',
  name: 'Example converter',
  version: '0.0.0',
}

export const host: HostDevice = {
  sourceDeviceToken: 'converter-host',
  operatingSystemVersion: '20.0',
}

export const identitySystems: DeploymentIdentifierSystems = unwrap(
  deriveOpaqueIdentitySystems(
    uri('https://example.org/identity'),
    'test-key',
    unwrap(parseKeyEpoch('1')),
  ),
)

export const scopeInput: OpaqueIdentityScopeInput = {
  systems: identitySystems,
  keyId: 'test-key',
  keyEpoch: unwrap(parseKeyEpoch('1')),
  secretBase64Url: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY',
  producerInstance: '1f5c58aa-6ec6-4e79-a682-829a9debd3f5',
}

export const identityScope: OpaqueIdentityScope = unwrap(
  validateOpaqueIdentityScope(scopeInput),
)

export const accountScope: BusinessIdentifier = {
  system: uri('https://example.org/deployments/provider-accounts'),
  value: 'pseudonym-account-001',
}

export const globalScope: BusinessIdentifier = {
  system: uri('https://example.org/provider-key-spaces'),
  value: 'oura-document-uuid-global',
}

export const repositoryScope = (
  provider: ConnectedProvider,
): BusinessIdentifier => (provider === 'oura' ? globalScope : accountScope)

export const conversionInstant: FhirInstant = instant('2026-08-20T12:03:00Z')

export const context = (
  provider: ConnectedProvider = 'withings',
  sequence = '1',
  overrides: Partial<ExchangeEventContext> = {},
): ExchangeEventContext => ({
  subject,
  event: unwrap(
    deriveEventIdentifier(identityScope, unwrap(parseEventSequence(sequence))),
  ),
  identityScope,
  repositoryScope: repositoryScope(provider),
  application,
  host,
  conversionInstant,
  ...overrides,
})

export const writer = (provider: string): ApplicationDevice => ({
  sourceDeviceToken: `writer-${provider}`,
  name: provider,
})

export const record = (
  provider: ConnectedProvider,
  sourceType: string,
  measurement: MobileMeasurement,
): NormalizedProviderRecord =>
  ({
    source: {
      adapter: { kind: 'providers', provider },
      sourceType,
      sourceNativeId: `native-${provider}-${sourceType}`,
      recordingMethod: 'automatically-recorded',
      writer: writer(provider),
    },
    measurements: [measurement],
  }) as NormalizedProviderRecord

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
  graph: ExchangeGraph,
): ReadonlyArray<ExchangeGraph['entry'][number]['resource']> =>
  graph.entry.map((entry) => entry.resource)

export const observationOf = (graph: ExchangeGraph): Observation => {
  const observation = resources(graph).find(
    (resource) => resource.resourceType === 'Observation',
  )
  if (observation?.resourceType !== 'Observation') {
    throw new Error('The graph did not contain its Observation.')
  }
  return observation
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
