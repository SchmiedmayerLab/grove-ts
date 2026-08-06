//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * The status of the endpoint.
 * http://hl7.org/fhir/valueset-endpoint-status.html
 */
export const endpointStatusSchema = z.enum([
  'active',
  'suspended',
  'error',
  'off',
  'entered-in-error',
  'test',
])

/**
 * The status of the endpoint.
 * http://hl7.org/fhir/valueset-endpoint-status.html
 */
export type EndpointStatus = z.infer<typeof endpointStatusSchema>
