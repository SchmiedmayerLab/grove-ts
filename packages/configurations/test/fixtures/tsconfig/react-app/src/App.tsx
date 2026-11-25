//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { useState } from "react";
import { formatCount } from "./format.ts";

export const App = () => {
  const [count, setCount] = useState(0);
  const params = [...new URLSearchParams("a=1&b=2").keys()];
  return (
    <button
      type="button"
      onClick={() => {
        setCount(count + 1);
      }}
    >
      {formatCount(count)} {params.join(",")}
    </button>
  );
};
