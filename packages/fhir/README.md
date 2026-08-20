<!--

This source file is part of the Grove open-source project

SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)

SPDX-License-Identifier: MIT

-->

# Grove FHIR for TypeScript

`@schmiedmayerlab/grove-fhir` provides strict FHIR R4 contracts and Grove resource builders for TypeScript applications.
Version 0.2 is a deliberate, source-incompatible replacement for the former R4B resource-class API.

Here, `0.2.0` is the Grove FHIR contract/IG version exposed by generated
metadata. The monorepo keeps its established `0.0.0` source placeholders until
the lockstep release workflow injects the selected npm release version.

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
- Expected input failures use a discriminated `Result<T>` with stable issue codes and paths; successful results may carry non-blocking warnings.
- Validated strings use branded types for instants, canonical URLs, FHIR ids, Patient references, and `urn:uuid` full URLs.
- Provider-account pseudonym, source token/native id, durable event sequence, and all times are caller-owned identity inputs.
- Connected source/output/conversion/exchange identifiers and every Bundle full URL are derived internally from the frozen JCS/SHA-256 and UUID-v5 contracts.
- `Resource.id` is omitted unless the caller supplies a repository-assigned id.

## Connected Health measurements

The Grove Mobile 0.2 catalog defines 13 measurements whose semantics are shared
by at least two evidenced sources. This Connected Health facade exposes a
closed provider/source-token/measurement union for the 10 scalar measurements
admitted by the frozen Google Health API, Oura, and Withings inventories. It
includes point and period quantities plus composite blood pressure. Basal body
temperature, respiratory rate, and sleep stage are shared profiles but are not
constructible through this provider facade because the consumed Connected
Health shapes do not meet their timing or result semantics. BMI reuses the
standard R4 profile with a HealthKit adapter claim; the four specimen-specific
glucose profiles belong to Health Connect. Neither is incorrectly presented as
a shared Mobile profile. Google glucose lacks specimen evidence, daily vital
summaries are not relabeled as point measurements, and provider stage-duration
summaries are not relabeled as sleep-stage intervals. There is intentionally no
unprofiled fallback builder.

```typescript
import {
  buildConnectedHealthMeasurementBundle,
  parseConnectedHealthMeasurementBundleInput,
  parseNormalizedProviderRecord,
  type ConnectedHealthMeasurementBundleInput,
} from '@schmiedmayerlab/grove-fhir/connected-health'

import { parsePositiveInteger } from '@schmiedmayerlab/grove-fhir'
```

`parseNormalizedProviderRecord(unknown)` is the strict boundary for one source
record that an application has already mapped from Google Health API, Oura, or
Withings. Its `measurements` tuple is a non-empty, unique subset of the outputs
present in that record and admitted for its exact provider/source token. The
builder emits all supplied outputs atomically with one Provenance that targets
every resulting Observation; a malformed member fails the entire conversion.
Catalog order makes serialization deterministic but carries no FHIR semantic
meaning. For example, one Oura `daily_activity` record may carry any present
subset of step count, active energy, and distance; those outputs remain one
auditable conversion event and share the source's complete midnight-to-midnight
civil-day Period. The same complete-day rule applies to Withings daily activity
rows and permits offset changes across daylight-saving transitions. The strict
schema rejects unknown fields and raw provider responses.
This package contains no provider client, authentication, pagination, webhook,
or fetching behavior.

`parseConnectedHealthMeasurementBundleInput(unknown)` applies the same fail-closed behavior to the
complete graph input. `buildConnectedHealthMeasurementBundle` also runs that strict parser itself,
so JavaScript callers cannot bypass the boundary or add fields that would be
silently ignored. Identity strings are validated without trimming or otherwise
changing their digest input.

Every scalar `effectiveDateTime` and aggregate `effectivePeriod` endpoint is
canonicalized with the generated Mobile IG contract: exact offset-bearing
instants are rounded to the nearest millisecond with ties to even, including
across the Unix epoch, and serialized with the supplied numeric offset. The
source offset is never replaced or invented. `canonicalizeMobileEffectiveInstant`
exposes the same `Result`-typed primitive operation; Sensor and ECG
`SampledData` timing intentionally remains outside this policy.

The public producer is deliberately closed to the Connected Health adapter
profile. A future HealthKit, Health Connect, or other adapter must add its own
closed facade and profile claims; callers cannot inject an arbitrary adapter
canonical into this API.

The four provider-native series that the IG marks `mapped-standard` use the
separate closed `buildConnectedHealthRecordingBundle` facade:

```typescript
import {
  buildConnectedHealthRecordingBundle,
  encodeRecordingBytes,
  parseMediaType,
} from '@schmiedmayerlab/grove-fhir/connected-health'
```

