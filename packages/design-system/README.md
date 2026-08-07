<!--

This source file is part of the Grove open-source project

SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)

SPDX-License-Identifier: MIT

-->

# Grove Design System

[![Build and Test](https://github.com/SchmiedmayerLab/grove-ts/actions/workflows/build-and-test.yml/badge.svg)](https://github.com/SchmiedmayerLab/grove-ts/actions/workflows/build-and-test.yml)
[![Deployment](https://github.com/SchmiedmayerLab/grove-ts/actions/workflows/deployment.yml/badge.svg)](https://github.com/SchmiedmayerLab/grove-ts/actions/workflows/deployment.yml)
[![codecov](https://codecov.io/gh/SchmiedmayerLab/grove-ts/graph/badge.svg?token=dfQW5eZ2up)](https://codecov.io/gh/SchmiedmayerLab/grove-ts)

An opinionated, feature-rich kit for rapid application development. Built on modern standards (Radix UI, Tailwind CSS) with sensible defaults, yet with flexible escape hatches to customize deeply when needed.

## Overview

Grove Design System is a general-purpose component and utilities library designed to accelerate web application development by providing well-tested, comprehensive, accessible, and type-safe components out of the box. It strikes a balance between opinionated defaults and customization flexibility—enabling developers to focus on features while retaining escape hatches for customization.

The library enforces a consistent design language, includes robust state management patterns, and provides a comprehensive set of utilities - handling UI complexity behind the scenes.

As part of the broader Grove ecosystem, this library provides a foundation for building React applications alongside the shared configuration and Firebase packages in this repository.

## Key Features

- **40+ Production-Ready Components** - Comprehensive library including atoms (Button, Input, Select), molecules (DashboardLayout, ConsentDialog, NotFound, Notifications), and utilities
- **Modern Tech Stack** - Built on Radix UI, Tailwind CSS, TypeScript, and React 19
- **Adaptive Theming** - Built-in light and dark themes, automatic system preference support, and customizable design tokens
- **Well-Tested** - High test coverage with Vitest and Testing Library
- **Feature-Rich** - Integrated form with validation, data fetching patterns, authentication, application shell, error handling, and more
- **Comprehensive Documentation** - Interactive Storybook with live examples
- **Type-Safe** - Full TypeScript coverage with strict typing for enhanced developer experience
- **Accessibility First** - WCAG-compliant components with built-in keyboard navigation and screen reader support
- **Battle-Tested** - Used in production by multiple Stanford projects

## Documentation

- 🚀 **[Getting Started](https://schmiedmayerlab.github.io/grove-ts/docs/getting-started)** - Installation, setup, and usage guide
- 📚 **[Interactive Storybook](https://schmiedmayerlab.github.io/grove-ts/storybook/)** - Browse components, view live examples, and experiment with props
- 📖 **[API Reference](https://schmiedmayerlab.github.io/grove-ts/docs/api/GroveProvider)** - Detailed technical documentation and API reference
- 🏗️ **[Repository](https://github.com/SchmiedmayerLab/grove-ts)** - Browse every Grove TypeScript package

## Grove Ecosystem

Grove Design System is part of a larger ecosystem of tools and packages:

### Related Packages

- **[`@schmiedmayerlab/grove-configurations`](../configurations)** - Shared ESLint and Prettier configurations
- **[Grove Firebase packages](../firebase-utils)** - Firebase, messaging, and FHIR utilities

## Getting Started

For detailed setup instructions, configuration, and usage examples, see the **[Getting Started guide](https://schmiedmayerlab.github.io/grove-ts/docs/getting-started)**.

## Why Grove?

Grove Design System strikes a balance between highly opinionated frameworks and copy-paste patterns. It provides package-based distribution for automatic updates, strong defaults for faster development, and escape hatches for deep customization.

**[Read more about our rationale, comparisons with alternatives, and detailed trade-offs →](https://schmiedmayerlab.github.io/grove-ts/docs/why-grove)**

## Technology Stack

Built on modern standards: TypeScript, React 19, Tailwind CSS v4, and Radix UI. Includes integrations with React Hook Form, Zod, TanStack Table, and more.

**[View complete technology stack and rationale →](https://schmiedmayerlab.github.io/grove-ts/docs/technology-stack)**

## License

This project is licensed under the MIT License. See [Licenses](https://github.com/SchmiedmayerLab/grove-ts/tree/main/LICENSES) for more information.

## Contributors

This project is developed as part of the Schmiedmayer Lab at Stanford University.
See the repository's [CONTRIBUTORS.md](../../CONTRIBUTORS.md).
