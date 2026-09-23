//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  groveProducerDiagnostics,
  type ProducerDiagnosticCode,
} from '../contract/measurement-catalog.generated.js'
import type { Issue } from '../core/index.js'

export type { ProducerDiagnosticCode }

type LocationPath = ReadonlyArray<number | string>

/**
 * Rules a producer reports about a record it refused or trimmed; they have no FHIR element,
 * except a source-offset warning, whose emitter passes the effective element as its location.
 */
export type ClientRecordRule = Extract<
  ProducerDiagnosticCode,
  `${string}-input.${string}` | `${string}-omission.${string}`
>
type GraphRule = Exclude<ProducerDiagnosticCode, ClientRecordRule>

const entryIndex = (path: LocationPath): number | undefined => {
  const index = path.indexOf('entry')
  const candidate = index === -1 ? undefined : path[index + 1]
  return typeof candidate === 'number' ? candidate : undefined
}

const bundleEntry = (path: LocationPath): string =>
  `Bundle.entry[${entryIndex(path) ?? 0}]`
const entryResource = (path: LocationPath): string =>
  `${bundleEntry(path)}.resource`
const entryKey = (path: LocationPath): string =>
  `${bundleEntry(path)}.extension.valueIdentifier`
const provenanceTarget = (
  path: LocationPath,
  ordinalOffset: number,
): string => {
  const ordinal = path.at(ordinalOffset)
  return `Provenance.target[${typeof ordinal === 'number' ? String(ordinal) : '0'}]`
}
const fixed = (location: string) => (): string => location

/**
 * Stable FHIR-facing locations for every graph rule. Array ordinals remain dynamic,
 * while logical resource paths intentionally avoid leaking parser-internal paths.
 * The table is closed over the registry, so a newly registered graph rule fails to
 * compile until it names its location; a rule about a refused or trimmed record has none.
 */
const groveRuleLocations = {
  'health-connect-provenance.data-origin-agent': fixed(
    'Provenance.entity[0].agent',
  ),
  'healthkit-clinical.fhir-representation': (path) =>
    `${entryResource(path)}.content[0].attachment.contentType`,
  'healthkit-device.application-bundle-identifier': fixed('Device.identifier'),
  'healthkit-ecg.output-graph': entryResource,
  'mobile-device.host-device-identity': fixed('Device.identifier'),
  'mobile-device.recording-device-dual-identity': fixed('Device.identifier'),
  'mobile-exchange.adapter-provenance-graph': fixed('Provenance.entity'),
  'mobile-exchange.bundle-profile': fixed('Bundle.meta.profile'),
  'mobile-exchange.collection-entry-operation': fixed('Bundle.entry'),
  'mobile-exchange.contained-resource-prohibited': (path) =>
    `${entryResource(path)}.contained`,
  'mobile-exchange.deterministic-full-url': (path) =>
    `${bundleEntry(path)}.fullUrl`,
  'mobile-exchange.distinct-entry-key': entryKey,
  'mobile-exchange.distinct-resource-identity-role': (path) =>
    `${entryResource(path)}.identifier`,
  'mobile-exchange.entry-key-selection': entryKey,
  'mobile-exchange.entry-node-digest': (path) => `${entryKey(path)}.value`,
  'mobile-exchange.entry-node-key': bundleEntry,
  'mobile-exchange.entry-node-ordinal': (path) => `${entryKey(path)}.value`,
  'mobile-exchange.entry-required': fixed('Bundle.entry'),
  'mobile-exchange.entry-resource-type': (path) =>
    `${entryResource(path)}.resourceType`,
  'mobile-exchange.event-identity': fixed('Bundle.identifier.value'),
  'mobile-exchange.event-times': fixed('Bundle.timestamp'),
  'mobile-exchange.identifier-role': fixed('Bundle.identifier'),
  'mobile-exchange.identity-system-role': fixed('Bundle'),
  'mobile-exchange.lifecycle-coding': fixed('Provenance.activity.coding'),
  'mobile-exchange.logical-patient-reference': fixed('Observation.subject'),
  'mobile-exchange.logical-source-entity': fixed('Provenance.entity[0].what'),
  'mobile-exchange.opaque-resource-identity': (path) =>
    `${entryResource(path)}.identifier`,
  'mobile-exchange.output-required': fixed('Bundle.entry'),
  'mobile-exchange.provenance-assembler': fixed('Provenance.agent'),
  'mobile-exchange.provenance-profile': fixed('Provenance.meta.profile'),
  'mobile-exchange.provenance-targets': fixed('Provenance.target'),
  'mobile-exchange.reference-declared-type': fixed('Observation.subject.type'),
  'mobile-exchange.reference-shape': fixed('Observation.subject'),
  'mobile-exchange.reference-target-type': fixed(
    'Observation.subject.reference',
  ),
  'mobile-exchange.resolved-reference': (path) =>
    `${entryResource(path)}.subject.reference`,
  'mobile-exchange.single-source-entity': fixed('Provenance.entity'),
  'mobile-exchange.transform-provenance': fixed('Bundle.entry'),
  'mobile-exchange.unclassified': fixed('Bundle'),
  'mobile-output.adapter-only-profile': fixed('Specimen.meta.profile'),
  'mobile-output.adapter-source-marker': (path) =>
    `${entryResource(path)}.extension`,
  'mobile-output.document-profile': fixed('DocumentReference.meta.profile'),
  'mobile-output.fixed-quantity-unit': (path) =>
    `${entryResource(path)}.valueQuantity.code`,
  'mobile-output.hybrid-companion': (path) =>
    `${entryResource(path)}.meta.profile`,
  'mobile-output.quantity-value-domain': (path) =>
    `${entryResource(path)}.valueQuantity.value`,
  'mobile-output.semantic-profile': fixed('Observation.meta.profile'),
  'mobile-output.source-output-required': (path) =>
    `${entryResource(path)}.identifier`,
  'mobile-retraction.distinct-target': (path) =>
    `${provenanceTarget(path, -2)}.identifier`,
  'mobile-retraction.logical-target': (path) => provenanceTarget(path, -1),
  'mobile-retraction.native-record-identifier': (path) =>
    `${provenanceTarget(path, -2)}.extension.valueIdentifier.type`,
  'mobile-retraction.no-clinical-copy': entryResource,
  'mobile-retraction.opaque-target': (path) =>
    `${provenanceTarget(path, -2)}.identifier.value`,
  'mobile-retraction.provenance': fixed('Bundle.entry'),
  'mobile-retraction.role-target-type': (path) =>
    `${provenanceTarget(path, -2)}.type`,
  'mobile-retraction.target-required': fixed('Provenance.target'),
  'mobile-retraction.target-role': (path) =>
    `${provenanceTarget(path, -2)}.extension`,
  'mobile-support.study-context': entryResource,
  'mobile-support.connected': fixed('Bundle.entry'),
  'mobile-support.device-profile': fixed('Device.meta.profile'),
  'mobile-support.questionnaire-response-profile': fixed(
    'QuestionnaireResponse.meta.profile',
  ),
  'sensor-recording-document.embedded-integrity': fixed(
    'DocumentReference.content[0].attachment.hash',
  ),
  'sensor-recording-document.format': fixed(
    'DocumentReference.content[0].format.code',
  ),
  'sensor-recording-document.identity-and-content': fixed(
    'DocumentReference.identifier',
  ),
} satisfies Readonly<Record<GraphRule, (path: LocationPath) => string>>

