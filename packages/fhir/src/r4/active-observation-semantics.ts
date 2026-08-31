//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

/** Catalog-driven Observation profile and result semantics. */

import type { z } from 'zod'
import {
  addIssue,
  asRecord,
  codingCount,
  codingCountForSystem,
  type UnknownRecord,
} from './graph-schema-utils.js'
import { groveMobileContract } from '../mobile/contract.js'
import {
  groveProfileClaims,
  sharedMobileMeasurementCatalog,
} from '../contract/measurement-catalog.generated.js'
import {
  adapterMeasurementCatalog,
  groveProviderProfileCanonicals,
  providerAdapterCatalog,
} from '../contract/providers.generated.js'
import { compareFhirDateTimes } from '../zod/support.js'

interface MeasurementDefinition {
  readonly id: string
  readonly profile: string
  readonly owner?: string
  readonly code: Readonly<{ system: string; code: string }>
  readonly requiredCodings?: ReadonlyArray<
    Readonly<{
      system: string
      code: string
    }>
  >
  readonly category?: Readonly<{ system: string; code: string }>
  readonly effective: 'Period' | 'dateTime' | 'dateTime-or-Period'
  readonly method?: Readonly<{ code: string }>
  readonly methodChoice?: readonly string[]
  readonly valueKind:
    'codeableConcept' | 'components' | 'dateTime' | 'grouping' | 'quantity'
  readonly quantity?: Readonly<{
    system: string
    code: string
    unit: string
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
      cardinality?: string
      quantity: Readonly<{ system: string; code: string; unit: string }>
    }>
  >
}

const ADAPTER_MEASUREMENT_DEFINITIONS =
  adapterMeasurementCatalog as unknown as Readonly<
    Record<string, Readonly<Record<string, MeasurementDefinition>>>
  >

const MEASUREMENT_DEFINITIONS: readonly MeasurementDefinition[] = [
  ...(Object.values(
    sharedMobileMeasurementCatalog,
  ) as readonly MeasurementDefinition[]),
  ...Object.values(ADAPTER_MEASUREMENT_DEFINITIONS).flatMap((owner) =>
    Object.values(owner),
  ),
]

const PROFILE_CANONICALS = groveProviderProfileCanonicals as Readonly<
  Record<string, string>
>

const MEASUREMENT_BY_PROFILE: ReadonlyMap<string, MeasurementDefinition> =
  new Map(
    MEASUREMENT_DEFINITIONS.flatMap((definition) => {
      const canonical = PROFILE_CANONICALS[definition.profile]
      return canonical === undefined ? [] : [[canonical, definition] as const]
    }),
  )

const SHARED_SEMANTIC_PROFILES: ReadonlySet<string> = new Set([
  ...MEASUREMENT_BY_PROFILE.keys(),
  ...groveProfileClaims.observationAdapterClaim.sharedSensorProfiles,
  ...groveProfileClaims.observationAdapterClaim.standardAdapterClaims.map(
    ({ semanticProfile }) => semanticProfile,
  ),
])

const ADAPTER_OBSERVATION_PROFILES: ReadonlySet<string> = new Set(
  groveProfileClaims.observationAdapterClaim.adapterProfiles,
)

const SENSORKIT_PLATFORM_PROFILES: ReadonlySet<string> = new Set(
  groveProfileClaims.sensorKitPlatformExclusiveClaims.profiles,
)

const SENSORKIT_HYBRID_PROFILES: ReadonlySet<string> = new Set(
  groveProfileClaims.sensorKitHybridObservationClaims.profiles,
)

interface ProviderContractRow {
  readonly id: string
  readonly measurementOwner: string
  readonly observationProfile: string
}

const PROVIDER_ROWS =
  providerAdapterCatalog.providers as unknown as readonly ProviderContractRow[]
const PROVIDER_OBSERVATION_PROFILES: ReadonlySet<string> = new Set(
  PROVIDER_ROWS.map(({ observationProfile }) => observationProfile),
)

