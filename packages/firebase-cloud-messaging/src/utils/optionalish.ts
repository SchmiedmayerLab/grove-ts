//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

/**
 * Utility for handling optional fields in schemas
 */

import { type z } from 'zod'

/**
 * Creates a schema that transforms null values to undefined
 *
 * @param schema The Zod schema to make optionalish
 * @returns A schema that transforms null to undefined
 */
export const optionalish = <T extends z.ZodType>(schema: T) =>
  schema.nullable().transform<z.infer<T> | undefined>((val) => {
    return val ?? undefined
  })

/**
 * Creates a schema that provides a default value when null is encountered
 *
 * @param schema The Zod schema to make optionalish with default
 * @param defaultValue The default value to use when null is encountered
 * @returns A schema that uses the default value for null
 */
export const optionalishDefault = <T extends z.ZodType>(
  schema: T,
  defaultValue: z.infer<T>,
) =>
  schema
    .nullable()
    .default(null)
    .transform<z.infer<T>>((val) => {
      return val ?? defaultValue
    })
