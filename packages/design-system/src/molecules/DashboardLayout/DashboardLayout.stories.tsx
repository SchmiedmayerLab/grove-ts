//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import type { Meta } from "@storybook/react";
import { Home, User } from "lucide-react";
import type { ComponentProps } from "react";
import portrait from "@/tests/assets/portrait.svg";
import { cn } from "@/utils/className";
import { DashboardLayout, MenuItem, PageTitle, UserMenuItem } from ".";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/DropdownMenu";

const meta: Meta<typeof DashboardLayout> = {
  title: "Molecules/DashboardLayout",
  component: DashboardLayout,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

const BaseComponent = ({
  shrinkable = true,
  ...props
}: Partial<ComponentProps<typeof DashboardLayout>>) => {
  const user = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <UserMenuItem name="John Doe" img={portrait} />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Sign Out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const menuLinks = (
    <>
      <MenuItem href="/" label="Home" icon={<Home />} isActive />
      <MenuItem href="/" label="Highlighted" icon={<Home />} isHighlighted />
      <MenuItem href="/" label="Another" icon={<User />} />
    </>
  );

  return (
    <DashboardLayout
      aside={
        <>
          <span className="interactive-opacity w-full px-2 pt-4 text-center">
            Logo
          </span>
          <nav
            className={cn(
              "mt-24 flex flex-col gap-1",
              shrinkable ? "xl:w-full" : "lg:w-full",
            )}
          >
            {menuLinks}
          </nav>
          {user}
        </>
      }
      mobile={
        <>
          <nav className="mt-10 flex flex-col gap-1 px-4">{menuLinks}</nav>
          {user}
        </>
      }
      title={<PageTitle icon={<Home />} title="Home" />}
      shrinkable={shrinkable}
      {...props}
    >
      Content
    </DashboardLayout>
  );
};

export const Default = () => <BaseComponent />;

export const NotShrinkable = () => <BaseComponent shrinkable={false} />;