The admitted source tokens are Google Health API `heart-rate`, Oura
`heartrate`, and Withings `activityIntraday` and `sleepIntraday`. The caller
passes an explicitly authorized and minimized encoding of bytes already in its
possession, or an immutable version-specific HTTP(S) URL with required size and
SHA-1/base64 integrity metadata. The builder emits a Sensor + Connected Health
`DocumentReference`, converter and data-origin application Devices, conversion
Provenance targeting the document, and the enclosing Mobile collection Bundle.
It never fetches the URL or parses provider-native content. Embedded attachment
size and hash are computed from the exact decoded bytes.

Every attachment requires exactly one of the two catalog-derived producer
assertions: `caller-authorized-opaque-payload` or
`verified-sanitized-input`. An absent, ambiguous, or unsupported assertion
fails closed. The assertion is producer preflight only, is never emitted as
FHIR authorization or consent, and is separate from recording-hardware identity
authorization.

`sourceNativeId` remains digest-only for raw recordings too. It is rejected if
it leaks through caller-controlled FHIR metadata such as an attachment title,
URL, Device display, business identifier, or repository id. Opaque attachment
bytes are intentionally not inspected or sanitized by Grove; their disclosure
and retention remain an explicit deployment responsibility, not authorization
granted by the digest or Attachment hash.

The high-level builder accepts a validated `ConnectedHealthMeasurementBundleInput` and returns a
`Result<CollectionBundle>`. The collection contains the Observation, converter
and data-origin application Devices, an optional recording Device, an optional
distinct gateway application, and conversion Provenance. Every internal edge
uses a derived `urn:uuid` Bundle full URL. Each entry carries the complete
business Identifier from which that URL was derived.

FHIR conversion does not make the converter a gateway. The gateway extension
is absent by default and appears only when `GatewayApplicationInput` carries the
explicit `mediated-or-routed-measurement` role assurance. The gateway may be the
converter in that additional role or a separately identified application.
Recording-device identity likewise declares either a deployment scope or an
explicitly authorized hardware scope. Serial numbers are not accepted by the
producer API.

The source record input contains a deployment-scoped pseudonymous provider
account Identifier, an exact catalog source token, and the provider-native id.
The native id and account pseudonym are digest inputs only and are never emitted
in the FHIR graph. The output discriminator is selected by the generated
catalog—callers cannot provide arbitrary text. The positive durable event
sequence distinguishes conversion/exchange events without changing source or
clinical-output identity. The builder never generates times, event sequences,
or repository ids.

`createEntryIdentity(identifier, id?)` remains available for deriving the
normative UUID-v5 full URL for caller-owned Device or Specimen business
identifiers. The high-level builder performs that derivation automatically.

Provider source tokens are lineage and identity inputs; they are never appended
to `Observation.code` as if they were clinically equivalent concepts. A future
adapter that admits sleep-stage intervals may retain a catalog-reviewed,
more-specific source state as the second
`Observation.valueCodeableConcept.coding`; the required shared Grove coding
remains first.

Study context uses branded `ResearchStudyReference` values. The parser accepts
only `ResearchStudy/{FHIR-id}` or an absolute HTTP(S) resource URL ending in
`/ResearchStudy/{FHIR-id}`. Queries, fragments, history URLs, malformed paths,
and duplicate literal references fail closed.

The synchronized normative catalog and its resolved development reference live
under `catalog/grove-fhir`. `catalog/measurement-capabilities.json`
distinguishes the 10 constructible Connected Health scalar measurements, four
constructible native-recording source tokens, three shared profiles not
admitted by this facade, adapter-profiled BMI/glucose outputs, and reviewed
future, adapter-only, Sensor, and out-of-scope candidates.

## Questionnaires

The `questionnaire` entry point builds strict, versioned R4
`Questionnaire`/`QuestionnaireResponse` resources and preflights a pair before
submission:

```typescript
import {
  buildQuestionnaire,
  buildQuestionnaireResponse,
  preflightQuestionnairePair,
} from '@schmiedmayerlab/grove-fhir/questionnaire'
```

The builders own the exact Grove profile declarations, Semantic Versioning
algorithm extension, and electronic completion-mode extension. Answer values
are an exactly-one `value[x]` union in TypeScript and in the runtime schema.
The pair preflight checks the exact `url|version`, global link identity,
response nesting, answer types, inline options, repeats, response text,
conditional enablement, and required enabled items for completed or amended
responses. It also enforces text length and decimal-place limits, scalar and
quantity bounds, inline or ValueSet-backed quantity units, attachment MIME and
size limits, repeated-answer occurrence bounds, and exclusive options.

