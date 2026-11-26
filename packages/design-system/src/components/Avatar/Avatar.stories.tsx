//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import type { Meta, StoryObj } from "@storybook/react";
import logo from "@/tests/assets/logo.svg";
import portrait from "@/tests/assets/portrait.svg";
import { Avatar, avatarVariants } from "./Avatar";

const meta: Meta<typeof Avatar> = {
  title: "Components/Avatar",
  component: Avatar,
  argTypes: {
    size: {
      options: Object.keys(avatarVariants.size),
      control: { type: "select" },
    },
  },
  args: { name: "John Doe" },
};

export default meta;

type Story = StoryObj<typeof Avatar>;

export const Default: Story = {
  args: {
    src: portrait,
  },
};

export const UserInitials: Story = {};

/**
 * Falls back to the initials when the image fails to load.
 */
export const BrokenImage: Story = {
  args: {
    src: "https://example.invalid/avatar.png",
  },
};

export const CustomFallback: Story = {
  args: {
    fallback: <span>🎉</span>,
    name: undefined,
  },
};

export const SM: Story = { args: { size: "sm" } };
export const LG: Story = { args: { size: "lg" } };

export const Contain: Story = {
  args: {
    src: logo,
    objectFit: "contain",
  },
};

export const WithOverlay: Story = {
  args: {
    overlay: (
      <div className="absolute right-0 bottom-0 size-4 rounded-full border-2 border-white bg-green-500" />
    ),
  },
};
