//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type Meta } from "@storybook/react";
import { useState } from "react";
import { DatePicker } from "./DatePicker";

const meta: Meta<typeof DatePicker> = {
  title: "Components/DatePicker",
  component: DatePicker,
};

export default meta;

export const Default = () => {
  const [date, setDate] = useState<Date | undefined>(() => new Date());
  return <DatePicker mode="single" selected={date} onSelect={setDate} />;
};
