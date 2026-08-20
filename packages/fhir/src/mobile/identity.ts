//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { v5 as uuidV5 } from 'uuid'
import { groveFhirExchangeIdentity } from './measurement-catalog.generated.js'
import type {
  CompleteIdentifierInput,
  IdentifiedEntryIdentityInput,
} from './types.js'
import {
  deepFreeze,
  err,
  ok,
  parseAbsoluteUri,
  parseFhirId,
  parseUrnUuid,
  type FhirId,
  type Result,
  type UrnUuid,
} from '../core/index.js'

const containsIsolatedSurrogate = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!Number.isInteger(next) || next < 0xdc00 || next > 0xdfff) return true
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true
    }
  }
  return false
}

/**
 * Serializes the exact `[system,value]` identity input required by the IG.
 * JSON.stringify is RFC 8785/JCS-compatible for this bounded string tuple.
 */
export const canonicalizeEntryIdentifier = (
  input: CompleteIdentifierInput,
): Result<string> => {
  if (!parseAbsoluteUri(input.system).ok) {
    return err('invalid-uri', 'Identifier.system must be an absolute URI.', [
      'system',
    ])
  }
  if (input.value.length === 0) {
    return err('invalid-identifier', 'Identifier.value must not be empty.', [
      'value',
    ])
  }
  if (
    containsIsolatedSurrogate(input.system) ||
    containsIsolatedSurrogate(input.value)
  ) {
    return err(
      'invalid-identifier',
      'Identifier strings must contain Unicode scalar values only.',
    )
  }
  return ok(JSON.stringify([input.system, input.value]))
}

/** Derives the IG-mandated lowercase UUID-v5 Bundle entry fullUrl. */
export const deriveEntryFullUrl = (
  input: CompleteIdentifierInput,
): Result<UrnUuid> => {
  const canonical = canonicalizeEntryIdentifier(input)
  if (!canonical.ok) return canonical

  return parseUrnUuid(
    `urn:uuid:${uuidV5(
      canonical.value,
      groveFhirExchangeIdentity.fullUrlAlgorithm.namespace,
    )}`,
  )
}

/** Pairs a business identifier with its deterministic exchange identity. */
export const createEntryIdentity = (
  identifier: CompleteIdentifierInput,
  id?: FhirId,
): Result<IdentifiedEntryIdentityInput> => {
  if (id !== undefined && !parseFhirId(id).ok) {
    return err('invalid-identifier', 'Resource.id is not a valid FHIR id.', [
      'id',
    ])
  }
  const fullUrl = deriveEntryFullUrl(identifier)
  if (!fullUrl.ok) return fullUrl

  return ok(
    deepFreeze({
      fullUrl: fullUrl.value,
      identifier,
      ...(id === undefined ? {} : { id }),
    }) as unknown as IdentifiedEntryIdentityInput,
  )
}