const hasExactProviderObservationClaim = (
  observation: UnknownRecord,
  match: MeasurementDefinition | null,
  directProfiles: readonly string[],
): boolean => {
  const providerMarkers =
    Array.isArray(observation.extension) ?
      observation.extension.filter(
        (extension) =>
          asRecord(extension)?.url ===
          providerAdapterCatalog.providerExtension.url,
      )
    : []
  const isProviderClaim =
    providerMarkers.length > 0 ||
    directProfiles.includes(providerAdapterCatalog.adapterProfile) ||
    directProfiles.some(
      (profile) =>
        typeof profile === 'string' &&
        PROVIDER_OBSERVATION_PROFILES.has(profile),
    ) ||
    (match?.owner !== undefined &&
      PROVIDER_ROWS.some(
        ({ measurementOwner }) => measurementOwner === match.owner,
      ))
  if (!isProviderClaim) {
    return true
  }
  if (match === null || providerMarkers.length !== 1) return false

  const providerCode = asRecord(providerMarkers[0])?.valueCode
  const provider = PROVIDER_ROWS.find(({ id }) => id === providerCode)
  const semanticProfile = PROFILE_CANONICALS[match.profile]
  if (
    provider === undefined ||
    semanticProfile === undefined ||
    directProfiles.length !== 2 ||
    new Set(directProfiles).size !== 2 ||
    !directProfiles.includes(semanticProfile) ||
    !directProfiles.includes(provider.observationProfile) ||
    (match.owner !== undefined && provider.measurementOwner !== match.owner)
  ) {
    return false
  }
  return true
}

const setsEqual = (
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): boolean =>
  left.size === right.size && [...left].every((value) => right.has(value))

interface ObservationProfileAdmission {
  readonly match: MeasurementDefinition | null
  readonly directProfiles: readonly string[]
}

const admittedObservationProfile = (
  profiles: unknown,
): ObservationProfileAdmission | undefined => {
  if (!Array.isArray(profiles) || profiles.length === 0) return undefined
  const directProfiles = profiles.filter(
    (profile): profile is string => typeof profile === 'string',
  )
  if (directProfiles.length !== profiles.length) return undefined
  const direct = new Set(directProfiles)
  if (direct.size !== directProfiles.length) return undefined
  if (
    direct.size === 1 &&
    [...direct].every((profile) => SENSORKIT_PLATFORM_PROFILES.has(profile))
  ) {
    return { match: null, directProfiles }
  }
  if (setsEqual(direct, SENSORKIT_HYBRID_PROFILES)) {
    return { match: null, directProfiles }
  }

  const semanticProfiles = [...direct].filter((profile) =>
    SHARED_SEMANTIC_PROFILES.has(profile),
  )
  const [semanticProfile, ...additionalSemanticProfiles] = semanticProfiles
  const adapters = [...direct].filter((profile) =>
    ADAPTER_OBSERVATION_PROFILES.has(profile),
  )
  if (
    semanticProfile === undefined ||
    additionalSemanticProfiles.length > 0 ||
    adapters.length > 1 ||
    direct.size !== semanticProfiles.length + adapters.length
  ) {
    return undefined
  }
  return {
    match: MEASUREMENT_BY_PROFILE.get(semanticProfile) ?? null,
    directProfiles,
  }
}

/** Whether an Observation directly declares one exact catalog-admitted semantic profile shape. */
export const hasAdmittedMobileObservationProfile = (
  resource: unknown,
): boolean => {
  const observation = asRecord(resource)
  if (observation?.resourceType !== 'Observation') return false
  const admission = admittedObservationProfile(
    asRecord(observation.meta)?.profile,
  )
  return (
    admission !== undefined &&
    hasExactProviderObservationClaim(
      observation,
      admission.match,
      admission.directProfiles,
    )
  )
}

const validateObservationCodes = (
  observation: UnknownRecord,
  match: MeasurementDefinition,
  context: z.core.$RefinementCtx,
  path: ReadonlyArray<number | string>,
): void => {
  const requiredCodings = match.requiredCodings ?? []
  const admittedPrimaryCodes = new Set([
    match.code.code,
    ...requiredCodings
      .filter(({ system }) => system === match.code.system)
      .map(({ code }) => code),
  ])
  const primarySystemCodings =
    Array.isArray(asRecord(observation.code)?.coding) ?
      (asRecord(observation.code)?.coding as readonly unknown[]).filter(
        (candidate) => asRecord(candidate)?.system === match.code.system,
      )
    : []
  if (
    codingCount(observation.code, match.code.system, match.code.code) !== 1 ||
    primarySystemCodings.length !== admittedPrimaryCodes.size ||
    primarySystemCodings.some(
      (candidate) =>
        typeof asRecord(candidate)?.code !== 'string' ||
        !admittedPrimaryCodes.has(String(asRecord(candidate)?.code)),
    )
  ) {
    addIssue(
      context,
      `mobile-${match.id}.code`,
      [...path, 'code'],
      `A Grove Mobile ${match.id} Observation requires exactly its closed catalog coding set for ${match.code.system}.`,
    )
  }
  for (const required of requiredCodings) {
    if (codingCount(observation.code, required.system, required.code) !== 1) {
      addIssue(
        context,
        `mobile-${match.id}.required-coding`,
        [...path, 'code'],
        `A Grove Mobile ${match.id} Observation is missing or duplicates required coding ${required.system}|${required.code}.`,
      )
    }
  }
}

