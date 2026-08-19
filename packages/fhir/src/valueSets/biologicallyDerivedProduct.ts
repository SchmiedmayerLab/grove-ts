//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * Broad category of biologically derived product.
 * http://hl7.org/fhir/valueset-product-category.html
 */
export const biologicallyDerivedProductCategorySchema = z.enum([
  'organ',
  'tissue',
  'fluid',
  'cells',
  'biologicalAgent',
])

/**
 * Broad category of biologically derived product.
 * http://hl7.org/fhir/valueset-product-category.html
 */
export type BiologicallyDerivedProductCategory = z.infer<
  typeof biologicallyDerivedProductCategorySchema
>

/**
 * Status of biologically derived product.
 * http://hl7.org/fhir/valueset-product-status.html
 */
export const biologicallyDerivedProductStatusSchema = z.enum([
  'available',
  'unavailable',
])

/**
 * Status of biologically derived product.
 * http://hl7.org/fhir/valueset-product-status.html
 */
export type BiologicallyDerivedProductStatus = z.infer<
  typeof biologicallyDerivedProductStatusSchema
>

/**
 * Temperature scale used for storage.
 * http://hl7.org/fhir/valueset-product-storage-scale.html
 */
export const biologicallyDerivedProductStorageScaleSchema = z.enum([
  'farenheit',
  'celsius',
  'kelvin',
])

/**
 * Temperature scale used for storage.
 * http://hl7.org/fhir/valueset-product-storage-scale.html
 */
export type BiologicallyDerivedProductStorageScale = z.infer<
  typeof biologicallyDerivedProductStorageScaleSchema
>
