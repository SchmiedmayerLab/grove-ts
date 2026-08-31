//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

/** Stable public schema composition; domain refinements live in focused modules. */

import { z } from 'zod'
import { refineActiveBundle } from './active-graph-semantics.js'
import {
  graphResourceSchema,
  identifierSchema,
  r4CollectionBundleSchema,
} from './base-schemas.js'
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

// The envelope every Grove graph Bundle type promises. It runs after the graph
// refinements so a rule keeps reporting its own diagnostic, and it holds the
// refinements to what the exported types assert; only readonly depth stays a cast.
const groveGraphBundleSchema = z.looseObject({
  identifier: identifierSchema,
  timestamp: z.string().min(1),
  entry: z
    .array(
      z.looseObject({
        fullUrl: z.string().min(1),
        resource: graphResourceSchema,
      }),
    )
    .nonempty(),
})

const groveGraphBundle = (refine: typeof refineActiveBundle) =>
  r4CollectionBundleSchema
    .superRefine(refine)
    // The graph rules run first and report their own diagnostics; piping their result
    // through the envelope holds them to what the exported bundle types assert.
    .transform((value): unknown => value)
    .pipe(groveGraphBundleSchema)

/** Profile-aware parser for one immutable active Grove exchange event. */
export const groveMobileExchangeBundleSchema: z.ZodType<GroveMobileExchangeBundle> =
  groveGraphBundle(
    refineActiveBundle,
  ) as unknown as z.ZodType<GroveMobileExchangeBundle>

/** Profile-aware parser for one append-only Grove source retraction assertion. */
export const groveMobileRetractionBundleSchema: z.ZodType<GroveMobileRetractionBundle> =
  groveGraphBundle(
    refineRetractionBundle,
  ) as unknown as z.ZodType<GroveMobileRetractionBundle>
