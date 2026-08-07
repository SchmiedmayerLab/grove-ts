<!--

This source file is part of the Grove open-source project

SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)

SPDX-License-Identifier: MIT

-->

# Grove Configurations

[![Build and Test](https://github.com/SchmiedmayerLab/grove-ts/actions/workflows/build-and-test.yml/badge.svg)](https://github.com/SchmiedmayerLab/grove-ts/actions/workflows/build-and-test.yml)
[![Deployment](https://github.com/SchmiedmayerLab/grove-ts/actions/workflows/deployment.yml/badge.svg)](https://github.com/SchmiedmayerLab/grove-ts/actions/workflows/deployment.yml)

## Getting Started

Shared ESLint and Prettier configurations that can be added to TypeScript projects with minimal setup.

Configurations are opinionated and strict. We aim to catch as many possible mistakes or elements we consider harmful practices early. Some rules are meant to be broken once in a while, with an explanation comment around them.

### Installation

Install dependencies:

```bash
npm install --save-dev prettier eslint @schmiedmayerlab/grove-configurations
```

Create an `eslint.config.mjs` file.

If aiming for React, use:

```javascript
import { getEslintReactConfig } from '@schmiedmayerlab/grove-configurations'

export default getEslintReactConfig({ tsconfigRootDir: import.meta.dirname })
```

If aiming for Node application, use:

```javascript
import { getEslintNodeConfig } from '@schmiedmayerlab/grove-configurations'

export default getEslintNodeConfig({ tsconfigRootDir: import.meta.dirname })
```

Create a `.prettierrc.mjs` file:

```javascript
import { prettierConfig } from '@schmiedmayerlab/grove-configurations'

export default prettierConfig
```

Now, when you run `eslint . --fix`, code is going to be linted and formatted.

### ESLint customization

We aim to make this config mostly plug and play. You can adjust ESLint to your needs by passing additional configuration pieces.

```javascript
export default [
  ...getEslintNodeConfig({ tsconfigRootDir: import.meta.dirname }),
  {
    ignores: ['lib/**/*'], // Ignore generated build files
  },
  {
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off', // ignore unwanted rule
    },
  },
]
```

For more complex scenarios, we expose smaller pieces of configuration. You can use them and do micro-adjustments. This is not the recommended approach.

```javascript
import {
  getEslintRules,
  getNodeGlobals,
  getPreferArrowFunctions,
  getReactPlugins,
  getPrettierPlugin,
  getTslint,
} from '@schmiedmayerlab/grove-configurations'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  ...getEslintRules(),
  getNodeGlobals(),
  {
    ...getTslint(),
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir,
      },
    },
  },
  getPreferArrowFunctions(),
  ...getReactPlugins(),
  ...getPrettierPlugin(),
)
```

## License

This project is licensed under the MIT License. See [Licenses](https://github.com/SchmiedmayerLab/grove-ts/tree/main/LICENSES) for more information.

## Contributors

This project is developed as part of the Schmiedmayer Lab at Stanford University.
See the repository's [CONTRIBUTORS.md](../../CONTRIBUTORS.md).
