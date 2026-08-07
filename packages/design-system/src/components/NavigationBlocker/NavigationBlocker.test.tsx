//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { fireEvent, render, screen } from "@testing-library/react";
import { vitest } from "vitest";
import { NavigationBlocker } from ".";

describe("NavigationBlocker", () => {
  it("shows dialog when status is blocked and triggers callbacks", () => {
    const proceed = vitest.fn();
    const reset = vitest.fn();

    render(
      <NavigationBlocker
        status="blocked"
        shouldBlock={true}
        proceed={proceed}
        reset={reset}
      />,
    );

    expect(screen.getByText("Leave this page?")).toBeInTheDocument();

    const stay = screen.getByRole("button", { name: /stay/i });
    fireEvent.click(stay);
    expect(reset).toHaveBeenCalled();

    render(
      <NavigationBlocker
        status="blocked"
        shouldBlock={true}
        proceed={proceed}
        reset={reset}
      />,
    );

    const leave = screen.getByRole("button", { name: /leave anyway/i });
    fireEvent.click(leave);
    expect(proceed).toHaveBeenCalled();
  });

  it("attaches a beforeunload handler when enabled and shouldBlock is true", () => {
    const proceed = vitest.fn();
    const reset = vitest.fn();

    const addSpy = vitest.spyOn(window, "addEventListener");

    render(
      <NavigationBlocker
        status="idle"
        shouldBlock={true}
        enableBeforeUnload={true}
        proceed={proceed}
        reset={reset}
      />,
    );

    expect(addSpy).toHaveBeenCalled();
    const call = addSpy.mock.calls.find(
      ([callType]) => callType === "beforeunload",
    );
    expect(call).toBeTruthy();
    const handler = call?.[1] as (evt: BeforeUnloadEvent) => void;
    expect(typeof handler).toBe("function");

    // Invoke the captured handler and assert default-prevented
    const preventDefault = vitest.fn();
    const event = { preventDefault } as unknown as BeforeUnloadEvent;
    handler(event);
    expect(preventDefault).toHaveBeenCalled();

    addSpy.mockRestore();
  });

  it("supports a dialog without a description", () => {
    render(
      <NavigationBlocker
        status="blocked"
        shouldBlock={true}
        description={null}
        proceed={() => undefined}
        reset={() => undefined}
      />,
    );

    expect(
      screen.queryByText("You have unsaved changes that will be lost."),
    ).not.toBeInTheDocument();
  });
});
