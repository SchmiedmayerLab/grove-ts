//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * The status of the response to an individual message header.
 * http://hl7.org/fhir/valueset-response-code.html
 */
export const messageHeaderResponseCodeSchema = z.enum([
  'ok',
  'transient-error',
  'fatal-error',
])

/**
 * The status of the response to an individual message header.
 * http://hl7.org/fhir/valueset-response-code.html
 */
export type MessageHeaderResponseCode = z.infer<
  typeof messageHeaderResponseCodeSchema
>
