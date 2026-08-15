//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * A code that indicates how the page is generated
 * http://hl7.org/fhir/valueset-guide-page-generation.html
 */
export const guidePageGenerationSchema = z.enum([
  'html',
  'markdown',
  'xml',
  'generated',
])

/**
 * A code that indicates how the page is generated
 * http://hl7.org/fhir/valueset-guide-page-generation.html
 */
export type GuidePageGeneration = z.infer<typeof guidePageGenerationSchema>

/**
 * Code of parameter that is input to the guide
 * http://hl7.org/fhir/valueset-guide-parameter-code.html
 */
export const guideParameterCodeSchema = z.enum([
  'apply',
  'path-resource',
  'path-pages',
  'path-tx-cache',
  'expansion-parameter',
  'rule-broken-links',
  'generate-xml',
  'generate-json',
  'generate-turtle',
  'html-template',
])

/**
 * Code of parameter that is input to the guide
 * http://hl7.org/fhir/valueset-guide-parameter-code.html
 */
export type GuideParameterCode = z.infer<typeof guideParameterCodeSchema>
