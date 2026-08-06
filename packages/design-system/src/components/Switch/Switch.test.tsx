//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { fireEvent, render, screen } from "@testing-library/react";
import { vitest } from "vitest";
import { Switch } from ".";

describe("Switch", () => {
  it("renders functional switch element", () => {
    const onCheckedChange = vitest.fn();

    render(
      <Switch
        checked={true}
        onCheckedChange={onCheckedChange}
        aria-label="Toggle"
      />,
    );

    const element = screen.getByLabelText("Toggle");
    fireEvent.click(element);

    const newCheckedValue = false;
    expect(onCheckedChange).toHaveBeenCalledWith(newCheckedValue);
  });
});
