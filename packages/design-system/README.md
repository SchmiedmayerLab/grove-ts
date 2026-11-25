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

- 🚀 **[Getting Started](https://schmiedmayerlab.github.io/grove-ts/docs/docs/getting-started)** - Installation, setup, and usage guide
- 📚 **[Interactive Storybook](https://schmiedmayerlab.github.io/grove-ts/storybook/)** - Browse components, view live examples, and experiment with props
- 📖 **[API Reference](https://schmiedmayerlab.github.io/grove-ts/docs/api/GroveProvider)** - Detailed technical documentation and API reference
- 🏗️ **[Repository](https://github.com/SchmiedmayerLab/grove-ts)** - Browse every Grove TypeScript package

The package also publishes its TypeScript sources with declaration maps, so editors and coding agents can go from a type to its implementation in `node_modules`.

## Grove Ecosystem

Grove Design System is part of a larger ecosystem of tools and packages:

### Related Packages

- **[`@schmiedmayerlab/grove-configurations`](../configurations)** - Shared oxlint, oxfmt, ESLint and Prettier configurations
- **[Grove Firebase packages](../firebase-utils)** - Firebase, messaging, and FHIR utilities

## Getting Started

For detailed setup instructions, configuration, and usage examples, see the **[Getting Started guide](https://schmiedmayerlab.github.io/grove-ts/docs/docs/getting-started)**.

## Firebase

The `modules/auth` components and hooks use the Firebase JavaScript SDK, which is a peer dependency in version `^12.10.0 || ^13.0.0`.
An application that already uses Firebase shares its own copy with the design system, so `FirebaseError` checks and auth state see the same SDK.
npm and pnpm install the peer automatically when the application has no `firebase` of its own, because the root entry point imports `modules/auth`.

## DataTable and TanStack Table v9

`DataTable` is built on TanStack Table v9.
Applications that import `@tanstack/react-table` or `@tanstack/table-core` themselves must use version 9, because v8 types are not compatible with DataTable's props.
Define columns with `createDataTableColumnHelper`, which binds TanStack's column helper to DataTable's feature set:

```tsx
import {
  createDataTableColumnHelper,
  DataTable,
} from "@schmiedmayerlab/grove-design-system";

interface Person {
  name: string;
  age: number;
}

const columnHelper = createDataTableColumnHelper<Person>();
const columns = [
  columnHelper.accessor("name", { header: "Name" }),
  columnHelper.accessor("age", { header: "Age" }),
];

export const People = ({ people }: { people: Person[] }) => (
  <DataTable columns={columns} data={people} pageSize={20} />
);
```

Public API changes compared to the v8-based releases:

- New exports: `dataTableFeatures`, `DataTableFeatures`, `DataTableFilterMeta`, and `createDataTableColumnHelper`.
- `DataTableProps`, `UseDataTableProps`, `DataTableViewProps`, `DataTableTableViewSpecificProps`, `useDataTable`, `DataTablePagination`, `ToggleSortButton`, `dateColumn`, and `dateTimeColumn` use v9 types with `DataTableFeatures` as the feature set, and their `Data` type must be an object or an array.
- `UseDataTableProps` accepts an optional `features` option and no longer accepts the removed v8 options `getCoreRowModel`, `get*RowModel`, and `filterFns`.
- `fuzzyFilter` is a v9 filter function created with `constructFilterFn`, and the global `FilterFns` and `FilterMeta` augmentations are replaced by `dataTableFeatures`.
- The `ColumnMeta` augmentation with `cellClassName` takes `TFeatures` as its first type parameter.
- Shift range selection of TanStack Table v9 is disabled by default and can be enabled with `enableRowRangeSelection`.
- The global search can be controlled with `state.globalFilter` and `onGlobalFilterChange`, and `pageSize` is merged into `initialState.pagination`.
- Sort buttons are shown for sortable columns instead of filterable columns.

See [DataTable and TanStack Table](https://schmiedmayerlab.github.io/grove-ts/docs/docs/data-table) for the feature set and state handling.

## Why Grove?

Grove Design System strikes a balance between highly opinionated frameworks and copy-paste patterns. It provides package-based distribution for automatic updates, strong defaults for faster development, and escape hatches for deep customization.

**[Read more about our rationale, comparisons with alternatives, and detailed trade-offs →](https://schmiedmayerlab.github.io/grove-ts/docs/docs/why-grove)**

## Technology Stack

Built on modern standards: TypeScript, React 19, Tailwind CSS v4, and Radix UI. Includes integrations with React Hook Form, Zod, TanStack Table, and more.

**[View complete technology stack and rationale →](https://schmiedmayerlab.github.io/grove-ts/docs/docs/technology-stack)**

## License

This project is licensed under the MIT License. See [Licenses](https://github.com/SchmiedmayerLab/grove-ts/tree/main/LICENSES) for more information.

## Contributors

This project is developed as part of the Schmiedmayer Lab at Stanford University.
See the repository's [CONTRIBUTORS.md](../../CONTRIBUTORS.md).
