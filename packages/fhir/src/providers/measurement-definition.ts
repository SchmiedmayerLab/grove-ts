//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  adapterMeasurementCatalog,
  groveProviderProfileCanonicals,
  providerAdapterCatalog,
  providerScalarOutputRoles,
} from '../contract/providers.generated.js'
import type { ConnectedProvider } from './types.js'
import { sharedMobileMeasurementCatalog } from '../contract/measurement-catalog.generated.js'

export interface ProviderMeasurementDefinition {
  readonly id: string
  readonly profile: string
  readonly owner?: string
  readonly code: Readonly<{
    system: string
    code: string
    display?: string
  }>
  readonly requiredCodings?: ReadonlyArray<
    Readonly<{ system: string; code: string }>
  >
  readonly category?: Readonly<{
    system: string
    code: string
    display?: string
  }>
  readonly effective: 'Period' | 'dateTime' | 'dateTime-or-Period'
  readonly obeys?: readonly string[]
  readonly method?: Readonly<{ code: string; display?: string }>
  readonly methodChoice?: readonly string[]
  readonly valueKind:
    'codeableConcept' | 'components' | 'dateTime' | 'grouping' | 'quantity'
  readonly quantity?: Readonly<{
    system: string
    code: string
    unit?: string
    valueDomain?: Readonly<{
      minimum: Readonly<{ value: number; inclusive: boolean }>
      maximum?: Readonly<{ value: number; inclusive: boolean }>
      integerOnly: boolean
    }>
  }> | null
  readonly resultCodeSystem?: string
  readonly allowedValues?: readonly string[]
  readonly components?: ReadonlyArray<
    Readonly<{
      id: string
      system: string
      code: string
      quantity?: Readonly<{ system: string; code: string; unit?: string }>
    }>
  >
}

const SHARED_DEFINITIONS =
  sharedMobileMeasurementCatalog as unknown as Readonly<
    Record<string, ProviderMeasurementDefinition>
  >
const OWNER_DEFINITIONS = adapterMeasurementCatalog as unknown as Readonly<
  Record<string, Readonly<Record<string, ProviderMeasurementDefinition>>>
>
const PROFILE_CANONICALS = groveProviderProfileCanonicals as Readonly<
  Record<string, string>
>

interface ProviderContractRow {
  readonly id: ConnectedProvider
  readonly measurementOwner: string
  readonly observationProfile: string
}

const PROVIDER_ROWS =
  providerAdapterCatalog.providers as unknown as readonly ProviderContractRow[]

const providerContractRow = (
  provider: ConnectedProvider,
): ProviderContractRow | undefined =>
  PROVIDER_ROWS.find((candidate) => candidate.id === provider)

/** Resolves only a shared definition or one owned by this exact connected provider. */
export const providerMeasurementDefinition = (
  provider: ConnectedProvider,
  kind: string,
): ProviderMeasurementDefinition | undefined =>
  SHARED_DEFINITIONS[kind] ??
  OWNER_DEFINITIONS[providerContractRow(provider)?.measurementOwner ?? '']?.[
    kind
  ]

/** Returns the exact direct semantic canonical for this provider-owned mapping. */
export const providerMeasurementProfile = (
  provider: ConnectedProvider,
  kind: string,
): string | undefined => {
  const profile = providerMeasurementDefinition(provider, kind)?.profile
  return profile === undefined ? undefined : PROFILE_CANONICALS[profile]
}

/** Returns the exact provider-specific Observation envelope required for direct claims. */
export const providerObservationProfile = (
  provider: ConnectedProvider,
): string | undefined => providerContractRow(provider)?.observationProfile

/** Closed owner-exclusive definitions that the normalized Provider facade may parse. */
export const connectedProviderExclusiveDefinitions: Readonly<
  Record<string, ProviderMeasurementDefinition>
> = Object.freeze(
  Object.fromEntries(
    [...new Set(PROVIDER_ROWS.map(({ measurementOwner }) => measurementOwner))]
      .filter((owner) =>
        PROVIDER_ROWS.some(
          ({ id, measurementOwner }) =>
            measurementOwner === owner &&
            Object.hasOwn(providerScalarOutputRoles, id),
        ),
      )
      .flatMap((owner) => Object.entries(OWNER_DEFINITIONS[owner] ?? {})),
  ),
)
