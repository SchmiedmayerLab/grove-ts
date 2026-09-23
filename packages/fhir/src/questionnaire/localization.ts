//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import {
  QUESTIONNAIRE_EXTENSIONS,
  extensionValue,
  extensionsFor,
  issue,
  type ExtensionElement,
} from './questionnaire-extensions.js'
import type { Issue } from '../core/index.js'

type ExtensionCandidate = ExtensionElement & { readonly url?: unknown }

// The well-formed BCP 47 shape: a primary language subtag, then hyphenated subtags.
const languageTagPattern = /^[A-Za-z]{2,8}(?:-[A-Za-z\d]{1,8})*$/u

export const isLanguageTag = (value: unknown): value is string =>
  typeof value === 'string' && languageTagPattern.test(value)

const singleValue = (translation: ExtensionElement, url: string) => {
  const parts = extensionsFor(translation, url)
  return parts.length === 1 ? extensionValue(parts[0]) : undefined
}

const translationLanguage = (
  translation: ExtensionElement,
): string | undefined => {
  const language = singleValue(translation, 'lang')
  const content = singleValue(translation, 'content')
  return (
      language?.key === 'valueCode' &&
        isLanguageTag(language.value) &&
        (content?.key === 'valueString' || content?.key === 'valueMarkdown') &&
        typeof content.value === 'string' &&
        content.value !== ''
    ) ?
      language.value
    : undefined
}

interface QuestionnaireTranslations {
  /** Every language a well-formed `translation` extension offers. */
  readonly languages: ReadonlySet<string>
  readonly failures: readonly Issue[]
}

/** Collects and checks the `translation` extensions on every element of a resource. */
export const questionnaireTranslations = (
  resource: unknown,
): QuestionnaireTranslations => {
  const languages = new Set<string>()
  const failures: Issue[] = []
  const visit = (value: unknown, path: ReadonlyArray<number | string>) => {
    if (typeof value !== 'object' || value === null) return
    if (Array.isArray(value)) {
      for (const [index, entry] of value.entries()) {
        visit(entry, [...path, index])
      }
      return
    }
    const candidates: unknown = Reflect.get(value, 'extension')
    const extensions =
      Array.isArray(candidates) ? (candidates as ExtensionCandidate[]) : []
    const elementLanguages = new Set<string>()
    for (const [index, extension] of extensions.entries()) {
      if (extension.url !== QUESTIONNAIRE_EXTENSIONS.translation) continue
      const translationPath = [...path, 'extension', index]
      const language = translationLanguage(extension)
      if (language === undefined) {
        failures.push(
          issue(
            'invalid-type',
            translationPath,
            'A translation requires one BCP 47 lang valueCode and one non-empty content valueString or valueMarkdown.',
          ),
        )
      } else if (elementLanguages.has(language)) {
        failures.push(
          issue(
            'duplicate-identifier',
            translationPath,
            `Translation ${language} occurs more than once on one element.`,
          ),
        )
      } else {
        elementLanguages.add(language)
        languages.add(language)
      }
    }
    for (const [key, child] of Object.entries(value)) {
      visit(child, [...path, key])
    }
  }
  visit(resource, [])
  return { languages, failures }
}

/** The base language and every translation language a Questionnaire offers. */
export const offeredLanguages = (questionnaire: {
  readonly language: string
}): ReadonlySet<string> =>
  new Set([
    questionnaire.language,
    ...questionnaireTranslations(questionnaire).languages,
  ])
