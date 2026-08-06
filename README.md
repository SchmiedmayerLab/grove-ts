<!--

This source file is part of the Grove open-source project

SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)

SPDX-License-Identifier: MIT

-->

# Grove

[![Build and Test](https://github.com/SchmiedmayerLab/grove-ts/actions/workflows/build-and-test.yml/badge.svg?branch=main)](https://github.com/SchmiedmayerLab/grove-ts/actions/workflows/build-and-test.yml)
[![CodeQL](https://github.com/SchmiedmayerLab/grove-ts/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/SchmiedmayerLab/grove-ts/actions/workflows/codeql.yml)
[![Deployment](https://github.com/SchmiedmayerLab/grove-ts/actions/workflows/deployment.yml/badge.svg?branch=main)](https://github.com/SchmiedmayerLab/grove-ts/actions/workflows/deployment.yml)
[![codecov](https://codecov.io/gh/SchmiedmayerLab/grove-ts/branch/main/graph/badge.svg)](https://codecov.io/gh/SchmiedmayerLab/grove-ts)

Grove provides reusable TypeScript tooling, accessible React components, and Firebase utilities for building reliable web and cloud applications.

## Packages

| Package                                                                                  | Description                                                |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [`@schmiedmayerlab/grove-configurations`](./packages/configurations)                     | Shared ESLint and Prettier configurations                  |
| [`@schmiedmayerlab/grove-design-system`](./packages/design-system)                       | Reusable React components, layouts, forms, and utilities   |
| [`@schmiedmayerlab/grove-firebase-cloud-messaging`](./packages/firebase-cloud-messaging) | Firebase Cloud Messaging and device-registration utilities |
| [`@schmiedmayerlab/grove-firebase-fhir`](./packages/firebase-fhir)                       | Type-safe FHIR R4B schemas and helpers                     |
| [`@schmiedmayerlab/grove-firebase-utils`](./packages/firebase-utils)                     | Shared Firebase and data-conversion utilities              |

## Development

Requirements:

- Node.js 24
- npm

Install dependencies, build every package, and run the test suites:

```bash
npm ci
npm run build
npm test
```

Workspace-specific commands can be run with npm's `--workspace` option:

```bash
npm run build --workspace @schmiedmayerlab/grove-design-system
npm test --workspace @schmiedmayerlab/grove-firebase-utils
```

See each package's README for installation and API details.

## Contributing

Contributions to this project are welcome. Please read the [contribution guidelines](https://github.com/SchmiedmayerLab/.github/blob/main/CONTRIBUTING.md) and the [Contributor Covenant Code of Conduct](https://github.com/SchmiedmayerLab/.github/blob/main/CODE_OF_CONDUCT.md) first.

## License

This project is licensed under the MIT License. See [LICENSE.md](LICENSE.md), [LICENSES](LICENSES), and [CONTRIBUTORS.md](CONTRIBUTORS.md) for more information.

## Contributors

This project is developed as part of the Schmiedmayer Lab at Stanford University.
See [CONTRIBUTORS.md](CONTRIBUTORS.md) for a full list of all contributors.

## Our Research

For more information, visit the [Schmiedmayer Lab GitHub organization](https://github.com/SchmiedmayerLab).

![Stanford and Stanford Medicine logos](https://raw.githubusercontent.com/SchmiedmayerLab/.github/main/assets/stanford-footer-light.png#gh-light-mode-only)
![Stanford and Stanford Medicine logos](https://raw.githubusercontent.com/SchmiedmayerLab/.github/main/assets/stanford-footer-dark.png#gh-dark-mode-only)
