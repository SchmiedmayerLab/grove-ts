//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
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
  canonicalizeBoundedJcsIdentity,
  createEntryIdentity,
  type CanonicalIdentityValue,
} from '../mobile/identity.js'
import type {
  CompleteIdentifierInput,
  IdentifiedEntryIdentityInput,
} from '../mobile/types.js'

const connectedDigest = (preimage: CanonicalIdentityValue): Result<string> => {
  const canonical = canonicalizeBoundedJcsIdentity(preimage)
  if (!canonical.ok) return canonical
  return ok(
    `v1:${bytesToHex(sha256(new TextEncoder().encode(canonical.value)))}`,
  )
}

const connectedIdentitySystem = (
  role: 'conversion' | 'exchange' | 'output' | 'sourceRecord',
): AbsoluteUri =>
  providerAdapterCatalog.identity[role].system as AbsoluteUri

export interface ProviderIdentityInput {
  readonly provider: ConnectedProvider
  readonly providerAccountIdentifier: CompleteIdentifierInput
  readonly sourceType: string
  readonly sourceNativeId: string
  /** Closed catalog selectors; callers do not supply arbitrary values. */
  readonly outputDiscriminators: readonly [string, ...string[]]
  readonly eventSequence: PositiveInteger
}

export interface ProviderIdentities {
  readonly sourceRecord: CompleteIdentifierInput
  readonly outputs: readonly [
    CompleteIdentifierInput,
    ...CompleteIdentifierInput[],
  ]
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

  const sourceValue = connectedDigest([
    input.provider,
    input.providerAccountIdentifier.system,
    input.providerAccountIdentifier.value,
    input.sourceType,
    input.sourceNativeId,
  ])
  if (!sourceValue.ok) return sourceValue
  const sourceRecord = {
    system: connectedIdentitySystem('sourceRecord'),
    value: sourceValue.value,
  }

  const outputs: CompleteIdentifierInput[] = []
  for (const outputDiscriminator of input.outputDiscriminators) {
    const outputValue = connectedDigest([
      sourceRecord.system,
      sourceRecord.value,
      outputDiscriminator,
    ])
    if (!outputValue.ok) return outputValue
    outputs.push({
      system: connectedIdentitySystem('output'),
      value: outputValue.value,
    })
  }

  const eventPreimage = [
    [[sourceRecord.system, sourceRecord.value]],
    String(input.eventSequence),
  ] as const
  const eventValue = connectedDigest(eventPreimage)
  if (!eventValue.ok) return eventValue

  return ok(
    deepFreeze({
      sourceRecord,
      outputs,
      conversion: {
        system: connectedIdentitySystem('conversion'),
        value: eventValue.value,
      },
      exchange: {
        system: connectedIdentitySystem('exchange'),
        value: eventValue.value,
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
