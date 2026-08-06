//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { render, screen } from "@testing-library/react";
import { Badge } from ".";

describe("Badge", () => {
  it("renders badge element", () => {
    render(<Badge>Lorem</Badge>);

    const element = screen.getByText("Lorem");

    expect(element).toBeInTheDocument();
  });
});
