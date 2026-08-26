//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { providerAdapterCatalog } from './contract.generated.js'
import type { ConnectedProvider } from './types.js'
import {
  deepFreeze,
  err,
  ok,
  parseAbsoluteUri,
  parseFhirId,
  parsePositiveInteger,
  type AbsoluteUri,
  type PositiveInteger,
  type Result,
} from '../core/index.js'
import {
  containsIsolatedSurrogate,
  createEntryIdentity,
} from '../mobile/identity.js'
import type {
  CompleteIdentifierInput,
  IdentifiedEntryIdentityInput,
} from '../mobile/types.js'

const SEPARATOR = '|'

/** Joins components behind the scheme version. Nothing is hashed, escaped, or re-encoded. */
const compose = (components: readonly string[]): Result<string> => {
  for (const component of components) {
    if (component.includes(SEPARATOR)) {
      return err(
        'invalid-identifier',
        'An identity component must not contain a vertical bar; such a value is rejected, never escaped.',
      )
    }
    if (containsIsolatedSurrogate(component)) {
      return err(
        'invalid-identifier',
        'Identity components must contain Unicode scalar values only.',
      )
    }
  }
  return ok(`v1:${components.join(SEPARATOR)}`)
}

const connectedIdentitySystem = (
  role: 'output' | 'sourceRecord',
): AbsoluteUri => providerAdapterCatalog.identity[role].system as AbsoluteUri

/**
 * Whether this provider's native record key is unique across the whole provider, or only within
 * one account. An account-scoped provider carries its deployment pseudonym as a component, so the
 * identifier still stands alone and a receiver deduplicates by comparing system and value.
 */
const identifierScope = (provider: ConnectedProvider): 'account' | 'none' => {
  const entry = providerAdapterCatalog.providers.find(
    (candidate) => candidate.id === provider,
  ) as { readonly identifierScope?: 'account' | 'none' } | undefined
  // Scoped by account unless the vendor documents that its record key is unique across accounts.
  return entry?.identifierScope ?? 'account'
}

export interface ProviderIdentityInput {
  readonly provider: ConnectedProvider
  readonly providerAccountIdentifier: CompleteIdentifierInput
  readonly sourceType: string
  readonly sourceNativeId: string
  /** Closed catalog selectors; callers do not supply arbitrary values. */
  readonly outputDiscriminators: readonly [string, ...string[]]
  readonly eventSequence: PositiveInteger
  /** The namespace this deployment owns for graph nodes the export creates. */
  readonly graphIdentifierSystem: AbsoluteUri
}

export interface ProviderIdentities {
  readonly sourceRecord: CompleteIdentifierInput
  /** Empty for a one-to-one conversion; one entry per output where a record fans out. */
  readonly outputs: readonly CompleteIdentifierInput[]
  readonly conversion: CompleteIdentifierInput
  readonly exchange: CompleteIdentifierInput
}

/** Internal closed-facade derivation of every Provider business id. */
export const deriveProviderIdentities = (
  input: ProviderIdentityInput,
): Result<ProviderIdentities> => {
  if (!parseAbsoluteUri(input.providerAccountIdentifier.system).ok) {
    return err(
      'invalid-uri',
      'Provider account Identifier.system must be an absolute URI.',
      ['providerAccountIdentifier', 'system'],
    )
  }
  if (
    input.providerAccountIdentifier.value.trim() === '' ||
    input.sourceType.trim() === '' ||
    input.sourceNativeId.trim() === '' ||
    input.outputDiscriminators.some(
      (outputDiscriminator) => outputDiscriminator.trim() === '',
    )
  ) {
    return err(
      'invalid-identifier',
      'Provider identity inputs must not be empty.',
    )
  }
  if (
    new Set(input.outputDiscriminators).size !==
    input.outputDiscriminators.length
  ) {
    return err(
      'duplicate-identifier',
      'Provider output discriminators must be unique.',
      ['outputDiscriminators'],
    )
  }
  const sequence = parsePositiveInteger(input.eventSequence)
  if (!sequence.ok) return sequence

  // A provider whose native key is unique across the whole provider carries that key verbatim:
  // the system already says which provider and which key space it belongs to. Only an
  // account-scoped provider composes, because its key alone would not identify one record.
  const accountScoped = identifierScope(input.provider) === 'account'
  const sourceComponents =
    accountScoped ?
      [
        input.provider,
        input.providerAccountIdentifier.value,
        input.sourceType,
        input.sourceNativeId,
      ]
    : [input.sourceNativeId]
  const sourceValue =
    accountScoped ? compose(sourceComponents) : ok(input.sourceNativeId)
  if (!sourceValue.ok) return sourceValue
  const sourceRecord = {
    system: connectedIdentitySystem('sourceRecord'),
    value: sourceValue.value,
  }

  // A source record yielding one Observation gives it no output identifier: a second namespace
  // repeating the source-record value would identify nothing new. Only a fan-out needs to tell
  // its outputs apart.
  const outputs: CompleteIdentifierInput[] = []
  if (input.outputDiscriminators.length > 1) {
    for (const outputDiscriminator of input.outputDiscriminators) {
      const outputValue = compose([...sourceComponents, outputDiscriminator])
      if (!outputValue.ok) return outputValue
      outputs.push({
        system: connectedIdentitySystem('output'),
        value: outputValue.value,
      })
    }
  }

  // The conversion Provenance and the exchange Bundle record an export event rather than anything
  // read from the provider, so they are named in the deployment's own namespace and carry no
  // scheme prefix from this guide.
  const eventKey = (role: string): string =>
    [input.provider, String(input.eventSequence), role].join(SEPARATOR)

  return ok(
    deepFreeze({
      sourceRecord,
      outputs,
      conversion: {
        system: input.graphIdentifierSystem,
        value: eventKey('conversion-provenance'),
      },
      exchange: {
        system: input.graphIdentifierSystem,
        value: eventKey('exchange-bundle'),
      },
    }) as unknown as ProviderIdentities,
  )
}

/** Internal runtime bridge from strict adapter schemas to branded graph identity. */
export const parseResourceIdentityInput = (input: {
  readonly identifier: { readonly system: string; readonly value: string }
  readonly id?: string | undefined
}): Result<IdentifiedEntryIdentityInput> => {
  const system = parseAbsoluteUri(input.identifier.system)
  if (!system.ok) return system
  const id = input.id === undefined ? undefined : parseFhirId(input.id)
  if (id !== undefined && !id.ok) return id
  return createEntryIdentity(
    { system: system.value, value: input.identifier.value },
    id?.value,
  )
}
