//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  SchemaConverter,
  LocalizedText,
  average,
  chunks,
  advanceDateByDays,
  optionalish,
  optionalishDefault,
} from '@schmiedmayerlab/grove-firebase-utils'
import { z } from 'zod'

// 1. Define schemas with SchemaConverter
const userSchema = z.object({
  name: z.string(),
  // Simple optional field
  age: optionalish(z.number()),
  email: z.email(),
  createdAt: z.date(),
  preferences: z
    .object({
      // Optional with default value
      theme: optionalishDefault(z.enum(['light', 'dark', 'system']), 'system'),
      notifications: optionalishDefault(z.boolean(), true),
    })
    .optional(),
})

type User = z.infer<typeof userSchema>

// 2. Create a schema converter
const userConverter = new SchemaConverter({
  schema: userSchema,
  encode: (user) => ({
    name: user.name,
    age: user.age,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    preferences: user.preferences,
  }),
})

// Example: Using LocalizedText
const greeting = new LocalizedText({
  en: 'Welcome to our app!',
  es: '¡Bienvenido a nuestra aplicación!',
  de: 'Willkommen in unserer App!',
})

// Example: Using optionalish and optionalishDefault for handling null values
const processUserData = (data: unknown) => {
  // This will handle both undefined and null values for age
  // age: null → undefined
  const user = userSchema.parse(data)

  // preferences.theme will default to 'system' if undefined or null
  // preferences.notifications will default to true if undefined or null
  return user
}

const greetUser = (language: string) => greeting.localize(language)

// Example: Using array utilities
const calculateStatistics = (values: number[]) => ({
  average: average(values),
  batches: chunks(values, 5),
})

// Example: Using date utilities
const getExpirationDate = (fromDate: Date) => advanceDateByDays(fromDate, 30)
