//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * Overall nature of the adverse event, e.g. real or potential.
 * http://hl7.org/fhir/valueset-adverse-event-actuality.html
 */
export const adverseEventActualitySchema = z.enum(['actual', 'potential'])

/**
 * Overall nature of the adverse event, e.g. real or potential.
 * http://hl7.org/fhir/valueset-adverse-event-actuality.html
 */
export type AdverseEventActuality = z.infer<typeof adverseEventActualitySchema>
