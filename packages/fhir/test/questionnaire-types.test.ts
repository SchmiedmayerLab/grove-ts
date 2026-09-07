//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  parseSemVer,
  type QuestionnaireResponseAnswerInput,
} from '../src/index.js'

describe('Questionnaire type contract', () => {
  it('requires exactly one answer value at compile time', () => {
    const answer: QuestionnaireResponseAnswerInput = { valueBoolean: true }
    expect(answer.valueBoolean).toBe(true)

    // @ts-expect-error Multiple value[x] members are not a valid answer.
    const invalid: QuestionnaireResponseAnswerInput = {
      valueBoolean: true,
      valueString: 'true',
    }
    expect(invalid).toBeDefined()
  })

  it.each([
    '0.0.0',
    '1.2.3-alpha.1',
    '1.2.3+build.0042',
    '1.2.3-alpha.1+build.0042',
  ])('accepts SemVer %s', (candidate) => {
    expect(parseSemVer(candidate).ok).toBe(true)
  })

  it.each(['1.2', '01.2.3', '1.02.3', '1.2.3-01', '1.2.3+'])(
    'rejects non-SemVer %s',
    (candidate) => {
      expect(parseSemVer(candidate).ok).toBe(false)
    },
  )
})
