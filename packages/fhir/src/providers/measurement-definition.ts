//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import type { ConnectedProvider } from './types.js'
import { sharedMobileMeasurementCatalog } from '../contract/measurement-catalog.generated.js'
import {
  adapterMeasurementCatalog,
  groveProviderProfileCanonicals,
  providerAdapterCatalog,
  providerScalarOutputRoles,
} from '../contract/providers.generated.js'

type SharedCatalog = typeof sharedMobileMeasurementCatalog
type AdapterCatalog = typeof adapterMeasurementCatalog

type Values<Catalog> = Catalog extends Catalog ? Catalog[keyof Catalog] : never
type KeysOfUnion<Member> = Member extends Member ? keyof Member : never
type ValueOfUnion<Member, Key extends PropertyKey> =
  Member extends Member ?
    Key extends keyof Member ?
      Member[Key]
    : never
  : never

type Scalar = string | number | boolean | null | undefined

/**
 * Collapses a union of catalog rows into the one shape they collectively describe:
 * keys every row carries stay required, keys only some rows carry become optional,
 * and literal element types widen through arrays and nested objects. Renaming a
 * generated field breaks compilation here instead of silently producing `undefined`.
 */
type Merged<Member> =
  Extract<Member, Scalar> | MergedStructure<Exclude<Member, Scalar>>

// `keyof Member & string` keeps the mapped types non-homomorphic, so a union of rows
// merges into one shape instead of distributing back into a union.
type SharedKeys<Member> = keyof Member & string
type MergedStructure<Member> =
  [Member] extends [never] ? never
  : [Member] extends [ReadonlyArray<infer Element>] ?
    ReadonlyArray<Merged<Element>>
  : {
      readonly [Key in SharedKeys<Member>]: Merged<ValueOfUnion<Member, Key>>
    } & {
      readonly [
        Key in Exclude<KeysOfUnion<Member> & string, SharedKeys<Member>>
      ]?: Merged<ValueOfUnion<Member, Key>>
    }

export type MeasurementDefinition = Merged<
  Values<SharedCatalog> | Values<Values<AdapterCatalog>>
>

/** One connected-provider row of the generated adapter catalog. */
export type ProviderContractRow =
  (typeof providerAdapterCatalog.providers)[number]

export const PROVIDER_ROWS: readonly ProviderContractRow[] =
  providerAdapterCatalog.providers

export const providerObservationProfiles: ReadonlySet<string> = new Set(
  PROVIDER_ROWS.map(({ observationProfile }) => observationProfile),
)

/** Resolves a catalog profile id to the canonical URL the IG publishes for it. */
export const profileCanonical = (profile: string): string | undefined =>
  PROFILE_CANONICALS[profile]

const PROFILE_CANONICALS: Readonly<Record<string, string>> =
  groveProviderProfileCanonicals

const SHARED_DEFINITIONS: Readonly<Record<string, MeasurementDefinition>> =
  sharedMobileMeasurementCatalog
const OWNER_DEFINITIONS: Readonly<
  Record<string, Readonly<Record<string, MeasurementDefinition>>>
> = adapterMeasurementCatalog

/** Every shared and owner-exclusive definition the catalogs publish. */
export const ALL_MEASUREMENT_DEFINITIONS: readonly MeasurementDefinition[] = [
  ...Object.values(SHARED_DEFINITIONS),
  ...Object.values(OWNER_DEFINITIONS).flatMap((owner) => Object.values(owner)),
]

interface NumericBoundary {
  readonly value: number
  readonly inclusive: boolean
}

const violatesMinimum = (value: number, boundary: NumericBoundary): boolean =>
  value < boundary.value || (!boundary.inclusive && value === boundary.value)

const violatesMaximum = (value: number, boundary: NumericBoundary): boolean =>
  value > boundary.value || (!boundary.inclusive && value === boundary.value)

/** Whether a numeric result falls outside its catalog-reviewed representational domain. */
export const violatesQuantityDomain = (
  value: number,
  definition: MeasurementDefinition,
): boolean => {
  const domain = definition.quantity?.valueDomain
  if (domain === undefined) return false
  return (
    violatesMinimum(value, domain.minimum) ||
    (domain.maximum !== undefined && violatesMaximum(value, domain.maximum)) ||
    (domain.integerOnly && !Number.isInteger(value))
  )
}

const providerContractRow = (
  provider: ConnectedProvider,
): ProviderContractRow | undefined =>
  PROVIDER_ROWS.find((candidate) => candidate.id === provider)

/** Resolves only a shared definition or one owned by this exact connected provider. */
export const providerMeasurementDefinition = (
  provider: ConnectedProvider,
  kind: string,
): MeasurementDefinition | undefined =>
  SHARED_DEFINITIONS[kind] ??
  OWNER_DEFINITIONS[providerContractRow(provider)?.measurementOwner ?? '']?.[
    kind
  ]

/** Resolves a shared definition by kind, independent of any provider. */
export const sharedMeasurementDefinition = (
  kind: string,
): MeasurementDefinition | undefined => SHARED_DEFINITIONS[kind]

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
  Record<string, MeasurementDefinition>
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
