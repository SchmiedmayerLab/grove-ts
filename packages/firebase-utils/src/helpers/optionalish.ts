//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * Create an optional schema that handles null values by transforming them to undefined.
 * @param type The Zod schema type to make optionalish
 * @returns A schema that transforms null to undefined and is optional
 */
export const optionalish = <T extends z.core.SomeType>(type: T) =>
  z.union([type, z.null().transform(() => undefined)]).optional()

/**
 * Create an optional schema with a default value when the value is null or undefined.
 * @param type The Zod schema type
 * @param defaultValue The default value to use
 * @returns A schema that uses the default value for null or undefined
 */
export const optionalishDefault = <T extends z.core.SomeType>(
  type: T,
  defaultValue: z.output<T>,
) =>
  z
    .union([type, z.null().transform(() => undefined)])
    .optional()
    .transform((value) => value ?? defaultValue)
