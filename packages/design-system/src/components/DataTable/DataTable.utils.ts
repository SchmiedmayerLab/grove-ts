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
  type RowData,
  type TableFeatures,
  type TableOptions,
  constructFilterFn,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  filterFn_includesStringSensitive,
  filterFn_equalsString,
  filterFn_arrIncludes,
  filterFn_arrIncludesAll,
  filterFn_arrIncludesSome,
  filterFn_equals,
  filterFn_weakEquals,
  filterFn_inNumberRange,
  metaHelper,
  sortFn_alphanumeric,
  sortFn_alphanumericCaseSensitive,
  sortFn_text,
  sortFn_textCaseSensitive,
  sortFn_datetime,
  sortFn_basic,
  stockFeatures,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { useDebouncedCallback } from "use-debounce";
import { ensureString, type PartialSome } from "@/utils/misc";

declare module "@tanstack/react-table" {
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
 * Default fuzzyFilter implementation, used for global text filtering.
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
 * Shared feature contract for DataTable and consumer column definitions.
 * Keep the stock features and function registries available to existing callers.
 */
export const dataTableFeatures = tableFeatures({
  ...stockFeatures,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  filterFns: {
    includesString: filterFn_includesString,
    includesStringSensitive: filterFn_includesStringSensitive,
    equalsString: filterFn_equalsString,
    arrIncludes: filterFn_arrIncludes,
    arrIncludesAll: filterFn_arrIncludesAll,
    arrIncludesSome: filterFn_arrIncludesSome,
    equals: filterFn_equals,
    weakEquals: filterFn_weakEquals,
    inNumberRange: filterFn_inNumberRange,
    fuzzy: fuzzyFilter,
  },
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    alphanumericCaseSensitive: sortFn_alphanumericCaseSensitive,
    text: sortFn_text,
    textCaseSensitive: sortFn_textCaseSensitive,
    datetime: sortFn_datetime,
    basic: sortFn_basic,
  },
  filterMeta: metaHelper<{ itemRank?: RankingInfo }>(),
});

export type DataTableFeatures = typeof dataTableFeatures;

export interface UseDataTableProps<Data extends RowData> extends PartialSome<
  TableOptions<DataTableFeatures, Data>,
  "features"
> {
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
    enableRowRangeSelection: false,
    initialState: {
      ...initialState,
      pagination: {
        pageIndex: 0,
        pageSize,
        ...initialState?.pagination,
      },
    },
    ...props,
  });
  const globalFilter = ensureString(table.state.globalFilter) ?? "";
  const setGlobalFilter = table.setGlobalFilter;
  const setGlobalFilterDebounced = useDebouncedCallback(setGlobalFilter, 200);

  const rows = table.getRowModel().rows;

  const isEmpty = !rows.length;

  const emptyProps = {
    show: isEmpty,
    textFilter: globalFilter,
    hasFilters: data.length !== 0 && table.state.columnFilters.length > 0,
  };

  return {
    globalFilter,
    setGlobalFilter,
    setGlobalFilterDebounced,
    table,
    rows,
    emptyProps,
    isEmpty,
  };
};
