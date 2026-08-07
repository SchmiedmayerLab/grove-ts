//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { expectTypeOf } from 'expect-type'
import {
  type CodeSearchSupport,
  codeSearchSupportSchema,
} from '../../src/index.js'

describe('Value set exports', () => {
  it('exports terminology capability search support from the public entry point', () => {
    expect(codeSearchSupportSchema.options).toEqual(['explicit', 'all'])
    expectTypeOf<CodeSearchSupport>().toEqualTypeOf<'explicit' | 'all'>()
  })
})
