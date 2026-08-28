//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import type { Issue } from '../core/index.js'

export const issue = (
  code: Issue['code'],
  path: Issue['path'],
  message: string,
): Issue => ({ severity: 'error', code, path, message })

export const warning = (
  code: Issue['code'],
  path: Issue['path'],
  message: string,
): Issue => ({ severity: 'warning', code, path, message })

export const prefixed = (
  entries: readonly Issue[],
  prefix: string,
): readonly Issue[] =>
  entries.map((entry) => ({ ...entry, path: [prefix, ...entry.path] }))
