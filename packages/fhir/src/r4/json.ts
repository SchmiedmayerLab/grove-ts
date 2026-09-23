//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

type JsonPrimitive = boolean | number | string

type Nullish<Value> =
  | (undefined extends Value ? undefined : never)
  | (null extends Value ? null : never)

type FhirJsonProperty<Key extends PropertyKey, Value> =
  [NonNullable<Value>] extends [ReadonlyArray<infer Element>] ?
    | (Key extends `_${string}` ? Array<FhirJson<Element> | null>
      : [Element] extends [JsonPrimitive] ? Array<Element | null>
      : Array<FhirJson<Element>>)
    | Nullish<Value>
  : FhirJson<Value>

type PrimitiveShadowedKey<Value extends object> = {
  [Key in keyof Value]-?: Key extends string ?
    `_${Key}` extends keyof Value ?
      Key
    : never
  : never
}[keyof Value]

type FhirJsonMapped<Value extends object> = {
  [Key in keyof Value]: FhirJsonProperty<Key, Value[Key]>
}

type FhirJsonObject<Value extends object> = Omit<
  FhirJsonMapped<Value>,
  PrimitiveShadowedKey<Value>
> &
  // A required FHIR primitive element can exist through `_field` metadata alone, so the JSON
  // value property is not independently required even when a declaration package models it so.
  Partial<Pick<FhirJsonMapped<Value>, PrimitiveShadowedKey<Value>>>

/**
 * Corrects declaration packages that omit legal null placeholders from repeating FHIR JSON
 * primitive value and `_shadow` arrays, and permits a primitive value to be omitted when its
 * `_shadow` Element carries the element, while preserving every other published property shape.
 */
export type FhirJson<Value> =
  Value extends JsonPrimitive | null | undefined ? Value
  : Value extends object ? FhirJsonObject<Value>
  : Value