const validateObservationCategory = (
  observation: UnknownRecord,
  match: MeasurementDefinition,
  context: z.core.$RefinementCtx,
  path: ReadonlyArray<number | string>,
): void => {
  const categories: readonly unknown[] =
    Array.isArray(observation.category) ? observation.category : []
  const categoryDefinition = match.category
  if (categoryDefinition !== undefined) {
    if (
      categories.reduce<number>(
        (count, category) =>
          count +
          codingCount(
            category,
            categoryDefinition.system,
            categoryDefinition.code,
          ),
        0,
      ) !== 1 ||
      categories.reduce<number>(
        (count, category) =>
          count + codingCountForSystem(category, categoryDefinition.system),
        0,
      ) !== 1
    ) {
      addIssue(
        context,
        `mobile-${match.id}.category`,
        [...path, 'category'],
        `A Grove Mobile ${match.id} Observation requires exactly one catalog category coding.`,
      )
    }
  } else if (categories.length > 0) {
    addIssue(
      context,
      `mobile-${match.id}.category`,
      [...path, 'category'],
      `A Grove Mobile ${match.id} Observation must not invent an uncatalogued clinical category.`,
    )
  }
}

const validateObservationEffective = (
  observation: UnknownRecord,
  match: MeasurementDefinition,
  context: z.core.$RefinementCtx,
  path: ReadonlyArray<number | string>,
): void => {
  if (match.effective === 'dateTime') {
    if (typeof observation.effectiveDateTime !== 'string') {
      addIssue(
        context,
        `mobile-${match.id}.effective`,
        [...path, 'effectiveDateTime'],
        `A Grove Mobile ${match.id} Observation requires effectiveDateTime.`,
      )
    }
  } else if (match.effective === 'Period') {
    const period = asRecord(observation.effectivePeriod)
    if (typeof period?.start !== 'string' || typeof period.end !== 'string') {
      addIssue(
        context,
        `mobile-${match.id}.effective`,
        [...path, 'effectivePeriod'],
        `A Grove Mobile ${match.id} Observation requires a bounded effectivePeriod.`,
      )
    }
  } else {
    const dateTime = observation.effectiveDateTime
    const period = asRecord(observation.effectivePeriod)
    const hasDateTime = typeof dateTime === 'string'
    const hasPeriod =
      typeof period?.start === 'string' && typeof period.end === 'string'
    if (hasDateTime === hasPeriod) {
      addIssue(
        context,
        `mobile-${match.id}.effective`,
        [...path, 'effectiveDateTime'],
        `A Grove Mobile ${match.id} Observation requires exactly one admitted effectiveDateTime or bounded effectivePeriod.`,
      )
    }
  }
}

const validateObservationMethod = (
  observation: UnknownRecord,
  match: MeasurementDefinition,
  context: z.core.$RefinementCtx,
  path: ReadonlyArray<number | string>,
): void => {
  const aggregationSystem = `${groveMobileContract.canonical}/CodeSystem/grove-aggregation-method`
  if (match.method !== undefined) {
    if (
      codingCount(observation.method, aggregationSystem, match.method.code) !==
        1 ||
      codingCountForSystem(observation.method, aggregationSystem) !== 1
    ) {
      addIssue(
        context,
        `mobile-${match.id}.method`,
        [...path, 'method'],
        `A Grove Mobile ${match.id} Observation requires its fixed aggregation method.`,
      )
    }
  } else if (match.methodChoice !== undefined) {
    const admittedMethods = match.methodChoice
    const coding = asRecord(observation.method)?.coding
    const admitted =
      Array.isArray(coding) ?
        coding.filter((candidate) => {
          const item = asRecord(candidate)
          return (
            item?.system === aggregationSystem &&
            typeof item.code === 'string' &&
            admittedMethods.includes(item.code)
          )
        })
      : []
    if (
      admitted.length !== 1 ||
      codingCountForSystem(observation.method, aggregationSystem) !== 1
    ) {
      addIssue(
        context,
        `mobile-${match.id}.method`,
        [...path, 'method'],
        `A Grove Mobile ${match.id} Observation requires exactly one admitted aggregation method.`,
      )
    }
  }
}

