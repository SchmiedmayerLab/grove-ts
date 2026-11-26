//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import type { Meta, StoryObj } from "@storybook/react";
import { Async } from "./Async";

const meta: Meta<typeof Async> = {
  title: "Components/Async",
  component: Async,
  args: { entityName: "users" },
};

export default meta;

type Story = StoryObj<typeof Async>;

export const Loading: Story = {
  args: { loading: true },
};

export const ErrorState: Story = {
  name: "Error",
  args: { error: true },
};

export const CustomMessage: Story = {
  args: { error: { show: true, children: "Custom error message!" } },
};

export const Empty: Story = {
  args: { empty: { show: true } },
};

/**
 * Compares the default padding with `padding={false}`.
 * The frames only make the padding visible.
 */
export const NoPadding: Story = {
  args: { empty: true },
  render: (args) => (
    <div className="flex gap-6">
      {[true, false].map((padding) => (
        <div key={String(padding)} className="space-y-2">
          <p className="text-muted-foreground text-xs">
            {padding ? "Default padding" : "padding={false}"}
          </p>
          <div className="w-64 rounded-md border">
            <Async {...args} padding={padding} />
          </div>
        </div>
      ))}
    </div>
  ),
};
