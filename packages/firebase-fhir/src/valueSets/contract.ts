//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * The status of the contract.
 * http://hl7.org/fhir/valueset-contract-status.html
 */
export const contractStatusSchema = z.enum([
  'amended',
  'appended',
  'cancelled',
  'disputed',
  'entered-in-error',
  'executable',
  'executed',
  'negotiable',
  'offered',
  'policy',
  'rejected',
  'renewed',
  'revoked',
  'resolved',
  'terminated',
])

/**
 * The status of the contract.
 * http://hl7.org/fhir/valueset-contract-status.html
 */
export type ContractStatus = z.infer<typeof contractStatusSchema>

/**
 * The publication status of the contract content definition.
 * http://hl7.org/fhir/valueset-contract-publicationstatus.html
 */
export const contractPublicationStatusSchema = z.enum([
  'amended',
  'appended',
  'cancelled',
  'disputed',
  'entered-in-error',
  'executable',
  'executed',
  'negotiable',
  'offered',
  'policy',
  'rejected',
  'renewed',
  'revoked',
  'resolved',
  'terminated',
])

/**
 * The publication status of the contract content definition.
 * http://hl7.org/fhir/valueset-contract-publicationstatus.html
 */
export type ContractPublicationStatus = z.infer<
  typeof contractPublicationStatusSchema
>
