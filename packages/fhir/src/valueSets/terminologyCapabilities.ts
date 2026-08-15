//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * The type of search supported.
 * http://hl7.org/fhir/valueset-code-search-support.html
 */
export const codeSearchSupportSchema = z.enum(['explicit', 'all'])

/**
 * The type of search supported.
 * http://hl7.org/fhir/valueset-code-search-support.html
 */
export type CodeSearchSupport = z.infer<typeof codeSearchSupportSchema>
