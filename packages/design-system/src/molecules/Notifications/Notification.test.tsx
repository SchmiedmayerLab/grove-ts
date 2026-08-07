//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { fireEvent, screen } from "@testing-library/react";
import { vitest } from "vitest";
import { renderWithProviders } from "@/tests/helpers";
import { Notification, NotificationActions } from "./";

describe("Notification", () => {
  it("renders basic notification", () => {
    renderWithProviders(
      <Notification
        title="New message"
        message="You have a new message from Dr. Smith"
        isRead={false}
      />,
    );

    const title = screen.getByText("New message");
    expect(title).toBeInTheDocument();

    const message = screen.getByText("You have a new message from Dr. Smith");
    expect(message).toBeInTheDocument();

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders complex notification with all features", () => {
    renderWithProviders(
      <Notification
        title="Appointment reminder"
        image="https://avatars.githubusercontent.com/u/133281989"
        message="Your appointment with Dr. Smith is tomorrow at 2:00 PM"
        time={new Date("2024-07-15T14:00:00")}
        isRead={false}
      />,
    );

    const title = screen.getByText("Appointment reminder");
    expect(title).toBeInTheDocument();

    const message = screen.getByText(
      "Your appointment with Dr. Smith is tomorrow at 2:00 PM",
    );
    expect(message).toBeInTheDocument();

    const image = screen.getByRole("img");
    expect(image).toBeInTheDocument();

    const time = screen.getByText(/7\/15\/2024/);
    expect(time).toBeInTheDocument();
  });

  it("renders notification with link", () => {
    renderWithProviders(
      <Notification
        title="New message"
        message="You have a new message from Dr. Smith"
        link="/users"
        isRead={false}
      />,
    );

    const link = screen.getByRole("link");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/users");
  });

  it("renders numeric content", () => {
    renderWithProviders(<Notification isRead={false} message={0} />);

    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("renders time and actions independently", () => {
    renderWithProviders(
      <Notification
        actions={<button type="button">Dismiss</button>}
        isRead={false}
        time={new Date("2024-07-15T14:00:00")}
      />,
    );

    expect(screen.getByText(/7\/15\/2024/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });
});

describe("NotificationActions", () => {
  it("stops propagation and prevents default on click", () => {
    const parentClick = vitest.fn();
    const actionsClick = vitest.fn();

    renderWithProviders(
      <div onClick={parentClick} role="presentation">
        <NotificationActions onClick={actionsClick}>
          <button type="button">Delete</button>
        </NotificationActions>
      </div>,
    );

    const actions = screen.getByText("Delete").closest("div:not([role])");
    expect(actions).toBeTruthy();
    fireEvent.click(actions as HTMLElement);

    expect(actionsClick).toHaveBeenCalledTimes(1);
    expect(
      (actionsClick.mock.calls[0]?.[0] as MouseEvent).defaultPrevented,
    ).toBe(true);
    expect(parentClick).not.toHaveBeenCalled();
  });

  it("renders without onClick handler", () => {
    renderWithProviders(
      <NotificationActions>
        <button type="button">Mark as read</button>
      </NotificationActions>,
    );

    const button = screen.getByText("Mark as read");
    const parent = button.closest("div");
    expect(parent).toBeTruthy();
    fireEvent.click(parent as HTMLElement);
    expect(button).toBeInTheDocument();
  });
});
