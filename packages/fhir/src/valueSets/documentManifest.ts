//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * The status of the document manifest.
 * http://hl7.org/fhir/valueset-document-reference-status.html
 */
export const documentManifestStatusSchema = z.enum([
  'current',
  'superseded',
  'entered-in-error',
])

/**
 * The status of the document manifest.
 * http://hl7.org/fhir/valueset-document-reference-status.html
 */
export type DocumentManifestStatus = z.infer<
  typeof documentManifestStatusSchema
>
