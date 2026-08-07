//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { fireEvent, render, screen } from "@testing-library/react";
import { InputOTP, InputOTPRoot, InputOTPSlot } from ".";

describe("InputOTP", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("renders otp input", () => {
    render(<InputOTP maxLength={6} />);

    const textBox = screen.getByRole("textbox", { hidden: true });
    expect(textBox).toBeInTheDocument();

    const value = "123";

    fireEvent.change(textBox, { target: { value } });

    value.split("").forEach((number) => {
      expect(screen.getByText(number)).toBeInTheDocument();
    });
  });

  it.each([-1, 1])("rejects an invalid slot index of %i", (index) => {
    expect(() =>
      render(
        <InputOTPRoot maxLength={1}>
          <InputOTPSlot index={index} />
        </InputOTPRoot>,
      ),
    ).toThrow(new RangeError(`No OTP slot exists at index ${index}.`));
  });
});
