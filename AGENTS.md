<!--

This source file is part of the Grove open-source project

SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)

SPDX-License-Identifier: MIT

-->

# AGENTS Instructions

Guidance for contributors working in this repository.

## Repository Map

| Need                                      | Source                                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Project overview and development commands | [README.md](README.md)                                                                                                          |
| Shared ESLint and Prettier configuration  | [packages/configurations](packages/configurations)                                                                              |
| React component library and Storybook     | [packages/design-system](packages/design-system)                                                                                |
| Firebase Cloud Messaging utilities        | [packages/firebase-cloud-messaging](packages/firebase-cloud-messaging)                                                          |
| FHIR schemas and Firebase helpers         | [packages/firebase-fhir](packages/firebase-fhir)                                                                                |
| Shared Firebase utilities                 | [packages/firebase-utils](packages/firebase-utils)                                                                              |
| Contributor attribution                   | [CONTRIBUTORS.md](CONTRIBUTORS.md)                                                                                              |
| Pull request format                       | [Schmiedmayer Lab pull request template](https://github.com/SchmiedmayerLab/.github/blob/main/.github/pull_request_template.md) |

## Working Rules

- Use Node.js 24 and npm 12.
- Run `npm ci` after changing dependencies and commit the resulting lockfile.
- Run `npm run validate` before requesting review.
- Keep package entry points, published files, engine requirements, repository metadata, and scripts consistent across all publishable workspaces.
- Treat TypeScript errors, lint errors, test failures, coverage regressions, invalid package contents, and production audit findings as blocking.
- Add or update tests for behavior changes and bug fixes.
- Keep public API changes documented in the affected package README.
- Use synthetic data only in source control, tests, examples, and CI.
- Write pull request titles and descriptions as compact, natural project communication using the organization template.
- Never merge a pull request, enable auto-merge, queue a merge, or bypass a required check without explicit approval for that pull request.

## Documentation Rules

- Keep documentation current and standalone; do not use it as a development log.
- Use semantic line breaks for prose: one complete sentence per source line.
- Keep implementation-specific instructions in the closest package README and repository-wide instructions in the root README.
- Attribute Grove only to the Schmiedmayer Lab at Stanford University; preserve historical attribution only where required by `CONTRIBUTORS.md`.
