//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type Meta, type StoryObj } from "@storybook/react";
import {
  Activity,
  ArrowUpRight,
  Bell,
  CalendarDays,
  ClipboardCheck,
  Database,
  FileText,
  HeartPulse,
  LayoutDashboard,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  Sprout,
  UserPlus,
  Users,
} from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card, CardHeader, CardTitle } from "@/components/Card";
import { Input } from "@/components/Input";
import { Progress } from "@/components/Progress";
import { StatusDot } from "@/components/StatusDot";
import { GroveProvider, type GroveContextRouter } from "@/GroveProvider";
import { darkTheme } from "@/theme/dark";
import { lightTheme } from "@/theme/light";
import { type GroveThemes, type ResolvedColorScheme } from "@/theme/utils";
import { cn } from "@/utils/className";

const stanfordThemes = {
  light: {
    ...lightTheme,
    "color-primary": "rgb(177 4 14)",
    "color-primary-foreground": "rgb(255 255 255)",
    "color-success": "rgb(0 133 102)",
    "color-success-foreground": "rgb(255 255 255)",
    "color-warning": "rgb(254 221 92)",
    "color-warning-dark": "rgb(209 102 15)",
    "color-ring": "rgb(177 4 14)",
  },
  dark: {
    ...darkTheme,
    "color-primary": "rgb(229 8 8)",
    "color-primary-foreground": "rgb(46 45 41)",
    "color-success": "rgb(26 236 186)",
    "color-success-foreground": "rgb(1 66 64)",
    "color-warning": "rgb(254 221 92)",
    "color-warning-dark": "rgb(255 231 129)",
    "color-ring": "rgb(229 8 8)",
  },
} satisfies GroveThemes;

const navigation = [
  { label: "Overview", icon: LayoutDashboard, active: true },
  { label: "Participants", icon: Users, active: false },
  { label: "Data collection", icon: Database, active: false },
  { label: "Study visits", icon: CalendarDays, active: false },
  { label: "Safety", icon: ShieldCheck, active: false },
] as const;

const observations = [
  {
    title: "Heart rate observations",
    detail: "31,842 samples received today",
    status: "Streaming",
    icon: HeartPulse,
  },
  {
    title: "Daily activity summaries",
    detail: "164 wearable summaries available",
    status: "96%",
    icon: Activity,
  },
  {
    title: "Patient-reported outcomes",
    detail: "149 daily surveys received",
    status: "87%",
    icon: FileText,
  },
] as const;

const dataStreams = [
  {
    name: "Wearable sync",
    detail: "164 of 171 active",
    value: 96,
    icon: Smartphone,
  },
  {
    name: "Daily surveys",
    detail: "1,042 of 1,197 expected",
    value: 87,
    icon: FileText,
  },
  {
    name: "Remote measurements",
    detail: "157 of 171 this week",
    value: 92,
    icon: Activity,
  },
] as const;

const router: GroveContextRouter = {
  Link: (props) => <a {...props} />,
};

interface GroveShowcaseProps {
  colorScheme: ResolvedColorScheme;
}

