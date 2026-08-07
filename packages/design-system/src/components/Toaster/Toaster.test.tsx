//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { fireEvent, render, screen } from "@testing-library/react";
import * as sonner from "sonner";
import { Toaster, toast } from "./Toaster";

describe("Toaster", () => {
  it("shows toast when triggered", async () => {
    render(
      <>
        <Toaster />
        <button type="button" onClick={() => toast("Lorem")} />
      </>,
    );

    const toastHidden = screen.queryByText("Lorem");
    expect(toastHidden).not.toBeInTheDocument();

    const button = screen.getByRole("button");
    fireEvent.click(button);

    const toastVisible = await screen.findByText("Lorem");
    expect(toastVisible).toBeInTheDocument();
  });

  it("calls toast error with default duration 5000ms", () => {
    const spy = vi.spyOn(sonner.toast, "error");

    // When no duration provided, default to 5000
    toast.error("Lorem");
    expect(spy).toHaveBeenNthCalledWith(
      1,
      "Lorem",
      expect.objectContaining({ duration: 5000 }),
    );

    // When duration provided, it should override the default
    toast.error("Lorem", { duration: 3000 });
    expect(spy).toHaveBeenNthCalledWith(
      2,
      "Lorem",
      expect.objectContaining({ duration: 3000 }),
    );

    spy.mockRestore();
  });
});
