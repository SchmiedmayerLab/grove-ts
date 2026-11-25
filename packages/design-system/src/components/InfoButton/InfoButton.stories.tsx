//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import type { Meta, StoryObj } from "@storybook/react";
import { Tooltip } from "../Tooltip/Tooltip";
import { InfoButton } from "./InfoButton";

const meta: Meta<typeof InfoButton> = {
  title: "Components/InfoButton",
  component: InfoButton,
};

export default meta;

type Story = StoryObj<typeof InfoButton>;

export const Default: Story = {};

export const WithTooltip: Story = {
  render: () => (
    <Tooltip tooltip="Additional information about this field">
      <InfoButton />
    </Tooltip>
  ),
};
