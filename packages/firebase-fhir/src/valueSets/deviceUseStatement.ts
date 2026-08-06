//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * A coded concept indicating the current status of the Device Usage.
 * http://hl7.org/fhir/valueset-device-statement-status.html
 */
export const deviceUseStatementStatusSchema = z.enum([
  'active',
  'completed',
  'entered-in-error',
  'intended',
  'stopped',
  'on-hold',
])

/**
 * A coded concept indicating the current status of the Device Usage.
 * http://hl7.org/fhir/valueset-device-statement-status.html
 */
export type DeviceUseStatementStatus = z.infer<
  typeof deviceUseStatementStatusSchema
>
