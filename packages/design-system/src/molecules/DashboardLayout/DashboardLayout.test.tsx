//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/tests/helpers";
import { DashboardLayout, MenuItem, PageTitle, UserMenuItem } from ".";

describe("DashboardLayout", () => {
  it("renders functional dashboard", () => {
    const menuLinks = <MenuItem href="/home" label="Home" isActive />;
    renderWithProviders(
      <DashboardLayout
        actions={<button type="button">Sign out</button>}
        aside={menuLinks}
        mobile={menuLinks}
        title={<PageTitle title="Home" />}
      >
        Content
      </DashboardLayout>,
    );

    const dashboardContent = screen.getByText("Content");
    expect(dashboardContent).toBeInTheDocument();

    const homeLink = screen.getByRole("link", { name: "Home" });
    expect(homeLink).toBeInTheDocument();

    const mobileMenu = screen.getByTestId("mobileMenu");
    expect(mobileMenu).not.toBeVisible();

    const menuTriggerButton = screen.getByRole("button", { name: "Open menu" });
    fireEvent.click(menuTriggerButton);

    expect(mobileMenu).toBeVisible();
    // Renders both home links - mobile and desktop
    const homeLinks = screen.getAllByRole("link", { name: "Home" });
    expect(homeLinks).toHaveLength(2);

    const actions = screen.getAllByRole("button", { name: "Sign out" });
    expect(actions).toHaveLength(2);
  });
});

describe("PageTitle", () => {
  it("renders an icon and subtitle without a title", () => {
    renderWithProviders(
      <PageTitle
        icon={<svg data-testid="page-icon" />}
        subTitle="Account settings"
      />,
    );

    expect(screen.getByTestId("page-icon")).toBeInTheDocument();
    expect(screen.getByText("Account settings")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });
});

describe("UserMenuItem", () => {
  it("renders user name and avatar", () => {
    renderWithProviders(<UserMenuItem name="John Doe" img="/avatar.jpg" />);

    const name = screen.getByText("John Doe");
    expect(name).toBeInTheDocument();

    const avatar = screen.getByRole("img");
    expect(avatar).toBeInTheDocument();
  });

  it("renders without image", () => {
    renderWithProviders(<UserMenuItem name="Jane Doe" img={null} />);

    const name = screen.getByText("Jane Doe");
    expect(name).toBeInTheDocument();
  });
});
