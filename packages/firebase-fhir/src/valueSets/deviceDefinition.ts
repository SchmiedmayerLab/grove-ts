//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * The type of name the device is referred by.
 * http://hl7.org/fhir/valueset-device-nametype.html
 */
export const deviceDefinitionNameTypeSchema = z.enum([
  'udi-label-name',
  'user-friendly-name',
  'patient-reported-name',
  'manufacturer-name',
  'model-name',
  'other',
])

/**
 * The type of name the device is referred by.
 * http://hl7.org/fhir/valueset-device-nametype.html
 */
export type DeviceDefinitionNameType = z.infer<
  typeof deviceDefinitionNameTypeSchema
>
