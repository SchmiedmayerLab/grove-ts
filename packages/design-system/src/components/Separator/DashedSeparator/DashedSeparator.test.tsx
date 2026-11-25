//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { render, screen } from "@testing-library/react";
import { DashedSeparator } from ".";
import { SeparatorText } from "../SeparatorText";

describe("DashedSeparator", () => {
  it("renders separator element if no children provided", () => {
    render(<DashedSeparator />);

    screen.getByRole("separator");
  });

  it("renders regular element if children provided", () => {
    render(<DashedSeparator>lorem</DashedSeparator>);

    const element = screen.queryByRole("separator");
    expect(element).not.toBeInTheDocument();
  });

  it("renders children", () => {
    render(
      <DashedSeparator>
        <SeparatorText>Lorem</SeparatorText>
      </DashedSeparator>,
    );

    const element = screen.getByText("Lorem");
    expect(element).toBeInTheDocument();
  });

  it("renders separator with custom style props", () => {
    render(
      <DashedSeparator
        dashColor="var(--color-primary)"
        dashSize="8px"
        dashGap="10%"
      />,
    );

    const element = screen.getByRole("separator");
    expect(element).toBeInTheDocument();
    // The computed value of a custom property substitutes var() references, so check the inline style.
    expect(element.style.getPropertyValue("--dash-color")).toBe(
      "var(--color-primary)",
    );
    expect(element.style.getPropertyValue("--dash-size")).toBe("8px");
    expect(element.style.getPropertyValue("--dash-gap")).toBe("10%");
  });

  it("renders separator with custom style classes", () => {
    render(
      <DashedSeparator className="[--dash-color:theme(colors.red.500)] [--dash-gap:theme(spacing.3)] [--dash-size:theme(spacing.4)]" />,
    );

    const element = screen.getByRole("separator");
    expect(element).toBeInTheDocument();
    expect(element).toHaveClass(
      "[--dash-color:theme(colors.red.500)]",
      "[--dash-size:theme(spacing.4)]",
      "[--dash-gap:theme(spacing.3)]",
    );
  });
});
