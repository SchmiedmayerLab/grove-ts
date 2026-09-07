//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { groveExchangeRuleDiagnostics } from '../contract/measurement-catalog.generated.js'
import type { Issue } from '../core/index.js'

export type GroveExchangeRuleCode = keyof typeof groveExchangeRuleDiagnostics

const entryIndex = (
  path: ReadonlyArray<number | string>,
): number | undefined => {
  const index = path.indexOf('entry')
  const candidate = index === -1 ? undefined : path[index + 1]
  return typeof candidate === 'number' ? candidate : undefined
}

type LocationPath = ReadonlyArray<number | string>

const bundleEntry = (path: LocationPath): string =>
  `Bundle.entry[${entryIndex(path) ?? 0}]`
const provenanceTarget = (
  path: LocationPath,
  ordinalOffset: number,
): string => {
  const ordinal = path.at(ordinalOffset)
  return `Provenance.target[${typeof ordinal === 'number' ? String(ordinal) : '0'}]`
}
const fixed = (location: string) => (): string => location

/**
 * Stable FHIR-facing locations for producer rules. Array ordinals remain dynamic,
 * while logical resource paths intentionally avoid leaking parser-internal paths.
 * `groveRuleLocation` indexes this table by the registry, so a newly registered rule
 * fails to compile until it names its location. A rule this package implements ahead
 * of the pinned registry may be named here, so registering it costs no edit.
 */
const groveRuleLocations = {
  'healthkit-clinical.fhir-representation': (path) =>
    `${bundleEntry(path)}.resource.content[0].attachment.contentType`,
  'healthkit-ecg.output-graph': (path) => `${bundleEntry(path)}.resource`,
  'mobile-device.recording-device-dual-identity': fixed('Device.identifier'),
  'mobile-exchange.collection-entry-operation': fixed('Bundle.entry'),
  'mobile-exchange.contained-resource-prohibited': (path) =>
    `${bundleEntry(path)}.resource.contained`,
  'mobile-exchange.deterministic-full-url': (path) =>
    `${bundleEntry(path)}.fullUrl`,
  'mobile-exchange.entry-node-digest': (path) =>
    `${bundleEntry(path)}.extension.valueIdentifier.value`,
  'mobile-exchange.entry-node-key': bundleEntry,
  'mobile-exchange.entry-node-ordinal': (path) =>
    `${bundleEntry(path)}.extension.valueIdentifier.value`,
  'mobile-exchange.entry-resource-type': (path) =>
    `${bundleEntry(path)}.resource.resourceType`,
  'mobile-exchange.event-identity': fixed('Bundle.identifier.value'),
  'mobile-exchange.identity-system-role': fixed('Bundle'),
  'mobile-exchange.lifecycle-coding': fixed('Provenance.activity.coding'),
  'mobile-exchange.logical-patient-reference': fixed('Observation.subject'),
  'mobile-exchange.logical-source-entity': fixed('Provenance.entity[0].what'),
  'mobile-exchange.provenance-profile': fixed('Provenance.meta.profile'),
  'mobile-exchange.reference-declared-type': fixed('Observation.subject.type'),
  'mobile-exchange.reference-shape': fixed('Observation.subject'),
  'mobile-exchange.reference-target-type': fixed(
    'Observation.subject.reference',
  ),
  'mobile-exchange.resolved-reference': (path) =>
    `${bundleEntry(path)}.resource.subject.reference`,
  'mobile-exchange.single-source-entity': fixed('Provenance.entity'),
  'mobile-exchange.transform-provenance': fixed('Bundle.entry'),
  'mobile-exchange.unclassified': fixed('Bundle'),
  'mobile-output.adapter-only-profile': fixed('Specimen.meta.profile'),
  'mobile-output.document-profile': fixed('DocumentReference.meta.profile'),
  'mobile-output.fixed-quantity-unit': (path) =>
    `${bundleEntry(path)}.resource.valueQuantity.code`,
  'mobile-output.hybrid-companion': (path) =>
    `${bundleEntry(path)}.resource.meta.profile`,
  'mobile-output.quantity-value-domain': (path) =>
    `${bundleEntry(path)}.resource.valueQuantity.value`,
  'mobile-output.semantic-profile': fixed('Observation.meta.profile'),
  'mobile-output.source-output-required': (path) =>
    `${bundleEntry(path)}.resource.identifier`,
  'mobile-retraction.logical-target': (path) => provenanceTarget(path, -1),
  'mobile-retraction.native-record-identifier': (path) =>
    `${provenanceTarget(path, -2)}.extension.valueIdentifier.type`,
  'mobile-retraction.no-clinical-copy': (path) =>
    `${bundleEntry(path)}.resource`,
  'mobile-retraction.opaque-target': (path) =>
    `${provenanceTarget(path, -2)}.identifier.value`,
  'mobile-retraction.role-target-type': (path) =>
    `${provenanceTarget(path, -2)}.type`,
  'mobile-retraction.target-role': (path) =>
    `${provenanceTarget(path, -2)}.extension`,
  'mobile-support.connected': fixed('Bundle.entry'),
  'mobile-support.device-profile': fixed('Device.meta.profile'),
  'mobile-support.questionnaire-response-profile': fixed(
    'QuestionnaireResponse.meta.profile',
  ),
  'sensor-recording-document.identity-and-content': fixed(
    'DocumentReference.identifier',
  ),
} satisfies Readonly<Record<string, (path: LocationPath) => string>>

