<!--

This source file is part of the Grove open-source project

SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)

SPDX-License-Identifier: MIT

-->

# Grove Firebase Utils

[![Build and Test](https://github.com/SchmiedmayerLab/grove-ts/actions/workflows/build-and-test.yml/badge.svg)](https://github.com/SchmiedmayerLab/grove-ts/actions/workflows/build-and-test.yml)
[![codecov](https://codecov.io/gh/SchmiedmayerLab/grove-ts/graph/badge.svg)](https://codecov.io/gh/SchmiedmayerLab/grove-ts)

A collection of utility functions for Firebase projects, for TypeScript applications. This package provides core utilities used by other Grove Firebase packages.

## Installation

```bash
npm install @schmiedmayerlab/grove-firebase-utils
```

## Features

- **Schema Converters**: Type-safe data conversion with Zod
- **Localization**: Easily handle multi-language text with fallbacks
- **Array Helpers**: Functions for working with arrays (average, median, percentile, etc.)
- **Date Utilities**: Simple date manipulation functions
- **Lazy Loading**: Generic lazy initialization pattern

## Usage Examples

### Schema Converter

```typescript
import { SchemaConverter } from '@schmiedmayerlab/grove-firebase-utils'
import { z } from 'zod'

const userSchema = z.object({
  name: z.string(),
  email: z.email(),
  age: z.number().optional(),
})

const userConverter = new SchemaConverter({
  schema: userSchema,
  encode: (user) => ({
    name: user.name,
    email: user.email,
    age: user.age,
  }),
})
```

### Localized Text

```typescript
import { LocalizedText } from '@schmiedmayerlab/grove-firebase-utils'

const greeting = new LocalizedText({
  en: 'Hello',
  es: 'Hola',
  fr: 'Bonjour',
})

console.log(greeting.localize('fr')) // 'Bonjour'
console.log(greeting.localize('de', 'en')) // 'Hello' (fallback)
```

## License

This project is licensed under the MIT License. See [Licenses](https://github.com/SchmiedmayerLab/grove-ts/tree/main/LICENSES) for more information.

## Contributors

This project is developed as part of the Schmiedmayer Lab at Stanford University.
See the repository's [CONTRIBUTORS.md](../../CONTRIBUTORS.md).
