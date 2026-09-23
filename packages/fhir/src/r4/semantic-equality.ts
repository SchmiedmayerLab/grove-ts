//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { err, ok, type Result } from '../core/index.js'

// A lossless reading of JSON text: numbers keep their lexeme, so `72` and `72.0` differ
// while member order, whitespace, and string escaping do not.
type Token =
  | { readonly kind: 'null' | 'true' | 'false' }
  | { readonly kind: 'number'; readonly lexeme: string }
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'array'; readonly items: readonly Token[] }
  | { readonly kind: 'object'; readonly members: ReadonlyMap<string, Token> }

const MAX_DEPTH = 512
const WHITESPACE = new Set([' ', '\t', '\n', '\r'])
const NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u
const SIMPLE_ESCAPES: ReadonlyMap<string, string> = new Map([
  ['"', '"'],
  ['\\', '\\'],
  ['/', '/'],
  ['b', '\b'],
  ['f', '\f'],
  ['n', '\n'],
  ['r', '\r'],
  ['t', '\t'],
])

class Reader {
  private readonly text: string
  private position = 0

  constructor(text: string) {
    this.text = text
  }

  fail(detail: string): never {
    throw new SyntaxError(`${detail} at offset ${this.position}.`)
  }

  skipWhitespace(): void {
    while (WHITESPACE.has(this.text.charAt(this.position))) this.position += 1
  }

  peek(): string {
    return this.text.charAt(this.position)
  }

  consume(expected: string): void {
    if (!this.text.startsWith(expected, this.position)) {
      this.fail(`Expected ${expected}`)
    }
    this.position += expected.length
  }

  atEnd(): boolean {
    return this.position >= this.text.length
  }

  readNumber(): Token {
    const match = NUMBER.exec(this.text.slice(this.position))
    if (match === null) this.fail('Expected a number')
    this.position += match[0].length
    return { kind: 'number', lexeme: match[0] }
  }

  readString(): string {
    this.consume('"')
    let value = ''
    for (;;) {
      const character = this.text.charAt(this.position)
      if (character === '') this.fail('Unterminated string')
      this.position += 1
      if (character === '"') return value
      if (character < ' ') this.fail('Control character in string')
      value += character === '\\' ? this.readEscape() : character
    }
  }

  private readEscape(): string {
    const escape = this.text.charAt(this.position)
    this.position += 1
    if (escape === 'u') {
      const digits = this.text.slice(this.position, this.position + 4)
      if (!/^[\dA-Fa-f]{4}$/u.test(digits)) this.fail('Invalid unicode escape')
      this.position += 4
      return String.fromCharCode(Number.parseInt(digits, 16))
    }
    const simple = SIMPLE_ESCAPES.get(escape)
    if (simple === undefined) this.fail('Invalid escape')
    return simple
  }

  readValue(depth: number): Token {
    if (depth > MAX_DEPTH) this.fail('Nesting too deep')
    this.skipWhitespace()
    const next = this.peek()
    if (next === '{') return this.readObject(depth)
    if (next === '[') return this.readArray(depth)
    if (next === '"') return { kind: 'string', value: this.readString() }
    for (const literal of ['null', 'true', 'false'] as const) {
      if (this.text.startsWith(literal, this.position)) {
        this.position += literal.length
        return { kind: literal }
      }
    }
    return this.readNumber()
  }

  private readArray(depth: number): Token {
    this.consume('[')
    const items: Token[] = []
    this.skipWhitespace()
    if (this.peek() === ']') {
      this.position += 1
      return { kind: 'array', items }
    }
    for (;;) {
      items.push(this.readValue(depth + 1))
      this.skipWhitespace()
      if (this.peek() === ',') {
        this.position += 1
        continue
      }
      this.consume(']')
      return { kind: 'array', items }
    }
  }

  private readObject(depth: number): Token {
    this.consume('{')
    const members = new Map<string, Token>()
    this.skipWhitespace()
    if (this.peek() === '}') {
      this.position += 1
      return { kind: 'object', members }
    }
    for (;;) {
      this.skipWhitespace()
      const key = this.readString()
      if (members.has(key)) this.fail(`Duplicate member ${key}`)
      this.skipWhitespace()
      this.consume(':')
      members.set(key, this.readValue(depth + 1))
      this.skipWhitespace()
      if (this.peek() === ',') {
        this.position += 1
        continue
      }
      this.consume('}')
      return { kind: 'object', members }
    }
  }
}

const decode = (input: string | Uint8Array): string =>
  typeof input === 'string' ? input : (
    new TextDecoder('utf-8', { fatal: true }).decode(input)
  )

const tokenize = (input: string | Uint8Array): Result<Token> => {
  try {
    const reader = new Reader(decode(input))
    const token = reader.readValue(0)
    reader.skipWhitespace()
    if (!reader.atEnd()) reader.fail('Unexpected trailing content')
    return ok(token)
  } catch (error) {
    return err(
      'invalid-type',
      error instanceof Error ? error.message : 'Expected JSON text.',
    )
  }
}

const tokensEqual = (left: Token, right: Token): boolean => {
  if (left.kind !== right.kind) return false
  switch (left.kind) {
    case 'number':
      return left.lexeme === (right as typeof left).lexeme
    case 'string':
      return left.value === (right as typeof left).value
    case 'array': {
      const items = (right as typeof left).items
      return (
        left.items.length === items.length &&
        left.items.every((item, index) => {
          const other = items[index]
          return other !== undefined && tokensEqual(item, other)
        })
      )
    }
    case 'object': {
      const members = (right as typeof left).members
      return (
        left.members.size === members.size &&
        [...left.members].every(([key, value]) => {
          const other = members.get(key)
          return other !== undefined && tokensEqual(value, other)
        })
      )
    }
    default:
      return true
  }
}

/**
 * Decides whether two serialized graphs carry the same content under the protocol's
 * equality rule: member order, whitespace and string escaping do not matter, decimal
 * lexemes do, and bytes are never compared. Malformed JSON text is an issue, not `false`.
 */
export const isSemanticallyEqual = (
  left: string | Uint8Array,
  right: string | Uint8Array,
): Result<boolean> => {
  const leftTokens = tokenize(left)
  if (!leftTokens.ok) return leftTokens
  const rightTokens = tokenize(right)
  if (!rightTokens.ok) return rightTokens
  return ok(tokensEqual(leftTokens.value, rightTokens.value))
}
