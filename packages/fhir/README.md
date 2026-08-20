<!--

This source file is part of the Grove open-source project

SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)

SPDX-License-Identifier: MIT

-->

# Grove FHIR for TypeScript

`@schmiedmayerlab/grove-fhir` provides strict FHIR R4 contracts and Grove resource builders for TypeScript applications.
Version 0.2 is a deliberate, source-incompatible replacement for the former R4B resource-class API.

The package targets FHIR R4 4.0.1 only.
It has no Firebase dependency and does not fetch health data, authenticate with providers, persist resources, or define transport behavior.

## Requirements

- Node.js 24 or newer
- npm 12 for repository development
- TypeScript 6 for repository development

The published JavaScript uses portable ES2022 and Web Platform APIs.

## Design

- FHIR resources are immutable plain JSON values.
- Runtime schemas are strict and reject unknown properties instead of silently removing them.
- The supported R4 closure is intentionally bounded to the resources Grove constructs and validates.
- Expected input failures use a discriminated `Result<T>` with stable issue codes and paths.
- Validated strings use branded types for instants, canonical URLs, FHIR ids, Patient references, and `urn:uuid` full URLs.
- Resource identifiers, full URLs, repository ids, conversion time, and issued time are supplied by the caller.
- `Resource.id` is omitted unless the caller supplies a repository-assigned id.

## Mobile measurements

The `mobile` entry point exposes one closed, discriminated input union for every
measurement admitted by the Grove Mobile 0.2 catalog. It includes point and
period quantities, composite blood pressure, and source-neutral sleep stages.
There is intentionally no unprofiled fallback builder.

```typescript
import {
  buildMobileBundle,
  createEntryIdentity,
  parseNormalizedProviderMeasurement,
  type MobileBundleInput,
} from '@schmiedmayerlab/grove-fhir/mobile'
```

`parseNormalizedProviderMeasurement(unknown)` is the strict boundary for data
that an application has already mapped from Google Health API, Oura, or
Withings. Its schema rejects unknown fields and raw provider responses. This
package contains no provider client, authentication, pagination, webhook, or
fetching behavior.

The high-level builder accepts a validated `MobileBundleInput` and returns a
`Result<CollectionBundle>`. The collection contains the Observation,
application and recording Devices when present, and conversion Provenance.
Every internal edge uses a `urn:uuid` Bundle full URL. Each entry carries the
complete business Identifier used to derive that URL.

`createEntryIdentity(identifier, id?)` explicitly derives the normative UUID-v5
full URL from the IG's RFC 8785/JCS identity contract. The builder independently
checks every supplied full URL against its Identifier. It never generates time,
business identity, or repository ids.

Source-native sample types may be retained as an additional
`Observation.code.coding`. A more-specific native sleep state may likewise be
retained as a second `Observation.valueCodeableConcept.coding`; the required
shared Grove sleep-stage coding remains first.

The synchronized normative catalog and its resolved development reference live
under `catalog/grove-fhir`. `catalog/measurement-capabilities.json` distinguishes
the 18 constructible shared measurements from reviewed future, adapter-only,
sensor, and out-of-scope candidates.

## Entry points

Use the root entry point for high-level parsing and validated primitives:

```typescript
import {
  parseFhirInstant,
  parseObservation,
  type Result,
} from '@schmiedmayerlab/grove-fhir'
```

Use the R4 entry point for the bounded resource schemas and types:

```typescript
import {
  parseCollectionBundle,
  type CollectionBundle,
} from '@schmiedmayerlab/grove-fhir/r4'
```

Parsing never returns a partially accepted resource:

```typescript
const result = parseObservation(input)

if (!result.ok) {
  for (const issue of result.issues) {
    console.error(issue.path, issue.code, issue.message)
  }
}
```

## R4 boundary

The runtime schemas validate the exact Grove-supported subset of each R4 resource.
They preserve admitted primitive metadata such as `_effectiveDateTime` and reject properties outside that subset.
Passing the runtime schema is an application preflight, not a declaration of profile conformance.
Normative conformance is established by validating generated fixtures with the official HL7 FHIR Validator and the pinned Grove implementation-guide packages.

## License

This project is licensed under the MIT License.
See [Licenses](https://github.com/SchmiedmayerLab/grove-ts/tree/main/LICENSES) for more information.

## Contributors

This package is developed by the Schmiedmayer Lab at Stanford University.
See [CONTRIBUTORS.md](../../CONTRIBUTORS.md).
