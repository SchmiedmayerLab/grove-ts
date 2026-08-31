//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { err, ok, type Result } from '../core/result.js'

const asObject = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null ?
    (value as Record<string, unknown>)
  : undefined

/** Every extension the resource or element carries under one URL. */
export const extensionsByUrl = (
  value: unknown,
  url: string,
): readonly unknown[] => {
  const object = asObject(value)
  const extensions = object?.extension
  if (!Array.isArray(extensions)) return []
  return extensions.filter((entry) => asObject(entry)?.url === url)
}

/** The single extension carried under one URL, or undefined when none is. */
export const extensionByUrl = (value: unknown, url: string): unknown =>
  extensionsByUrl(value, url)[0]

/** Every text a list of Annotations carries, in the order stated. */
export const annotationTexts = (value: unknown): readonly string[] => {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => asObject(entry)?.text)
    .filter((text): text is string => typeof text === 'string')
}

/** The contained resources of one type, in the order the resource states them. */
export const containedResourcesByType = (
  resource: unknown,
  resourceType: string,
): readonly unknown[] => {
  const contained = asObject(resource)?.contained
  if (!Array.isArray(contained)) return []
  return contained.filter(
    (entry) => asObject(entry)?.resourceType === resourceType,
  )
}

/**
 * The contained resource a local reference names.
 *
 * A local reference is `#id`; anything else points outside the resource and cannot be resolved
 * from it, so it resolves to undefined rather than to a same-id resource that merely collides.
 */
export const containedResource = (
  resource: unknown,
  reference: string,
): unknown => {
  if (!reference.startsWith('#') || reference.length < 2) return undefined
  const contained = asObject(resource)?.contained
  if (!Array.isArray(contained)) return undefined
  const id = reference.slice(1)
  return contained.find((entry) => asObject(entry)?.id === id)
}

/** The type a Reference points at, from `type` when stated and from the literal otherwise. */
export const referenceType = (value: unknown): string | undefined => {
  const object = asObject(value)
  if (object === undefined) return undefined
  if (typeof object.type === 'string' && object.type.length > 0) {
    return object.type
  }
  const literal = object.reference
  if (typeof literal !== 'string') return undefined
  // `Patient/123`, or the same with a base URL and possibly a version, so read from the right.
  const parts = literal.split('/_history/')[0]?.split('/') ?? []
  const type = parts[parts.length - 2]
  return type !== undefined && /^[A-Z][A-Za-z]+$/u.test(type) ? type : undefined
}

/** Whether a Reference points at a resource of this type. */
export const isReferenceToType = (
  value: unknown,
  resourceType: string,
): boolean => referenceType(value) === resourceType

/**
 * The relative literal a resource is referenced by, as `Type/id`.
 *
 * Reported rather than returned empty: a resource with no id cannot be referenced at all, and a
 * caller that builds `Type/undefined` from it produces a link that resolves to nothing.
 */
export const toReference = (resource: unknown): Result<string> => {
  const object = asObject(resource)
  const resourceType = object?.resourceType
  const id = object?.id
  if (typeof resourceType !== 'string' || resourceType.length === 0) {
    return err('missing-required', 'A reference needs the resource type.', [
      'resourceType',
    ])
  }
  if (typeof id !== 'string' || id.length === 0) {
    return err(
      'missing-required',
      'A resource without an id cannot be referenced.',
      ['id'],
    )
  }
  return ok(`${resourceType}/${id}`)
}

/**
 * A FHIR base64Binary as its bytes.
 *
 * Whitespace is legal inside the lexical form and is stripped before decoding, so a value
 * wrapped across lines decodes rather than failing.
 */
export const decodeBase64Binary = (value: unknown): Result<Uint8Array> => {
  if (typeof value !== 'string') {
    return err('invalid-type', 'Expected a FHIR base64Binary.')
  }
  const packed = value.replaceAll(/[ \t\n\r]/gu, '')
  if (packed.length % 4 !== 0 || /[^0-9A-Za-z+/=]/u.test(packed)) {
    return err('schema-invalid', 'Expected a FHIR base64Binary.')
  }
  try {
    const binary = atob(packed)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return ok(bytes)
  } catch {
    return err('schema-invalid', 'Expected a FHIR base64Binary.')
  }
}
