//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type Meta, type StoryObj } from "@storybook/react";
import { action } from "storybook/actions";
import { ButtonPagination } from "./ButtonPagination";

const meta: Meta<typeof ButtonPagination> = {
  title: "Components/Pagination/ButtonPagination",
  component: ButtonPagination,
};

export default meta;

type Story = StoryObj<typeof ButtonPagination>;

export const Default: Story = {
  args: {
    total: 10,
    page: 3,
    onPageChange: action("onPageChange"),
  },
};
