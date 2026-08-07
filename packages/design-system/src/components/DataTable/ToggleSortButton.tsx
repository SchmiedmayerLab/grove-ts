//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type Header } from "@tanstack/react-table";
import { ArrowDownAZ, ArrowUpZA } from "lucide-react";
import { type ReactNode } from "react";
import { Button } from "../Button";

interface ToggleSortButtonProps<Data> {
  children?: ReactNode;
  header: Header<Data, unknown>;
}

/**
 * Button displayed over sortable column header name.
 * Shows the current sorting direction and allows toggling it.
 */
export const ToggleSortButton = <Data,>({
  children,
  header,
}: ToggleSortButtonProps<Data>) => {
  const isSorted = header.column.getIsSorted();

  const nextSorting = header.column.getNextSortingOrder();
  let sortingAction = "Disable sorting";
  if (nextSorting === "asc") sortingAction = "Sort ascending";
  else if (nextSorting === "desc") sortingAction = "Sort descending";

  const label = [
    sortingAction,
    "by",
    typeof children === "string" ? children : null,
    "column",
  ]
    .filter(Boolean)
    .join(" ");

  let sortingIcon = <span aria-hidden className="size-4" />;
  if (isSorted === "asc") sortingIcon = <ArrowDownAZ className="size-4" />;
  else if (isSorted === "desc") sortingIcon = <ArrowUpZA className="size-4" />;

  return (
    <Button
      data-slot="toggle-sort-button"
      size="sm"
      variant="ghost"
      className="relative -left-2 w-full justify-start! px-2!"
      onClick={header.column.getToggleSortingHandler()}
      aria-label={label}
    >
      {children}
      {sortingIcon}
    </Button>
  );
};
