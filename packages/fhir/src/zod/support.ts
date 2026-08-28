//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

/**
 * A FHIR dateTime as an epoch value that orders correctly.
 *
 * R4 admits a leap second, which no JavaScript date parser accepts; mapping it to `:59` keeps the
 * instant within the second it belongs to, which is all an ordering comparison needs. A value
 * stated to lower precision parses at the start of the period it names, which is the comparison
 * FHIR intends.
 *
 * Returns `NaN` for a value the primitive's own pattern would already have rejected; a caller
 * comparing two endpoints treats that as "not comparable" rather than as "out of order", so a
 * malformed date is reported as malformed and not as an ordering fault.
 */
export const fhirDateTimeToEpoch = (value: string): number =>
  Date.parse(value.replace(/:60(?=\.|Z|[+-]|$)/u, ':59'))
