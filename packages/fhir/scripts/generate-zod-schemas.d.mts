//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

/** A FHIR package the generator reads, pinned by version and content digest. */
export interface FhirPackageReference {
  readonly packageId: string
  readonly version: string
  /** SHA-512 of the published tarball, verified before extraction. */
  readonly integrity?: string
}

/** The example corpora each release publishes, for validating against instances we did not author. */
export declare const EXAMPLE_PACKAGES: Readonly<
  Record<'r4' | 'r4b', FhirPackageReference>
>

/**
 * Downloads and unpacks a FHIR package once, then reuses it.
 *
 * @returns The absolute path of the package's `package` directory.
 */
export declare function fhirPackage(
  reference: FhirPackageReference,
): Promise<string>
