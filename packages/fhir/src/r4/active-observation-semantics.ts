//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import type { z } from 'zod'
import {
  addIssue,
  asRecord,
  codingCount,
  codingCountForSystem,
  type UnknownRecord,
} from './graph-schema-utils.js'
import {
  groveMobilePackageMetadata,
  groveProfileClaims,
} from '../contract/measurement-catalog.generated.js'
import { providerAdapterCatalog } from '../contract/providers.generated.js'
import { compareFhirDateTimes } from '../core/primitives.js'
import {
  ALL_MEASUREMENT_DEFINITIONS,
  PROVIDER_ROWS,
  profileCanonical,
  providerObservationProfiles,
  violatesQuantityDomain,
  type MeasurementDefinition,
} from '../providers/measurement-definition.js'

const MEASUREMENT_BY_PROFILE: ReadonlyMap<string, MeasurementDefinition> =
  new Map(
    ALL_MEASUREMENT_DEFINITIONS.flatMap((definition) => {
      const canonical = profileCanonical(definition.profile)
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
        typeof profile === 'string' && providerObservationProfiles.has(profile),
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
  const semanticProfile = profileCanonical(match.profile)
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
  const admittedPrimaryCodes: ReadonlySet<string> = new Set<string>([
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
    addIssue(context, 'mobile-output.semantic-profile', [...path, 'code'], {
      location: 'Observation.code',
    })
  }
  for (const required of requiredCodings) {
    if (codingCount(observation.code, required.system, required.code) !== 1) {
      addIssue(context, 'mobile-output.semantic-profile', [...path, 'code'], {
        location: 'Observation.code',
      })
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
        'mobile-output.semantic-profile',
        [...path, 'category'],
        {
          location: 'Observation.category',
        },
      )
    }
  } else if (categories.length > 0) {
    addIssue(context, 'mobile-output.semantic-profile', [...path, 'category'], {
      location: 'Observation.category',
    })
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
        'mobile-output.semantic-profile',
        [...path, 'effectiveDateTime'],
        {
          location: 'Observation.effective[x]',
        },
      )
    }
  } else if (match.effective === 'Period') {
    const period = asRecord(observation.effectivePeriod)
    if (typeof period?.start !== 'string' || typeof period.end !== 'string') {
      addIssue(
        context,
        'mobile-output.semantic-profile',
        [...path, 'effectivePeriod'],
        {
          location: 'Observation.effective[x]',
        },
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
        'mobile-output.semantic-profile',
        [...path, 'effectiveDateTime'],
        {
          location: 'Observation.effective[x]',
        },
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
  const aggregationSystem = `${groveMobilePackageMetadata.canonical}/CodeSystem/grove-aggregation-method`
  if (match.method !== undefined) {
    if (
      codingCount(observation.method, aggregationSystem, match.method.code) !==
        1 ||
      codingCountForSystem(observation.method, aggregationSystem) !== 1
    ) {
      addIssue(context, 'mobile-output.semantic-profile', [...path, 'method'], {
        location: 'Observation.method',
      })
    }
  } else if (match.methodChoice !== undefined) {
    const admittedMethods: readonly string[] = match.methodChoice
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
      addIssue(context, 'mobile-output.semantic-profile', [...path, 'method'], {
        location: 'Observation.method',
      })
    }
  }
}

const validateQuantityValueDomain = (
  value: unknown,
  match: MeasurementDefinition,
  context: z.core.$RefinementCtx,
  path: ReadonlyArray<number | string>,
): void => {
  if (typeof value !== 'number' || !violatesQuantityDomain(value, match)) return
  addIssue(context, 'mobile-output.quantity-value-domain', [
    ...path,
    'valueQuantity',
    'value',
  ])
}

const POSITIVE_PERIOD_CONSTRAINT = 'grove-step-count-period-1'

const validatePositivePeriod = (
  observation: UnknownRecord,
  match: MeasurementDefinition,
  context: z.core.$RefinementCtx,
  path: ReadonlyArray<number | string>,
): void => {
  const obeys: readonly string[] = match.obeys ?? []
  if (!obeys.includes(POSITIVE_PERIOD_CONSTRAINT)) return
  const period = asRecord(observation.effectivePeriod)
  if (
    typeof period?.start === 'string' &&
    typeof period.end === 'string' &&
    compareFhirDateTimes(period.start, period.end) === 0
  ) {
    addIssue(
      context,
      'mobile-output.semantic-profile',
      [...path, 'effectivePeriod'],
      {
        location: 'Observation.effectivePeriod',
      },
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
    addIssue(context, 'mobile-output.fixed-quantity-unit', [
      ...path,
      'valueQuantity',
    ])
  }
  validateQuantityValueDomain(valueQuantity?.value, match, context, path)
  validatePositivePeriod(observation, match, context, path)
}

const validateCodeableConceptResult = (
  observation: UnknownRecord,
  match: MeasurementDefinition,
  context: z.core.$RefinementCtx,
  path: ReadonlyArray<number | string>,
): void => {
  const result = asRecord(observation.valueCodeableConcept)
  const codings = Array.isArray(result?.coding) ? result.coding : []
  const allowedValues: ReadonlySet<string> = new Set<string>(
    match.allowedValues ?? [],
  )
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
      'mobile-output.semantic-profile',
      [...path, 'valueCodeableConcept'],
      {
        location: 'Observation.valueCodeableConcept',
      },
    )
  }
}

const validateDateTimeResult = (
  observation: UnknownRecord,
  context: z.core.$RefinementCtx,
  path: ReadonlyArray<number | string>,
): void => {
  if (typeof observation.valueDateTime !== 'string') {
    addIssue(
      context,
      'mobile-output.semantic-profile',
      [...path, 'valueDateTime'],
      {
        location: 'Observation.valueDateTime',
      },
    )
  }
}

const validateGroupingResult = (
  observation: UnknownRecord,
  context: z.core.$RefinementCtx,
  path: ReadonlyArray<number | string>,
): void => {
  const members =
    Array.isArray(observation.hasMember) ? observation.hasMember : []
  if (members.length === 0) {
    addIssue(
      context,
      'mobile-output.semantic-profile',
      [...path, 'hasMember'],
      {
        location: 'Observation.hasMember',
      },
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
    const componentQuantity = definition.quantity
    const optional = definition.cardinality === '0..1'
    if (
      matchingIndexes.length > 1 ||
      (!optional && matchingIndexes.length !== 1) ||
      (matchedIndex !== undefined &&
        matchedComponentIndexes.has(matchedIndex)) ||
      (matching !== undefined &&
        codingCountForSystem(matching.code, definition.system) !== 1) ||
      (matching !== undefined &&
        componentQuantity !== undefined &&
        (typeof quantity?.value !== 'number' ||
          !Number.isFinite(quantity.value) ||
          quantity.comparator !== undefined ||
          quantity.system !== componentQuantity.system ||
          quantity.code !== componentQuantity.code ||
          quantity.unit !== componentQuantity.unit))
    ) {
      addIssue(
        context,
        'mobile-output.semantic-profile',
        [...path, 'component'],
        {
          location: 'Observation.component',
        },
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
      validateDateTimeResult(observation, context, path)
      break
    case 'grouping':
      validateGroupingResult(observation, context, path)
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
    addIssue(context, 'mobile-output.semantic-profile', [
      ...path,
      'meta',
      'profile',
    ])
    return
  }
  const { match } = admission
  if (match === null) return
  if (observation.status !== 'final') {
    addIssue(context, 'mobile-output.semantic-profile', [...path, 'status'], {
      location: 'Observation.status',
    })
  }
  validateObservationCodes(observation, match, context, path)
  validateObservationCategory(observation, match, context, path)
  validateObservationEffective(observation, match, context, path)
  validateObservationMethod(observation, match, context, path)
  validateObservationResult(observation, match, context, path)
}