const validateQuantityValueDomain = (
  value: unknown,
  match: MeasurementDefinition,
  context: z.core.$RefinementCtx,
  path: ReadonlyArray<number | string>,
): void => {
  const domain = match.quantity?.valueDomain
  if (typeof value !== 'number' || domain === undefined) return
  const belowMinimum =
    value < domain.minimum.value ||
    (!domain.minimum.inclusive && value === domain.minimum.value)
  const aboveMaximum =
    domain.maximum !== undefined &&
    (value > domain.maximum.value ||
      (!domain.maximum.inclusive && value === domain.maximum.value))
  if (
    belowMinimum ||
    aboveMaximum ||
    (domain.integerOnly && !Number.isInteger(value))
  ) {
    addIssue(
      context,
      `mobile-${match.id}.value-domain`,
      [...path, 'valueQuantity', 'value'],
      `A Grove Mobile ${match.id} result must satisfy its catalog-owned value domain.`,
    )
  }
}

const validateStepCountPeriod = (
  observation: UnknownRecord,
  match: MeasurementDefinition,
  context: z.core.$RefinementCtx,
  path: ReadonlyArray<number | string>,
): void => {
  if (match.id !== 'step-count') return
  const period = asRecord(observation.effectivePeriod)
  if (
    typeof period?.start === 'string' &&
    typeof period.end === 'string' &&
    compareFhirDateTimes(period.start, period.end) === 0
  ) {
    addIssue(
      context,
      'mobile-step-count.nonzero-period',
      [...path, 'effectivePeriod'],
      'A Grove Mobile step-count period must have nonzero duration.',
    )
  }
}

const validateQuantityResult = (
  observation: UnknownRecord,
  match: MeasurementDefinition,
  context: z.core.$RefinementCtx,
  path: ReadonlyArray<number | string>,
): void => {
  const quantity = match.quantity
  const valueQuantity = asRecord(observation.valueQuantity)
  if (
    typeof valueQuantity?.value !== 'number' ||
    !Number.isFinite(valueQuantity.value) ||
    valueQuantity.comparator !== undefined ||
    valueQuantity.system !== quantity?.system ||
    valueQuantity.code !== quantity?.code ||
    valueQuantity.unit !== quantity?.unit
  ) {
    addIssue(
      context,
      'mobile-output.fixed-quantity-unit',
      [...path, 'valueQuantity'],
      `A Grove Mobile ${match.id} result requires one finite exact value in fixed UCUM ${String(quantity?.code)}.`,
    )
  }
  validateQuantityValueDomain(valueQuantity?.value, match, context, path)
  validateStepCountPeriod(observation, match, context, path)
}

const validateCodeableConceptResult = (
  observation: UnknownRecord,
  match: MeasurementDefinition,
  context: z.core.$RefinementCtx,
  path: ReadonlyArray<number | string>,
): void => {
  const result = asRecord(observation.valueCodeableConcept)
  const codings = Array.isArray(result?.coding) ? result.coding : []
  const allowedValues = new Set(match.allowedValues ?? [])
  const admitted = codings.filter((candidate) => {
    const coding = asRecord(candidate)
    return (
      coding !== undefined &&
      coding.system === match.resultCodeSystem &&
      typeof coding.code === 'string' &&
      allowedValues.has(coding.code)
    )
  })
  const invalidSameSystem = codings.some((candidate) => {
    const coding = asRecord(candidate)
    return (
      coding !== undefined &&
      coding.system === match.resultCodeSystem &&
      (typeof coding.code !== 'string' || !allowedValues.has(coding.code))
    )
  })
  if (admitted.length !== 1 || invalidSameSystem) {
    addIssue(
      context,
      `mobile-${match.id}.coded-result`,
      [...path, 'valueCodeableConcept'],
      `A Grove Mobile ${match.id} result requires exactly one closed shared result coding.`,
    )
  }
}

const validateDateTimeResult = (
  observation: UnknownRecord,
  match: MeasurementDefinition,
  context: z.core.$RefinementCtx,
  path: ReadonlyArray<number | string>,
): void => {
  if (typeof observation.valueDateTime !== 'string') {
    addIssue(
      context,
      `mobile-${match.id}.date-time-result`,
      [...path, 'valueDateTime'],
      `A Grove Mobile ${match.id} result requires valueDateTime.`,
    )
  }
}

