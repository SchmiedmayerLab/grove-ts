//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import type { Issue } from '../core/index.js'
import { groveExchangeRuleDiagnostics } from '../contract/measurement-catalog.generated.js'

const ENCODED_RULE_PREFIX = 'grove-producer-rule:'

export type GroveExchangeRuleCode = keyof typeof groveExchangeRuleDiagnostics

export interface GroveExchangeRuleDiagnostic {
  readonly code: GroveExchangeRuleCode
  readonly reason: string
  readonly location: string
  readonly severity: 'error'
}

const entryIndex = (
  path: ReadonlyArray<number | string>,
): number | undefined => {
  const index = path.indexOf('entry')
  const candidate = index === -1 ? undefined : path[index + 1]
  return typeof candidate === 'number' ? candidate : undefined
}

/**
 * Stable FHIR-facing locations for producer rules. Array ordinals remain dynamic,
 * while logical resource paths intentionally avoid leaking parser-internal paths.
 */
const groveRuleLocation = (
  code: GroveExchangeRuleCode,
  path: ReadonlyArray<number | string>,
): string => {
  const index = entryIndex(path)
  const bundleEntry = `Bundle.entry[${index ?? 0}]`
  switch (code) {
    case 'mobile-exchange.entry-node-key':
      return bundleEntry
    case 'mobile-exchange.deterministic-full-url':
      return `${bundleEntry}.fullUrl`
    case 'mobile-exchange.resolved-reference':
      return `${bundleEntry}.resource.subject.reference`
    case 'mobile-output.fixed-quantity-unit':
      return `${bundleEntry}.resource.valueQuantity.code`
    case 'mobile-exchange.event-identity':
      return 'Bundle.identifier.value'
    case 'mobile-exchange.entry-node-digest':
      return `${bundleEntry}.extension.valueIdentifier.value`
    case 'mobile-output.source-output-required':
      return `${bundleEntry}.resource.identifier`
    case 'mobile-exchange.identity-system-role':
      return 'Bundle'
    case 'mobile-exchange.transform-provenance':
      return 'Bundle.entry'
    case 'mobile-retraction.logical-target':
      return `Provenance.target[${typeof path.at(-1) === 'number' ? String(path.at(-1)) : '0'}]`
    case 'mobile-retraction.target-role':
      return `Provenance.target[${typeof path.at(-2) === 'number' ? String(path.at(-2)) : '0'}].extension`
    case 'mobile-retraction.opaque-target':
      return `Provenance.target[${typeof path.at(-2) === 'number' ? String(path.at(-2)) : '0'}].identifier.value`
    case 'mobile-retraction.no-clinical-copy':
      return `${bundleEntry}.resource`
    case 'mobile-exchange.lifecycle-coding':
      return 'Provenance.activity.coding'
    case 'mobile-output.semantic-profile':
      return 'Observation.meta.profile'
    case 'mobile-exchange.reference-target-type':
      return 'Observation.subject.reference'
    case 'mobile-exchange.reference-declared-type':
      return 'Observation.subject.type'
    case 'mobile-exchange.logical-source-entity':
      return 'Provenance.entity[0].what'
    case 'mobile-retraction.role-target-type':
      return `Provenance.target[${typeof path.at(-2) === 'number' ? String(path.at(-2)) : '0'}].type`
    case 'mobile-exchange.single-source-entity':
      return 'Provenance.entity'
    case 'mobile-exchange.reference-shape':
    case 'mobile-exchange.logical-patient-reference':
      return 'Observation.subject'
    case 'mobile-exchange.entry-resource-type':
      return `${bundleEntry}.resource.resourceType`
    case 'mobile-output.adapter-only-profile':
      return 'Specimen.meta.profile'
    case 'mobile-exchange.contained-resource-prohibited':
      return `${bundleEntry}.resource.contained`
    case 'mobile-output.document-profile':
      return 'DocumentReference.meta.profile'
    case 'mobile-support.device-profile':
      return 'Device.meta.profile'
    case 'mobile-exchange.provenance-profile':
      return 'Provenance.meta.profile'
    case 'mobile-support.connected':
      return 'Bundle.entry'
  }
}

const isGroveExchangeRuleCode = (code: string): code is GroveExchangeRuleCode =>
  Object.hasOwn(groveExchangeRuleDiagnostics, code)

const groveRuleDiagnostic = (
  code: GroveExchangeRuleCode,
  location: string,
): GroveExchangeRuleDiagnostic => ({
  code,
  reason: groveExchangeRuleDiagnostics[code].reason,
  location,
  severity: groveExchangeRuleDiagnostics[code].severity,
})

export const encodeGroveRuleDiagnostic = (
  code: string,
  path: ReadonlyArray<number | string>,
  fallbackMessage: string,
  location?: string,
): string =>
  isGroveExchangeRuleCode(code) ?
    `${ENCODED_RULE_PREFIX}${JSON.stringify(groveRuleDiagnostic(code, location ?? groveRuleLocation(code, path)))}`
  : `${code}: ${fallbackMessage}`

export const decodeGroveRuleDiagnostic = (
  message: string,
): GroveExchangeRuleDiagnostic | undefined => {
  if (!message.startsWith(ENCODED_RULE_PREFIX)) return undefined
  try {
    const candidate = JSON.parse(message.slice(ENCODED_RULE_PREFIX.length)) as {
      readonly code?: unknown
      readonly reason?: unknown
      readonly location?: unknown
      readonly severity?: unknown
    }
    if (
      typeof candidate.code !== 'string' ||
      !isGroveExchangeRuleCode(candidate.code) ||
      candidate.reason !==
        groveExchangeRuleDiagnostics[candidate.code].reason ||
      candidate.severity !==
        groveExchangeRuleDiagnostics[candidate.code].severity ||
      typeof candidate.location !== 'string' ||
      candidate.location.length === 0
    ) {
      return undefined
    }
    return candidate as GroveExchangeRuleDiagnostic
  } catch {
    return undefined
  }
}

export const groveRuleIssue = (
  code: GroveExchangeRuleCode,
  path: ReadonlyArray<number | string>,
): Issue => {
  const diagnostic = groveRuleDiagnostic(code, groveRuleLocation(code, path))
  return {
    severity: diagnostic.severity,
    code: diagnostic.code,
    path,
    message: diagnostic.reason,
    reason: diagnostic.reason,
    location: diagnostic.location,
  }
}