const groveRuleLocation = (
  code: GroveExchangeRuleCode,
  path: LocationPath,
): string => groveRuleLocations[code](path)

const isGroveExchangeRuleCode = (code: string): code is GroveExchangeRuleCode =>
  Object.hasOwn(groveExchangeRuleDiagnostics, code)

// Producer rules are namespaced; anything else is a base schema failure, not a rule.
const isProducerRuleCode = (code: string): code is `${string}.${string}` =>
  code.includes('.')

/** Registered normative reason, or undefined for a rule this package names locally. */
export const groveRuleReason = (code: string): string | undefined =>
  isGroveExchangeRuleCode(code) ?
    groveExchangeRuleDiagnostics[code].reason
  : undefined

/** Structured producer-rule payload a Grove refinement attaches to its zod issue. */
export const groveRuleParameters = (
  code: string,
  path: ReadonlyArray<number | string>,
  location?: string,
): Readonly<Record<string, unknown>> =>
  isGroveExchangeRuleCode(code) ?
    {
      groveRuleCode: code,
      groveRuleLocation: location ?? groveRuleLocation(code, path),
    }
  : { groveRuleCode: code }

export const groveRuleIssue = (
  code: GroveExchangeRuleCode,
  path: ReadonlyArray<number | string>,
): Issue => ({
  severity: groveExchangeRuleDiagnostics[code].severity,
  code,
  path,
  message: groveExchangeRuleDiagnostics[code].reason,
  reason: groveExchangeRuleDiagnostics[code].reason,
  location: groveRuleLocation(code, path),
})

/** Rebuilds the producer-rule Issue a refinement recorded on its zod issue params. */
export const groveRuleIssueFromParameters = (
  parameters: Readonly<Record<string, unknown>> | undefined,
  path: ReadonlyArray<number | string>,
  message: string,
): Issue | undefined => {
  const code = parameters?.groveRuleCode
  if (typeof code !== 'string' || !isProducerRuleCode(code)) return undefined
  if (!isGroveExchangeRuleCode(code)) {
    return { severity: 'error', code, path, message }
  }
  const location = parameters?.groveRuleLocation
  return {
    severity: groveExchangeRuleDiagnostics[code].severity,
    code,
    path,
    message: groveExchangeRuleDiagnostics[code].reason,
    reason: groveExchangeRuleDiagnostics[code].reason,
    location:
      typeof location === 'string' ? location : groveRuleLocation(code, path),
  }
}
