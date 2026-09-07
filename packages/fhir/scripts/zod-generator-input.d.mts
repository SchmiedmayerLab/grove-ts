//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

export declare function fhirTypeName(value: unknown, label?: string): string

export declare function structureSchemaIdentifier(name: unknown): string

export declare function fhirTypeAlias(name: unknown): string

export declare function pathSchemaIdentifier(path: unknown): string

export declare function resourceDispatchIdentifiers(name: unknown): Readonly<{
  table: string
  inFlight: string
}>

export declare function assertSafeGeneratorInput(
  input: Readonly<{
    structures: Map<unknown, unknown>
    valueSets: Map<unknown, unknown>
    codeSystems: Map<unknown, unknown>
    declaredTypes: Set<unknown>
  }>,
): void