const GroveShowcase = ({ colorScheme }: GroveShowcaseProps) => (
  <GroveProvider
    router={router}
    colorScheme={colorScheme}
    themes={stanfordThemes}
  >
    <div
      className={cn(
        "flex min-h-screen items-center justify-center p-10",
        colorScheme === "dark" ?
          "bg-[radial-gradient(circle_at_top_left,rgb(101_28_50),transparent_35%),radial-gradient(circle_at_bottom_right,rgb(23_94_84),transparent_38%),rgb(46_45_41)]"
        : "bg-[radial-gradient(circle_at_top_left,rgb(248_232_234),transparent_35%),radial-gradient(circle_at_bottom_right,rgb(218_215_203),transparent_38%),rgb(244_244_244)]",
      )}
      data-testid="grove-showcase"
    >
      <div className="bg-surface-primary border-border w-full max-w-7xl overflow-hidden rounded-2xl border shadow-2xl shadow-black/20">
        <div className="border-border bg-muted flex h-11 items-center gap-4 border-b px-4">
          <div className="flex gap-1.5" aria-hidden="true">
            <span className="size-3 rounded-full bg-red-400" />
            <span className="size-3 rounded-full bg-amber-400" />
            <span className="size-3 rounded-full bg-emerald-400" />
          </div>
          <div className="border-border bg-surface-primary text-muted-foreground mx-auto flex h-7 w-full max-w-md items-center justify-center rounded-md border text-xs shadow-xs">
            grovealliance.org
          </div>
          <div className="w-11" aria-hidden="true" />
        </div>

        <div className="bg-surface flex h-[720px]">
          <aside className="border-border bg-surface-primary flex w-64 shrink-0 flex-col border-r p-4">
            <div className="flex items-center gap-3 px-2 py-2">
              <div className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-xl shadow-sm">
                <Sprout className="size-5" aria-hidden="true" />
              </div>
              <div>
                <p className="font-semibold tracking-tight">PulsePath</p>
                <p className="text-muted-foreground text-xs">
                  Digital Health Study
                </p>
              </div>
            </div>

            <nav className="mt-7 space-y-1" aria-label="Primary navigation">
              {navigation.map(({ label, icon: Icon, active }) => (
                <Button
                  key={label}
                  variant="ghost"
                  className={
                    active ?
                      "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary w-full justify-start"
                    : "text-muted-foreground w-full justify-start"
                  }
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </Button>
              ))}
            </nav>

            <div className="mt-auto">
              <Button
                variant="ghost"
                className="text-muted-foreground mb-3 w-full justify-start"
              >
                <Settings className="size-4" aria-hidden="true" />
                Settings
              </Button>
              <div className="bg-muted flex items-center gap-3 rounded-xl p-3">
                <Avatar size="sm" name="Paul Schmiedmayer" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    Paul Schmiedmayer
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    Researcher
                  </p>
                </div>
              </div>
            </div>
          </aside>

          <main className="min-w-0 flex-1 overflow-hidden">
            <header className="border-border bg-surface-primary flex h-16 items-center justify-between border-b px-7">
              <div className="relative w-72">
                <Search
                  className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  aria-label="Search participants"
                  placeholder="Search participants"
                  className="bg-muted h-9 border-transparent pl-9"
                />
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="round"
                  className="size-9"
                  aria-label="Notifications"
                >
                  <Bell className="size-4" aria-hidden="true" />
                </Button>
                <Button size="sm">
                  <UserPlus className="size-4" aria-hidden="true" />
                  Enroll participant
                </Button>
              </div>
            </header>

            <div className="h-[656px] overflow-hidden p-7">
              <div className="flex items-end justify-between">
                <div>
                  <Badge variant="successLight" className="mb-3">
                    <StatusDot status="success" aria-hidden />
                    Recruitment active
                  </Badge>
                  <h1 className="text-foreground text-2xl font-semibold tracking-tight">
                    PulsePath Study
                  </h1>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Remote cardiovascular health study · 12-week observation
                    period
                  </p>
                </div>
                <Button variant="outlineBg" size="sm">
                  Study report
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </Button>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-4">
                <Card className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-muted-foreground text-sm">
                        Participants enrolled
                      </p>
                      <p className="mt-2 text-3xl font-semibold tracking-tight">
                        184
                        <span className="text-muted-foreground ml-1 text-base font-normal">
                          / 240
                        </span>
                      </p>
                    </div>
                    <div className="bg-success/10 text-success rounded-lg p-2">
                      <Users className="size-5" aria-hidden="true" />
                    </div>
                  </div>
                  <Progress value={77} color="primary" className="mt-5" />
                </Card>
                <Card className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-muted-foreground text-sm">
                        Participant retention
                      </p>
                      <p className="mt-2 text-3xl font-semibold tracking-tight">
                        93%
                      </p>
                    </div>
                    <div className="bg-primary/10 text-primary rounded-lg p-2">
                      <HeartPulse className="size-5" aria-hidden="true" />
                    </div>
                  </div>
                  <p className="text-primary mt-4 text-xs">
                    171 participants active
                  </p>
                </Card>
                <Card className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-muted-foreground text-sm">
                        Data completeness
                      </p>
                      <p className="mt-2 text-3xl font-semibold tracking-tight">
                        89%
                      </p>
                    </div>
                    <div className="bg-warning/10 text-warning-dark rounded-lg p-2">
                      <ClipboardCheck className="size-5" aria-hidden="true" />
                    </div>
                  </div>
                  <p className="text-muted-foreground mt-4 text-xs">
                    Wearables, surveys, and visits
                  </p>
                </Card>
              </div>

              <div className="mt-4 grid grid-cols-[1.4fr_1fr] gap-4">
                <Card>
                  <CardHeader className="justify-between">
                    <div>
                      <CardTitle>Recent observations</CardTitle>
                      <p className="text-muted-foreground text-sm">
                        Latest aggregate study data
                      </p>
                    </div>
                    <Button variant="ghostPrimary" size="sm">
                      Explore data
                    </Button>
                  </CardHeader>
                  <div className="divide-border divide-y px-5">
                    {observations.map(
                      ({ title, detail, status, icon: Icon }) => (
                        <div
                          key={title}
                          className="flex items-center gap-3 py-3.5"
                        >
                          <div className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-full">
                            <Icon className="size-4" aria-hidden="true" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {title}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              {detail}
                            </p>
                          </div>
                          <Badge variant="secondary">{status}</Badge>
                        </div>
                      ),
                    )}
                  </div>
                </Card>

                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>Data collection</CardTitle>
                      <p className="text-muted-foreground text-sm">
                        Completion over the last seven days
                      </p>
                    </div>
                  </CardHeader>
                  <div className="space-y-2 px-5 pb-5">
                    {dataStreams.map(({ name, detail, value, icon: Icon }) => (
                      <div
                        key={name}
                        className="border-border rounded-lg border p-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="bg-primary/10 text-primary rounded-lg p-2">
                            <Icon className="size-4" aria-hidden="true" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{name}</p>
                            <p className="text-muted-foreground text-xs">
                              {detail}
                            </p>
                          </div>
                          <span className="text-sm font-semibold">
                            {value}%
                          </span>
                        </div>
                        <Progress
                          value={value}
                          color="primary"
                          className="mt-2"
                        />
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  </GroveProvider>
);

const meta = {
  title: "Examples/Grove Showcase",
  component: GroveShowcase,
  parameters: {
    layout: "fullscreen",
    controls: { disable: true },
  },
  args: {
    colorScheme: "light",
  },
} satisfies Meta<typeof GroveShowcase>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Light: Story = {};

export const Dark: Story = {
  args: {
    colorScheme: "dark",
  },
};
