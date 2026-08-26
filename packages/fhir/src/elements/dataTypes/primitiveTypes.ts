//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

// This file contains the primitive types used in FHIR resources, as defined in https://hl7.org/fhir/R4B/datatypes.html.

// The specification publishes each pattern below as a whole-value constraint, so every one is
// anchored. Without the anchors `regex` matches any substring, which accepts values the
// specification forbids: "2024-01-01T99:99:99Z" and "x2024x" both pass on their leading digits.
//
// The temporal patterns also name what they expect. A rejected date is the most common validation
// failure in practice, and quoting a forty-term regex back at the caller does not help them.

/**
 * Zod schema for FHIR dateTime primitive type.
 */
export const dateTimeSchema = z
  .string()
  .regex(
    /^([0-9]([0-9]([0-9][1-9]|[1-9]0)|[1-9]00)|[1-9]000)(-(0[1-9]|1[0-2])(-(0[1-9]|[1-2][0-9]|3[0-1])(T([01][0-9]|2[0-3]):[0-5][0-9]:([0-5][0-9]|60)(\.[0-9]+)?(Z|(\+|-)((0[0-9]|1[0-3]):[0-5][0-9]|14:00)))?)?)?$/,
    'Expected a FHIR dateTime.',
  )

/**
 * Zod schema for FHIR date primitive type.
 */
export const dateSchema = z
  .string()
  .regex(
    /^([0-9]([0-9]([0-9][1-9]|[1-9]0)|[1-9]00)|[1-9]000)(-(0[1-9]|1[0-2])(-(0[1-9]|[1-2][0-9]|3[0-1]))?)?$/,
    'Expected a FHIR date.',
  )

/**
 * Zod schema for FHIR url primitive type.
 */
export const urlSchema = z.url()

// FHIR permits absolute and relative RFC 3986 references, including URNs.
/**
 * Zod schema for FHIR uri primitive type.
 */
export const uriSchema = z.string().regex(/^\S*$/)

/**
 * Zod schema for FHIR time primitive type.
 */
export const timeSchema = z
  .string()
  .regex(
    /^([01][0-9]|2[0-3]):[0-5][0-9]:([0-5][0-9]|60)(\.[0-9]+)?$/,
    'Expected a FHIR time.',
  )

/**
 * Zod schema for FHIR code primitive type.
 */
export const codeSchema = z.string().regex(/^[^\s]+(\s[^\s]+)*$/)

/**
 * Zod schema for FHIR positiveDecimal primitive type (not in FHIR spec).
 */
export const positiveDecimalSchema = z.number().positive()

/**
 * Zod schema for FHIR decimal primitive type.
 */
export const decimalSchema = z.number()

/**
 * Zod schema for FHIR oid primitive type.
 */
export const oidSchema = z.string().regex(/^urn:oid:[0-2](\.(0|[1-9][0-9]*))+$/)

/**
 * Zod schema for FHIR id primitive type.
 */
export const idSchema = z.string().regex(/^[A-Za-z0-9.-]{1,64}$/)

/**
 * Zod schema for FHIR instant primitive type.
 */
export const instantSchema = z
  .string()
  .regex(
    /^([0-9]([0-9]([0-9][1-9]|[1-9]0)|[1-9]00)|[1-9]000)-(0[1-9]|1[0-2])-(0[1-9]|[1-2][0-9]|3[0-1])T([01][0-9]|2[0-3]):[0-5][0-9]:([0-5][0-9]|60)(\.[0-9]+)?(Z|(\+|-)((0[0-9]|1[0-3]):[0-5][0-9]|14:00))$/,
    'Expected a FHIR instant.',
  )

// The specification publishes `\s*(\S|\s)*` for markdown. Since `\S|\s` covers every character,
// the pattern accepts every string and constrains nothing; anchoring it only adds the backtracking
// that an alternation over a complete character set implies. It is stated as the string constraint
// it actually is, which accepts exactly the same values.
/**
 * Zod schema for FHIR markdown primitive type.
 */
export const markdownSchema = z.string()

/**
 * Zod schema for FHIR integer primitive type.
 */
export const intSchema = z.number().int()

/**
 * Zod schema for FHIR unsignedInt primitive type.
 */
export const unsignedIntSchema = z.number().int().nonnegative()

/**
 * Zod schema for FHIR positiveInt primitive type.
 */
export const positiveIntSchema = z.number().int().positive()

/**
 * Zod schema for FHIR string primitive type.
 */
export const stringSchema = z.string()

/**
 * Zod schema for FHIR boolean primitive type.
 */
export const booleanSchema = z.boolean()

/**
 * Zod schema for FHIR uuid primitive type.
 */
export const uuidSchema = z.uuid()

/**
 * Zod schema for FHIR xhtml primitive type.
 */
export const xhtmlSchema = z.string()

/**
 * Zod schema for FHIR canonical primitive type.
 */
export const canonicalSchema = z.url()

// Two departures from the pattern the specification publishes for base64Binary, which is
// `(\s*([0-9a-zA-Z+=]){4}\s*)+`:
//
// Its alphabet omits "/", which would reject roughly half of all real base64, so RFC 4648's
// alphabet is used. And it permits whitespace on either side of every quad, which leaves a run
// between two quads claimable by either neighbour — the ambiguity that makes it backtrack
// super-linearly. Whitespace is stripped before matching instead, which accepts the same set of
// strings in linear time. Padding position stays unconstrained, exactly as the specification
// leaves it.
const base64QuadsPattern = /^(?:[0-9a-zA-Z+/=]{4})+$/u

/**
 * Zod schema for FHIR base64Binary primitive type.
 */
export const base64BinarySchema = z
  .string()
  .refine(
    (value) => base64QuadsPattern.test(value.replace(/\s/gu, '')),
    'Expected whitespace-separated groups of four base64 characters.',
  )