Terminology is never fetched. For a coded item backed by `answerValueSet`, the
caller supplies a normalized resolved concept list through
`QuestionnairePreflightOptions`; an absent expansion fails closed with an
`external-validation-required` issue. FHIRPath expressions must use
`text/fhirpath` with non-empty source; variables have unique, non-reserved names
within each scope; and target constraints have a globally unique key, severity,
human guidance, and expression.

For completed or amended responses, unevaluated expression enablement,
calculated output, and error-severity target constraints fail closed so the
application can route the pair through its configured SDC FHIRPath engine. A
warning-severity target constraint returns an `ok: true` result with a
non-empty `warnings` array and must be surfaced or recorded by the caller. An
`initialExpression` population failure alone does not block completion, though
ordinary required-answer rules still apply. Text length is counted in Unicode
code points to match the IG companion validator.

This package does not extract Questionnaire answers into Observations. That is
a separate, explicitly configured clinical mapping operation.

## Entry points

The root entry point contains the source-neutral aggregate: validated
primitives, the bounded R4 closure, the shared Mobile contract, and
Questionnaire support. Provider-specific construction is deliberately absent.

```typescript
import {
  parseFhirInstant,
  parseObservation,
  type Result,
} from '@schmiedmayerlab/grove-fhir'
```

Use the Mobile entry point for source-neutral shared semantics, deterministic
entry identity, and effective-time canonicalization:

```typescript
import {
  canonicalizeMobileEffectiveInstant,
  groveMobilePackageMetadata,
  sharedMobileMeasurementCatalog,
  type MobileMeasurement,
} from '@schmiedmayerlab/grove-fhir/mobile'
```

Use the Connected Health entry point for the closed Google Health API, Oura,
and Withings mapping and graph builders:

```typescript
import {
  buildConnectedHealthMeasurementBundle,
  buildConnectedHealthRecordingBundle,
  groveConnectedHealthPackageMetadata,
} from '@schmiedmayerlab/grove-fhir/connected-health'
```

Each generated package-metadata value is bounded to that entry point's
applicable IG package and includes its exact package id, canonical, dependency
list, FHIR release, and IG contract version. The root exposes only the shared
`groveFhirVersion` and `groveFhirContractVersion`; it does not expose the full
internal adapter package graph.

There is no generic Sensor producer entry point in this release. The admitted
raw-recording facade owns exact Sensor + Connected Health profile claims and
provider identity, so presenting it as source-neutral would weaken the closed
adapter contract. A future Sensor producer must expose its own evidenced,
profile-closed facade.

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
Normative conformance is established by validating generated fixtures with the official HL7 FHIR Validator and the pinned Grove implementation-guide packages. Synchronized IG catalogs and the Mobile semantic corpus retain the exact upstream bytes; local generated TypeScript is derived from those immutable inputs.

## Development conformance

`npm run check:fixtures` regenerates the committed conformance corpus from the
public API and fails if any resource has drifted. With a local Grove FHIR
checkout, the fast fail-closed checks run as follows:

```sh
npm run conformance:structural -- --ig /path/to/grove-fhir
```

`npm run conformance` additionally requires the checksum-pinned official FHIR
Validator and the Mobile, Sensor dependency, Connected Health, and Questionnaire
packages built in that checkout. It validates all 10 admitted Mobile
measurement graphs, all four admitted native-recording graphs, and the
Questionnaire/Response pair. Every admitted scalar fixture is generated from
the IG's versioned Mobile semantic corpus and bound through an exact RFC 6901
resource pointer, so the generic producer kit compares the emitted profile,
clinical code, effective time, and result projection—not only the resource
shape.

During coordinated 0.2 development, CI consumes
`feature/fhir-v020-adapters`. `catalog/grove-fhir/source-ref.json` records the
resolved review snapshot for traceability; SHA drift is reported but is not by
itself a failure. Catalog or emitted-resource drift is a failure. Before merge,
the consumer branch must refresh the catalogs and recorded snapshot to the
reviewed IG head, be marked ready for review, and pass the repository's full
readiness CI. Draft pull requests run explicitly labeled scoped FHIR and fast
standards checks; the release-readiness aggregate stays fail-closed. Marking a
pull request ready reruns the complete repository suite and official Validator
workflow.

## License

This project is licensed under the MIT License.
See [Licenses](https://github.com/SchmiedmayerLab/grove-ts/tree/main/LICENSES) for more information.

## Contributors

This package is developed by the Schmiedmayer Lab at Stanford University.
See [CONTRIBUTORS.md](../../CONTRIBUTORS.md).
