//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type CellContext, type RowData } from "@tanstack/react-table";
import type { DataTableFeatures } from "./DataTable.utils";
import { formatNilDate, formatNilDateTime } from "../../utils/date";
import { type Nil } from "../../utils/misc";

/**
 * Column cell formatter that formats date to include just the day, month and year.
 * The exact date format is based on locale.
 *
 * @example
 * ```ts
 * // for US - 2/12/2019
 * columnHelper.accessor("updatedAt", {
 *   header: "Date",
 *   cell: dateColumn,
 * })
 * ```
 */
export const dateColumn = <T extends RowData>(
  props: CellContext<DataTableFeatures, T, Nil<string | Date>>,
) => formatNilDate(props.getValue()) ?? "";

/**
 * Column cell formatter that formats date to include both day, month, year and time.
 * The exact date format is based on locale.
 *
 * @example
 * ```ts
 * // for US - 2/12/2019 11:31 PM
 * columnHelper.accessor("updatedAt", {
 *   header: "Date Time",
 *   cell: dateTimeColumn,
 * })
 * ```
 */
export const dateTimeColumn = <T extends RowData>(
  props: CellContext<DataTableFeatures, T, Nil<string | Date>>,
) => formatNilDateTime(props.getValue()) ?? "";
