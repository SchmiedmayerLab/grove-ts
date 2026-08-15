//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * EvidenceVariable Handling
 * http://hl7.org/fhir/ValueSet/variable-handling
 */
export const evidenceVariableHandlingSchema = z.enum([
  'continuous',
  'dichotomous',
  'ordinal',
  'polychotomous',
])

/**
 * EvidenceVariable Handling
 * http://hl7.org/fhir/ValueSet/variable-handling
 */
export type EvidenceVariableHandling = z.infer<
  typeof evidenceVariableHandlingSchema
>

/**
 * Group Measure
 * http://hl7.org/fhir/ValueSet/group-measure
 */
export const groupMeasureSchema = z.enum([
  'mean',
  'median',
  'mean-of-mean',
  'mean-of-median',
  'median-of-mean',
  'median-of-median',
])

/**
 * Group Measure
 * http://hl7.org/fhir/ValueSet/group-measure
 */
export type GroupMeasure = z.infer<typeof groupMeasureSchema>
