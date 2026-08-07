<!--

This source file is part of the Grove open-source project

SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)

SPDX-License-Identifier: MIT

-->

# Grove

[![GitHub Release](https://img.shields.io/github/v/release/SchmiedmayerLab/grove-ts?display_name=tag&include_prereleases&sort=semver)](https://github.com/SchmiedmayerLab/grove-ts/releases)
[![Build and Test](https://github.com/SchmiedmayerLab/grove-ts/actions/workflows/build-and-test.yml/badge.svg?branch=main)](https://github.com/SchmiedmayerLab/grove-ts/actions/workflows/build-and-test.yml)
[![CodeQL](https://github.com/SchmiedmayerLab/grove-ts/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/SchmiedmayerLab/grove-ts/actions/workflows/codeql.yml)
[![Deployment](https://github.com/SchmiedmayerLab/grove-ts/actions/workflows/deployment.yml/badge.svg?branch=main)](https://github.com/SchmiedmayerLab/grove-ts/actions/workflows/deployment.yml)
[![codecov](https://codecov.io/gh/SchmiedmayerLab/grove-ts/branch/main/graph/badge.svg)](https://codecov.io/gh/SchmiedmayerLab/grove-ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE.md)

Grove gives TypeScript teams a dependable foundation for building web and cloud applications.
It packages recurring engineering decisions—from code quality rules to interface and data integrations—so projects can start consistently, stay type-safe, and focus on their own functionality.

## See Grove in Action

[![Digital health research dashboard composed with the light Grove design system](https://schmiedmayerlab.github.io/grove-ts/storybook/grove-showcase-light.png#gh-light-mode-only)](https://schmiedmayerlab.github.io/grove-ts/storybook/?path=/story/examples-grove-showcase--light)
[![Digital health research dashboard composed with the dark Grove design system](https://schmiedmayerlab.github.io/grove-ts/storybook/grove-showcase-dark.png#gh-dark-mode-only)](https://schmiedmayerlab.github.io/grove-ts/storybook/?path=/story/examples-grove-showcase--dark)

The example demonstrates how the Grove design system helps teams build custom digital health and research interfaces from reusable, accessible, and themeable React components.
Explore the [live Storybook](https://schmiedmayerlab.github.io/grove-ts/storybook/?path=/story/examples-grove-showcase--light) to experience the light and dark themes, components, and their variants.

## Packages

| Package                                                                                  | Use it for                                                   |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [`@schmiedmayerlab/grove-configurations`](./packages/configurations)                     | Shared ESLint and Prettier configuration for Node and React  |
| [`@schmiedmayerlab/grove-design-system`](./packages/design-system)                       | React components, layouts, forms, themes, and utilities      |
| [`@schmiedmayerlab/grove-firebase-cloud-messaging`](./packages/firebase-cloud-messaging) | Cloud Messaging, device registration, and notification flows |
| [`@schmiedmayerlab/grove-firebase-fhir`](./packages/firebase-fhir)                       | FHIR R4B schemas, validation, and Firebase helpers           |
| [`@schmiedmayerlab/grove-firebase-utils`](./packages/firebase-utils)                     | Shared Firebase converters and application utilities         |

Each package README contains focused setup and usage guidance.
The [design system documentation](https://schmiedmayerlab.github.io/grove-ts/docs/) provides a guided introduction, while [Storybook](https://schmiedmayerlab.github.io/grove-ts/storybook/) lets you explore the components interactively.
Packages are independently installable from the `@schmiedmayerlab` npm scope and use one coordinated release version.

## Quick Start

Grove packages require Node.js 24 or later.
Install the package you need directly:

```bash
npm install @schmiedmayerlab/grove-design-system
```

Development-only tooling belongs in `devDependencies`:

```bash
npm install --save-dev @schmiedmayerlab/grove-configurations
```

Design system applications can follow the browser or operating-system appearance with one provider option:

```tsx
<GroveProvider router={routerProps} colorScheme="system">
  {children}
</GroveProvider>
```

Continue with the selected package's README for required peer dependencies and configuration.
Grove is currently pre-1.0, so review the [release notes](https://github.com/SchmiedmayerLab/grove-ts/releases) when upgrading.

## Development

To work on Grove itself, install:

- Node.js 24
- npm 12

Clone the repository and install the package and documentation dependencies:

```bash
git clone https://github.com/SchmiedmayerLab/grove-ts.git
cd grove-ts
npm ci
npm ci --prefix packages/design-system/docs
```

Run the complete local quality gate before requesting review:

```bash
npm run validate
```

For faster iteration, target a single workspace with npm's `--workspace` option:

```bash
npm run build --workspace @schmiedmayerlab/grove-design-system
npm test --workspace @schmiedmayerlab/grove-firebase-utils
```

Useful repository-wide commands include:

| Command                 | Purpose                                                    |
| ----------------------- | ---------------------------------------------------------- |
| `npm run build`         | Build every workspace                                      |
| `npm test`              | Run release and workspace tests                            |
| `npm run test:coverage` | Run workspace tests with coverage                          |
| `npm run lint:ci`       | Run linting with no warnings allowed                       |
| `npm run analyze`       | Check dead files, dependencies, exports, and import cycles |
| `npm run docs`          | Start the design system documentation locally              |
| `npm run validate`      | Run the complete validation suite used before review       |

## Releases

Grove uses fixed, bare semantic versions such as `0.1.0` across all packages; prerelease versions such as `0.2.0-beta.1` use the npm `next` tag.
Publishing a GitHub release runs the validation pipeline, publishes missing versions through npm Trusted Publishing, verifies the registry state, and deploys the documentation and Storybook.

Maintainers can create a normal release in the GitHub interface or with:

```bash
gh release create 0.2.0 --target main --title 0.2.0 --generate-notes
```

### Bootstrap a New npm Package

An unpublished package needs a one-time token-based publication before npm Trusted Publishing can be configured.
Temporarily add an `NPM_TOKEN` repository secret and manually run **Deployment** from `main`.
Use `*` for the repository's first publication or comma-separated package names for selected new workspaces:

```bash
gh workflow run deployment.yml --ref main \
  -f packageVersion=0.1.0 \
  -f bootstrapPackages='*'
```

For example, set `bootstrapPackages` to `@schmiedmayerlab/grove-new-package` when adding a single workspace later.

After the bootstrap succeeds, configure the package's npm trusted publisher with organization `SchmiedmayerLab`, repository `grove-ts`, and workflow `deployment.yml`, then delete the token secret.
The workflow verifies and skips versions already present on npm, making recovery from an interrupted release safe.

## Contributing

Contributions to this project are welcome. Please read the [contribution guidelines](https://github.com/SchmiedmayerLab/.github/blob/main/CONTRIBUTING.md) and the [Contributor Covenant Code of Conduct](https://github.com/SchmiedmayerLab/.github/blob/main/CODE_OF_CONDUCT.md) first.
Planned work is tracked in [GitHub Issues](https://github.com/SchmiedmayerLab/grove-ts/issues) and the organization-wide [Grove Project](https://github.com/orgs/SchmiedmayerLab/projects/3).

## License

This project is licensed under the MIT License. See [LICENSE.md](LICENSE.md), [LICENSES](LICENSES), and [CONTRIBUTORS.md](CONTRIBUTORS.md) for more information.

## Contributors

This project is developed as part of the Schmiedmayer Lab at Stanford University.
See [CONTRIBUTORS.md](CONTRIBUTORS.md) for a full list of all contributors.

## Our Research

For more information, visit the [Schmiedmayer Lab GitHub organization](https://github.com/SchmiedmayerLab).

![Stanford and Stanford Medicine logos](https://raw.githubusercontent.com/SchmiedmayerLab/.github/main/assets/stanford-footer-light.png#gh-light-mode-only)
![Stanford and Stanford Medicine logos](https://raw.githubusercontent.com/SchmiedmayerLab/.github/main/assets/stanford-footer-dark.png#gh-dark-mode-only)
