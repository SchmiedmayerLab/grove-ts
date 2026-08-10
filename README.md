<!--

This source file is part of the Grove open-source project

SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)

SPDX-License-Identifier: MIT

-->

# Grove

[![Build and Test](https://github.com/SchmiedmayerLab/grove-ts/actions/workflows/build-and-test.yml/badge.svg)](https://github.com/SchmiedmayerLab/grove-ts/actions/workflows/build-and-test.yml)
[![Deployment](https://github.com/SchmiedmayerLab/grove-ts/actions/workflows/deployment.yml/badge.svg)](https://github.com/SchmiedmayerLab/grove-ts/actions/workflows/deployment.yml)
[![CodeQL](https://github.com/SchmiedmayerLab/grove-ts/actions/workflows/codeql.yml/badge.svg)](https://github.com/SchmiedmayerLab/grove-ts/actions/workflows/codeql.yml)
[![Codecov](https://codecov.io/gh/SchmiedmayerLab/grove-ts/branch/main/graph/badge.svg)](https://codecov.io/gh/SchmiedmayerLab/grove-ts)
[![REUSE status](https://api.reuse.software/badge/github.com/SchmiedmayerLab/grove-ts)](https://api.reuse.software/info/github.com/SchmiedmayerLab/grove-ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/SchmiedmayerLab/grove-ts/blob/main/LICENSE.md)
[![Release](https://img.shields.io/github/v/release/SchmiedmayerLab/grove-ts?display_name=tag&include_prereleases&sort=semver)](https://github.com/SchmiedmayerLab/grove-ts/releases)

Grove gives TypeScript teams a dependable foundation for building web and cloud applications.
It packages recurring engineering decisions—from code quality rules to interface and data integrations—so projects can start consistently, stay type-safe, and focus on their own functionality.

## See Grove in Action

<a href="https://schmiedmayerlab.github.io/grove-ts/storybook/?path=/story/examples-grove-showcase--light">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://schmiedmayerlab.github.io/grove-ts/storybook/grove-showcase-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="https://schmiedmayerlab.github.io/grove-ts/storybook/grove-showcase-light.png">
    <img alt="Digital health research interface composed with the Grove design system" src="https://schmiedmayerlab.github.io/grove-ts/storybook/grove-showcase-light.png">
  </picture>
</a>

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
| `npm test`              | Run repository and workspace tests                         |
| `npm run test:coverage` | Run workspace tests with coverage                          |
| `npm run lint:ci`       | Run linting with no warnings allowed                       |
| `npm run analyze`       | Check dead files, dependencies, exports, and import cycles |
| `npm run docs`          | Start the design system documentation locally              |
| `npm run pages:build`   | Assemble the complete GitHub Pages artifact                |
| `npm run validate`      | Run the complete validation suite used before review       |

## Releases

Grove uses fixed, bare semantic versions such as `0.1.0` across all packages; prerelease versions such as `0.2.0-beta.1` use the npm `next` tag.
Publishing a GitHub release runs the validation pipeline, publishes missing versions through npm Trusted Publishing, verifies the registry state, and deploys the documentation and Storybook.

Maintainers can validate release preparation from any branch without publishing or deploying:

```bash
gh workflow run deployment.yml --ref <branch> \
  -f packageVersion=0.2.0 \
  -f dryRun=true
```

Maintainers can create a normal release in the GitHub interface or with:

```bash
gh release create 0.2.0 --target main --title 0.2.0 --generate-notes
```

### Bootstrap a New npm Package

An unpublished package needs one token-based publication before npm Trusted Publishing can be configured.
Create a short-lived granular npm token with read and write access to the `@schmiedmayerlab` scope and **Bypass two-factor authentication** enabled, then temporarily add it as the `NPM_TOKEN` repository secret.
Manually run **Deployment** from `main`.
Use `*` for the repository's first publication or comma-separated package names for selected new workspaces:

```bash
gh workflow run deployment.yml --ref main \
  -f packageVersion=0.1.0 \
  -f bootstrapPackages='*'
```

For example, set `bootstrapPackages` to `@schmiedmayerlab/grove-new-package` when adding a single workspace later.

After the workflow creates the packages, sign in to npm from a trusted workstation and authorize `deployment.yml` as their publisher:

```bash
npm login
npm run configure:trusted-publishing -- --packages '@schmiedmayerlab/grove-new-package'
```

npm requires an interactive maintainer session with two-factor authentication for this operation; it does not accept granular tokens, including bypass-2FA tokens, for changing Trusted Publishers.
Use `--packages '*'` when configuring every public workspace in a new repository.
Delete the token secret after an OIDC publication succeeds.
The workflow verifies and skips versions already present on npm, making recovery from an interrupted release safe.

If packages were published before Trusted Publishing was configured, run the helper from `main` and then rerun the failed release jobs:

```bash
npm login
npm run configure:trusted-publishing
gh run rerun <release-run-id> --failed
```

## Contributing

Contributions to this project are welcome. Please make sure to read the [contribution guidelines](https://github.com/SchmiedmayerLab/.github/blob/main/CONTRIBUTING.md) and the [contributor covenant code of conduct](https://github.com/SchmiedmayerLab/.github/blob/main/CODE_OF_CONDUCT.md) first. You can find a list of contributors in the [CONTRIBUTORS.md](CONTRIBUTORS.md) file.

## License

This project is licensed under the MIT License. See [LICENSE.md](LICENSE.md) for more information.

## Citation

If you use this software, please cite it using the metadata in [CITATION.cff](CITATION.cff), which GitHub surfaces through the [*Cite this repository*](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-citation-files) button.

## Our Research

For more information, visit the [Schmiedmayer Lab GitHub organization](https://github.com/SchmiedmayerLab).

![Schmiedmayer Lab](https://raw.githubusercontent.com/SchmiedmayerLab/.github/main/assets/footer-light.png#gh-light-mode-only)
![Schmiedmayer Lab](https://raw.githubusercontent.com/SchmiedmayerLab/.github/main/assets/footer-dark.png#gh-dark-mode-only)
