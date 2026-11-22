//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { useEffect, useState } from 'react'

export const Counter = ({ count }: { count: number }) => {
  const [value, setValue] = useState(0)
  useEffect(() => {
    setInterval(() => {
      setValue((current) => current + 1)
    }, 1000)
  }, [])
  return <div>{count && <span>{value}</span>}</div>
}
