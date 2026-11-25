---
sidebar_position: 3
sidebar_label: "DataTable"
---

# DataTable and TanStack Table

`DataTable` is built on [TanStack Table v9](https://tanstack.com/table/latest).
Its props, view props, and helpers use TanStack Table types, so applications that import TanStack Table themselves must use version 9 as well.
TanStack Table v8 types are not compatible with v9 types.

## Defining columns

Every DataTable uses the same feature set, exported as `dataTableFeatures`, with its type `DataTableFeatures`.
TanStack Table v9 types take this feature set as their first generic argument.
`createDataTableColumnHelper` creates a column helper that is already bound to it:

```tsx
import {
  createDataTableColumnHelper,
  DataTable,
  dateColumn,
} from "@schmiedmayerlab/grove-design-system";

interface User {
  name: string;
  age: number;
  createdAt: Date;
}

const columnHelper = createDataTableColumnHelper<User>();

const columns = [
  columnHelper.accessor("name", { header: "Name" }),
  columnHelper.accessor("age", { header: "Age" }),
  columnHelper.accessor("createdAt", { header: "Created", cell: dateColumn }),
];

export const UsersTable = ({ users }: { users: User[] }) => (
  <DataTable columns={columns} data={users} entityName="users" />
);
```

`createDataTableColumnHelper<User>()` is equivalent to `createColumnHelper<DataTableFeatures, User>()` from `@tanstack/react-table`.
Columns of different value types can be mixed in one array.
Wrap them with `columnHelper.columns([...])` when the array is used outside of `DataTable` and its value types should stay inferred.
Also wrap exported column arrays in packages that emit declarations, otherwise TypeScript reports that their inferred type cannot be named.
Rows must be objects or arrays, as required by the v9 `RowData` type.

## Features

`dataTableFeatures` registers every stock TanStack Table feature,
so all table, row, column, and cell APIs of v8 stay available in columns and custom views.
It also registers the client-side filtering, sorting, and pagination row models,
the built-in filter and sort functions of v8 under their v8 names, and the `fuzzy` filter used for global search.

Pass custom filter and sort functions to column definitions directly, like `filterFn: startsWith`.
To replace a row model or a registered function for one table, spread `dataTableFeatures` and pass the result as `features`:

```tsx
import { dataTableFeatures } from "@schmiedmayerlab/grove-design-system";
import { tableFeatures } from "@tanstack/react-table";

const features = tableFeatures({
  ...dataTableFeatures,
  filterFns: {
    ...dataTableFeatures.filterFns,
    includesString: myIncludesString,
  },
});
```

## State

DataTable keeps its own table state unless a slice is controlled.
To control a slice, pass it in `state` together with its change callback, like `state={{ sorting }}` with `onSortingChange={setSorting}`.
The global search is part of the table state, so it can be controlled with `state.globalFilter` and `onGlobalFilterChange`.
`pageSize` is merged into `initialState.pagination`.

Custom views, headers, and cells receive the v9 table instance.
Read its state with `table.store.state` instead of `table.getState()`.
Call row, column, and cell methods on the object, like `row.getIsSelected()`, instead of destructuring them.

## Row selection

TanStack Table v9 selects a range of rows when a row is toggled with Shift held down.
DataTable keeps the v8 behavior and disables it by default.
Pass `enableRowRangeSelection` to enable range selection.
`table.getIsSomeRowsSelected()` is true when at least one row is selected, also when all rows are selected.
