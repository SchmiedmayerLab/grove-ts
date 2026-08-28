//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

/** Stable public schema composition; domain refinements live in focused modules. */

import type { z } from 'zod'
import { refineActiveBundle } from './active-graph-semantics.js'
import { r4CollectionBundleSchema } from './base-schemas.js'
import { refineRetractionBundle } from './retraction-graph-semantics.js'
import type {
  GroveMobileExchangeBundle,
  GroveMobileRetractionBundle,
} from './types.js'

export * from './base-schemas.js'
export {
  hasAdmittedAdapterOnlyOutputProfile,
  hasAdmittedActiveDeviceProfile,
  hasAdmittedActiveDocumentReferenceProfile,
} from './profile-semantics.js'
export {
  hasAdmittedActiveProvenanceProfile,
  hasAdmittedMobileObservationProfile,
  hasProhibitedContainedResource,
  isAdmittedActiveEntryResource,
} from './active-graph-semantics.js'

/** Profile-aware parser for one immutable active Grove exchange event. */
export const groveMobileExchangeBundleSchema: z.ZodType<GroveMobileExchangeBundle> =
  r4CollectionBundleSchema.superRefine(
    refineActiveBundle,
  ) as unknown as z.ZodType<GroveMobileExchangeBundle>

/** Profile-aware parser for one append-only Grove source retraction assertion. */
export const groveMobileRetractionBundleSchema: z.ZodType<GroveMobileRetractionBundle> =
  r4CollectionBundleSchema.superRefine(
    refineRetractionBundle,
  ) as unknown as z.ZodType<GroveMobileRetractionBundle>