const validateGroupingResult = (
  observation: UnknownRecord,
  match: MeasurementDefinition,
  context: z.core.$RefinementCtx,
  path: ReadonlyArray<number | string>,
): void => {
  const members =
    Array.isArray(observation.hasMember) ? observation.hasMember : []
  if (members.length === 0) {
    addIssue(
      context,
      `mobile-${match.id}.members`,
      [...path, 'hasMember'],
      `A Grove Mobile ${match.id} grouping requires at least one member Observation.`,
    )
  }
}

const validateComponentResult = (
  observation: UnknownRecord,
  match: MeasurementDefinition,
  context: z.core.$RefinementCtx,
  path: ReadonlyArray<number | string>,
): void => {
  const components =
    Array.isArray(observation.component) ? observation.component : []
  const matchedComponentIndexes = new Set<number>()
  for (const definition of match.components ?? []) {
    const matchingIndexes = components.flatMap((component, index) =>
      (
        codingCount(
          asRecord(component)?.code,
          definition.system,
          definition.code,
        ) === 1
      ) ?
        [index]
      : [],
    )
    const matchedIndex = matchingIndexes[0]
    const matching =
      matchedIndex === undefined ? undefined : (
        asRecord(components[matchedIndex])
      )
    const quantity = asRecord(matching?.valueQuantity)
    const optional = definition.cardinality === '0..1'
    if (
      matchingIndexes.length > 1 ||
      (!optional && matchingIndexes.length !== 1) ||
      (matchedIndex !== undefined &&
        matchedComponentIndexes.has(matchedIndex)) ||
      (matching !== undefined &&
        codingCountForSystem(matching.code, definition.system) !== 1) ||
      (matching !== undefined &&
        (typeof quantity?.value !== 'number' ||
          !Number.isFinite(quantity.value) ||
          quantity.comparator !== undefined ||
          quantity.system !== definition.quantity.system ||
          quantity.code !== definition.quantity.code ||
          quantity.unit !== definition.quantity.unit))
    ) {
      addIssue(
        context,
        `mobile-${match.id}.${definition.id}`,
        [...path, 'component'],
        `A Grove Mobile ${match.id} panel admits at most one distinct finite ${definition.id} component in fixed UCUM ${definition.quantity.code}${optional ? '' : ' and requires it'}.`,
      )
    }
    if (matchedIndex !== undefined) matchedComponentIndexes.add(matchedIndex)
  }
}

const validateObservationResult = (
  observation: UnknownRecord,
  match: MeasurementDefinition,
  context: z.core.$RefinementCtx,
  path: ReadonlyArray<number | string>,
): void => {
  switch (match.valueKind) {
    case 'quantity':
      validateQuantityResult(observation, match, context, path)
      break
    case 'codeableConcept':
      validateCodeableConceptResult(observation, match, context, path)
      break
    case 'dateTime':
      validateDateTimeResult(observation, match, context, path)
      break
    case 'grouping':
      validateGroupingResult(observation, match, context, path)
      break
    case 'components':
      validateComponentResult(observation, match, context, path)
      break
  }
}

export const validateMobileObservationSemantics = (
  resource: unknown,
  context: z.core.$RefinementCtx,
  path: ReadonlyArray<number | string>,
): void => {
  const observation = asRecord(resource)
  if (observation?.resourceType !== 'Observation') return
  const admission = admittedObservationProfile(
    asRecord(observation.meta)?.profile,
  )
  if (
    admission === undefined ||
    !hasExactProviderObservationClaim(
      observation,
      admission.match,
      admission.directProfiles,
    )
  ) {
    addIssue(
      context,
      'mobile-output.semantic-profile',
      [...path, 'meta', 'profile'],
      'Every active Observation must directly claim its exact admitted semantic/adapter profile set; connected-provider outputs require their exact provider-specific envelope and marker.',
    )
    return
  }
  const { match } = admission
  if (match === null) return
  if (observation.status !== 'final') {
    addIssue(
      context,
      `mobile-${match.id}.status`,
      [...path, 'status'],
      `A Grove Mobile ${match.id} Observation must be final.`,
    )
  }
  validateObservationCodes(observation, match, context, path)
  validateObservationCategory(observation, match, context, path)
  validateObservationEffective(observation, match, context, path)
  validateObservationMethod(observation, match, context, path)
  validateObservationResult(observation, match, context, path)
}