const isGraphRule = (code: ProducerDiagnosticCode): code is GraphRule =>
  Object.hasOwn(groveRuleLocations, code)

export const isProducerDiagnosticCode = (
  code: unknown,
): code is ProducerDiagnosticCode =>
  typeof code === 'string' && Object.hasOwn(groveProducerDiagnostics, code)

/** The stable FHIR-facing location of a graph rule; a client record rule has none. */
export const groveRuleLocation = (
  code: ProducerDiagnosticCode,
  path: LocationPath,
): string | undefined =>
  isGraphRule(code) ? groveRuleLocations[code](path) : undefined

export interface GroveRuleIssueOptions {
  /** Overrides the table location when the rule fires at another element. */
  readonly location?: string | undefined
  /** The typed detail of a refusal; the registry reason stands when absent. */
  readonly message?: string | undefined
}

export const groveRuleIssue = (
  code: ProducerDiagnosticCode,
  path: LocationPath,
  options: GroveRuleIssueOptions = {},
): Issue => {
  const row = groveProducerDiagnostics[code]
  const location = options.location ?? groveRuleLocation(code, path)
  return {
    severity: row.severity,
    code,
    path,
    message: options.message ?? row.reason,
    reason: row.reason,
    ...(location === undefined ? {} : { location }),
  }
}

/** Structured producer-rule payload a Grove refinement attaches to its zod issue. */
export const groveRuleParameters = (
  code: ProducerDiagnosticCode,
  path: LocationPath,
  options: GroveRuleIssueOptions = {},
): Readonly<Record<string, unknown>> => {
  const location = options.location ?? groveRuleLocation(code, path)
  return {
    groveRuleCode: code,
    ...(location === undefined ? {} : { groveRuleLocation: location }),
    ...(options.message === undefined ?
      {}
    : { groveRuleMessage: options.message }),
  }
}

/** Rebuilds the producer-rule Issue a refinement recorded on its zod issue params. */
export const groveRuleIssueFromParameters = (
  parameters: Readonly<Record<string, unknown>> | undefined,
  path: LocationPath,
): Issue | undefined => {
  const code = parameters?.groveRuleCode
  if (!isProducerDiagnosticCode(code)) return undefined
  const location = parameters?.groveRuleLocation
  const message = parameters?.groveRuleMessage
  return groveRuleIssue(code, path, {
    location: typeof location === 'string' ? location : undefined,
    message: typeof message === 'string' ? message : undefined,
  })
}
