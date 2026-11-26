//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type RankingInfo, rankItem } from "@tanstack/match-sorter-utils";
import {
  type CellContext,
  type CellData,
  type ColumnDef,
  constructFilterFn,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_arrHas,
  filterFn_arrIncludes,
  filterFn_arrIncludesAll,
  filterFn_arrIncludesSome,
  filterFn_between,
  filterFn_betweenInclusive,
  filterFn_empty,
  filterFn_endsWith,
  filterFn_equals,
  filterFn_equalsString,
  filterFn_equalsStringSensitive,
  filterFn_greaterThan,
  filterFn_greaterThanOrEqualTo,
  filterFn_inDateRange,
  filterFn_inNumberRange,
  filterFn_includesString,
  filterFn_includesStringSensitive,
  filterFn_lessThan,
  filterFn_lessThanOrEqualTo,
  filterFn_notEmpty,
  filterFn_startsWith,
  filterFn_weakEquals,
  metaHelper,
  type RowData,
  sortFn_alphanumeric,
  sortFn_alphanumericCaseSensitive,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  sortFn_textCaseSensitive,
  stockFeatures,
  type TableFeatures,
  type TableOptions,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { useDebouncedCallback } from "use-debounce";
import { ensureString, type PartialSome } from "@/utils/misc";

declare module "@tanstack/table-core" {
  interface ColumnMeta<
    TFeatures extends TableFeatures,
    TData extends RowData,
    TValue extends CellData = CellData,
  > {
    /**
     * Applies custom CSS classes to the cell's `<td>` element.
     * Can be a static string or a function that receives the cell context
     * and returns a class string (or undefined for no classes).
     *
     * @example
     * ```ts
     * // Static
     * meta: { cellClassName: "bg-success/10 text-success" }
     *
     * // Dynamic
     * meta: {
     *   cellClassName: (ctx) => ctx.getValue() > 50
     *     ? "bg-destructive/10 text-destructive"
     *     : undefined,
     * }
     * ```
     */
    cellClassName?:
      | string
      | ((
          context: CellContext<TFeatures, TData, TValue>,
        ) => string | undefined);
  }
}

/**
 * Filter metadata that DataTable's fuzzy filter attaches to every matched row.
 */
export interface DataTableFilterMeta {
  itemRank?: RankingInfo;
}

/**
 * Default fuzzyFilter implementation, used for global text filtering.
 * Ranks values with `@tanstack/match-sorter-utils` and stores the rank as filter meta.
 */
export const fuzzyFilter = constructFilterFn({
  filter: (
    dataValue: unknown,
    filterValue: unknown,
    _row,
    _columnId,
    addMeta,
  ) => {
    const itemRank = rankItem(dataValue, ensureString(filterValue) ?? "");
    addMeta?.({ itemRank });
    return itemRank.passed;
  },
});

/**
 * Features registered for every DataTable.
 *
 * Registers all stock TanStack Table features.
 * Adds client-side filtering, sorting, and pagination row models,
 * every built-in filter and sort function under its TanStack name, and the `fuzzy` filter used for global filtering.
 *
 * Spread it to replace a row model or a registered function, and pass the result as `features`.
 * Pass custom filter and sort functions to column definitions directly, like `filterFn: matchesStatus`.
 *
 * @example
 * ```ts
 * const features = tableFeatures({
 *   ...dataTableFeatures,
 *   filterFns: { ...dataTableFeatures.filterFns, includesString: myIncludesString },
 * })
 * ```
 */
export const dataTableFeatures = tableFeatures({
  ...stockFeatures,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  filterFns: {
    arrHas: filterFn_arrHas,
    arrIncludes: filterFn_arrIncludes,
    arrIncludesAll: filterFn_arrIncludesAll,
    arrIncludesSome: filterFn_arrIncludesSome,
    between: filterFn_between,
    betweenInclusive: filterFn_betweenInclusive,
    empty: filterFn_empty,
    endsWith: filterFn_endsWith,
    equals: filterFn_equals,
    equalsString: filterFn_equalsString,
    equalsStringSensitive: filterFn_equalsStringSensitive,
    greaterThan: filterFn_greaterThan,
    greaterThanOrEqualTo: filterFn_greaterThanOrEqualTo,
    inDateRange: filterFn_inDateRange,
    inNumberRange: filterFn_inNumberRange,
    includesString: filterFn_includesString,
    includesStringSensitive: filterFn_includesStringSensitive,
    lessThan: filterFn_lessThan,
    lessThanOrEqualTo: filterFn_lessThanOrEqualTo,
    notEmpty: filterFn_notEmpty,
    startsWith: filterFn_startsWith,
    weakEquals: filterFn_weakEquals,
    fuzzy: fuzzyFilter,
  },
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    alphanumericCaseSensitive: sortFn_alphanumericCaseSensitive,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
    text: sortFn_text,
    textCaseSensitive: sortFn_textCaseSensitive,
  },
  filterMeta: metaHelper<DataTableFilterMeta>(),
});

/**
 * Feature set of DataTable.
 * Use it as the first generic argument of TanStack Table types, like `ColumnDef<DataTableFeatures, Data>` or `Row<DataTableFeatures, Data>`.
 */
export type DataTableFeatures = typeof dataTableFeatures;

/**
 * Creates a TanStack Table column helper bound to DataTable's features.
 * Equivalent to `createColumnHelper<DataTableFeatures, Data>()` from `@tanstack/react-table`.
 *
 * @example
 * ```ts
 * const columnHelper = createDataTableColumnHelper<User>()
 * const columns = columnHelper.columns([
 *   columnHelper.accessor("name", { header: "Name" }),
 *   columnHelper.accessor("age", { header: "Age" }),
 * ])
 * ```
 */
export const createDataTableColumnHelper = <Data extends RowData>() =>
  createColumnHelper<DataTableFeatures, Data>();

export interface UseDataTableProps<Data extends RowData> extends PartialSome<
  Omit<TableOptions<DataTableFeatures, Data>, "columns">,
  "features"
> {
  /**
   * Column definitions of the table.
   * Columns of different value types can be mixed in one array,
   * like with `columnHelper.columns([...])`.
   */
  // TanStack Table types heterogeneous column arrays with `any` values, see `ColumnHelper.columns`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ReadonlyArray<ColumnDef<DataTableFeatures, Data, any>>;
  /**
   * Defines how many items are displayed per one page.
   *
   * @default 50
   */
  pageSize?: number;
}

/**
 * Composes useTable usage, contains core data table logic.
 */
export const useDataTable = <Data extends RowData>({
  columns,
  data,
  pageSize = 50,
  initialState,
  ...props
}: UseDataTableProps<Data>) => {
  const table = useTable({
    features: dataTableFeatures,
    columns,
    data,
    globalFilterFn: "fuzzy",
    ...props,
    initialState: {
      ...initialState,
      pagination: {
        pageIndex: 0,
        pageSize,
        ...initialState?.pagination,
      },
    },
  });

  const setGlobalFilterDebounced = useDebouncedCallback(
    (value: string) => table.setGlobalFilter(value),
    200,
  );

  const rows = table.getRowModel().rows;

  const isEmpty = !rows.length;

  const emptyProps = {
    show: isEmpty,
    textFilter: ensureString(table.state.globalFilter),
    hasFilters: data.length !== 0 && table.state.columnFilters.length > 0,
  };

  return {
    setGlobalFilterDebounced,
    table,
    rows,
    emptyProps,
    isEmpty,
  };
};
