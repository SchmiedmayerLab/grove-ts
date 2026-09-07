//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

const STANDARD_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const URL_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export interface Base64Options {
  /** Use the URL and filename safe alphabet, which carries no `=` padding. */
  readonly urlSafe?: boolean
}

export const encodeBase64 = (
  bytes: Uint8Array,
  options: Base64Options = {},
): string => {
  const urlSafe = options.urlSafe === true
  const alphabet = urlSafe ? URL_ALPHABET : STANDARD_ALPHABET
  const padding = urlSafe ? '' : '='
  let output = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0
    const second = bytes[index + 1]
    const third = bytes[index + 2]
    const block = (first << 16) | ((second ?? 0) << 8) | (third ?? 0)
    output += alphabet.charAt((block >>> 18) & 63)
    output += alphabet.charAt((block >>> 12) & 63)
    output +=
      second === undefined ? padding : alphabet.charAt((block >>> 6) & 63)
    output += third === undefined ? padding : alphabet.charAt(block & 63)
  }
  return output
}

/**
 * The bytes `value` encodes, but only when it is their exact canonical encoding.
 *
 * Re-encoding is the whole check: it rejects a foreign alphabet, wrong padding, and
 * the non-zero trailing bits a lenient decoder would silently discard.
 */
export const decodeCanonicalBase64 = (
  value: string,
  options: Base64Options = {},
): Uint8Array | undefined => {
  const alphabet = options.urlSafe === true ? URL_ALPHABET : STANDARD_ALPHABET
  const digits = value.replace(/={1,2}$/u, '')
  const bytes: number[] = []
  let accumulator = 0
  let bits = 0
  for (const character of digits) {
    const digit = alphabet.indexOf(character)
    if (digit < 0) return undefined
    accumulator = (accumulator << 6) | digit
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((accumulator >>> bits) & 0xff)
    }
  }
  const decoded = Uint8Array.from(bytes)
  return encodeBase64(decoded, options) === value ? decoded : undefined
}
