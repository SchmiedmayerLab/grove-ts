//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import type { R4ResourceType } from './r4-resource-types.js'
import type {
  AbsoluteUri,
  Canonical,
  FhirId,
  FhirInstant,
  SemVer,
} from '../core/index.js'
import type {
  Attachment,
  Coding,
  Extension,
  Identifier,
  Questionnaire,
  QuestionnaireResponse,
  Quantity,
} from '../r4/index.js'

type ExactlyOne<Values extends object> = {
  readonly [Key in keyof Values]: Readonly<
    { readonly [Selected in Key]-?: Values[Selected] } & Readonly<
      Partial<Record<Exclude<keyof Values, Key>, never>>
    >
  >
}[keyof Values]

type WithBackbone<
  Value extends object,
  Additional extends object = Record<never, never>,
> = Value extends object ? Readonly<BackboneInput & Value & Additional> : never

interface BackboneInput {
  readonly id?: string
  readonly extension?: readonly Extension[]
  readonly modifierExtension?: readonly Extension[]
}

interface AnswerValues {
  readonly valueBoolean: boolean
  readonly valueDecimal: number
  readonly valueInteger: number
  readonly valueDate: string
  readonly valueDateTime: string
  readonly valueTime: string
  readonly valueString: string
  readonly valueUri: string
  readonly valueAttachment: Attachment
  readonly valueCoding: Coding
  readonly valueQuantity: Quantity
}

interface EnableWhenValues {
  readonly answerBoolean: boolean
  readonly answerDecimal: number
  readonly answerInteger: number
  readonly answerDate: string
  readonly answerDateTime: string
  readonly answerTime: string
  readonly answerString: string
  readonly answerCoding: Coding
  readonly answerQuantity: Quantity
}

interface AnswerOptionValues {
  readonly valueInteger: number
  readonly valueDate: string
  readonly valueTime: string
  readonly valueString: string
  readonly valueCoding: Coding
}

export type QuestionnaireAnswerValueInput = ExactlyOne<AnswerValues>

export type QuestionnaireItemType =
  | 'attachment'
  | 'boolean'
  | 'choice'
  | 'date'
  | 'dateTime'
  | 'decimal'
  | 'display'
  | 'group'
  | 'integer'
  | 'open-choice'
  | 'quantity'
  | 'string'
  | 'text'
  | 'time'
  | 'url'

export type QuestionnaireEnableWhenInput = WithBackbone<
  ExactlyOne<EnableWhenValues>,
  {
    readonly question: string
    readonly operator: '!=' | '<' | '<=' | '=' | '>' | '>=' | 'exists'
  }
>

export type QuestionnaireAnswerOptionInput = WithBackbone<
  ExactlyOne<AnswerOptionValues>,
  { readonly initialSelected?: boolean }
>

export type QuestionnaireInitialInput =
  WithBackbone<QuestionnaireAnswerValueInput>

/** Bounded R4 Questionnaire item surface supported by the Grove profile. */
export interface QuestionnaireItemInput extends BackboneInput {
  readonly linkId: string
  readonly definition?: string
  readonly code?: readonly Coding[]
  readonly prefix?: string
  readonly text?: string
  readonly type: QuestionnaireItemType
  readonly enableWhen?: readonly QuestionnaireEnableWhenInput[]
  readonly enableBehavior?: 'all' | 'any'
  readonly required?: boolean
  readonly repeats?: boolean
  readonly readOnly?: boolean
  readonly maxLength?: number
  readonly answerValueSet?: string
  readonly answerOption?: readonly QuestionnaireAnswerOptionInput[]
  readonly initial?: readonly QuestionnaireInitialInput[]
  readonly item?: readonly QuestionnaireItemInput[]
}

export type QuestionnaireResponseAnswerInput = WithBackbone<
  QuestionnaireAnswerValueInput,
  { readonly item?: readonly QuestionnaireResponseItemInput[] }
>

/** Bounded R4 QuestionnaireResponse item surface supported by the Grove profile. */
export interface QuestionnaireResponseItemInput extends BackboneInput {
  readonly linkId: string
  readonly definition?: string
  readonly text?: string
  readonly answer?: readonly QuestionnaireResponseAnswerInput[]
  readonly item?: readonly QuestionnaireResponseItemInput[]
}

export interface QuestionnaireInput {
  readonly id?: FhirId
  readonly url: AbsoluteUri
  readonly version: SemVer
  readonly name?: string
  readonly title?: string
  readonly status: Questionnaire['status']
  readonly subjectTypes?: readonly R4ResourceType[]
  readonly date?: FhirInstant
  readonly description?: string
  readonly purpose?: string
  readonly extensions?: readonly Extension[]
  readonly items: readonly [QuestionnaireItemInput, ...QuestionnaireItemInput[]]
}

export interface QuestionnaireResponseIdentifierInput {
  readonly system: AbsoluteUri
  readonly value: string
}

type TypedQuestionnaireResponseReference<ResourceType extends R4ResourceType> =
  | Readonly<{
      type: ResourceType
      reference: string
      identifier?: never
    }>
  | Readonly<{
      type: ResourceType
      reference?: never
      identifier: QuestionnaireResponseIdentifierInput
    }>

/** Any typed literal or identifier-only logical R4 subject Reference. */
export type QuestionnaireResponseSubjectInput =
  TypedQuestionnaireResponseReference<R4ResourceType>

export type QuestionnaireResponseAuthorInput =
  TypedQuestionnaireResponseReference<
    | 'Device'
    | 'Organization'
    | 'Patient'
    | 'Practitioner'
    | 'PractitionerRole'
    | 'RelatedPerson'
  >

export type QuestionnaireResponseSourceInput =
  TypedQuestionnaireResponseReference<
    'Patient' | 'Practitioner' | 'PractitionerRole' | 'RelatedPerson'
  >

export interface QuestionnaireResponseInput {
  readonly id?: FhirId
  /** Exact `Questionnaire.url|Questionnaire.version` canonical. */
  readonly questionnaire: Canonical
  readonly identifier: QuestionnaireResponseIdentifierInput
  readonly status: QuestionnaireResponse['status']
  readonly subject?: QuestionnaireResponseSubjectInput
  readonly authored: FhirInstant
  readonly author?: QuestionnaireResponseAuthorInput
  readonly source?: QuestionnaireResponseSourceInput
  readonly extensions?: readonly Extension[]
  readonly items?: readonly QuestionnaireResponseItemInput[]
}

export type GroveQuestionnaire = Readonly<
  Omit<Questionnaire, 'item'> & {
    readonly item: NonNullable<Questionnaire['item']>
  }
>

export type GroveQuestionnaireResponse = Readonly<
  Omit<
    QuestionnaireResponse,
    'authored' | 'identifier' | 'item' | 'questionnaire'
  > & {
    readonly identifier: Identifier
    readonly questionnaire: string
    readonly authored: string
    readonly item?: QuestionnaireResponse['item']
  }
>

export interface QuestionnairePair {
  readonly questionnaire: GroveQuestionnaire
  readonly response: GroveQuestionnaireResponse
}

export interface QuestionnaireValueSetConceptInput {
  readonly system: AbsoluteUri
  readonly code: string
  readonly version?: string
}

/** Deterministically expanded terminology supplied by the caller; no network lookup occurs. */
export interface ResolvedQuestionnaireValueSetInput {
  readonly canonical: Canonical
  readonly concepts: readonly QuestionnaireValueSetConceptInput[]
}

export interface QuestionnairePreflightOptions {
  readonly valueSets?: readonly ResolvedQuestionnaireValueSetInput[]
}
