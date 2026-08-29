<!--

This source file is part of the Grove open-source project

SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)

SPDX-License-Identifier: MIT

-->

# Grove FHIR for TypeScript

`@schmiedmayerlab/grove-fhir` provides strict FHIR R4 contracts and Grove resource builders for TypeScript applications.

The package targets FHIR R4 4.0.1 only.
It has no Firebase dependency and does not fetch health data, authenticate with providers, persist resources, or define transport behavior.

The contract version exposed by generated metadata is the Grove FHIR implementation-guide version.
The monorepo keeps its `0.0.0` source placeholders until the lockstep release workflow injects the selected npm release version.

## New to FHIR?

FHIR is a standard for exchanging health data as JSON documents called resources.
This package builds four of them: an `Observation` for each measurement, a `Device` for the thing that recorded it, a `Provenance` saying where the record came from, and a `Bundle` holding the set together.

If those words are unfamiliar, read the _New to FHIR_ page of the Grove Mobile implementation guide
(`https://grovealliance.org/fhir/mobile`) first.
It explains the resources this package emits, the difference between a server-assigned `id` and a business `identifier`, and why a measurement carries two devices — in about ten minutes, without assuming any FHIR background.

The guide is the single place those concepts are explained; this README covers only what is specific to this package.

## Your first bundle

One measurement, turned into a complete Grove exchange graph:

```typescript
import {
  parseAbsoluteUri,
  parseFhirInstant,
  type DeploymentIdentityInput,
  type Result,
} from '@schmiedmayerlab/grove-fhir'
import { buildProviderMeasurementBundle } from '@schmiedmayerlab/grove-fhir/providers'

// Every parse returns a Result; a real application reports the issues instead of throwing.
const unwrap = <Value>(result: Result<Value>): Value => {
  if (!result.ok) throw new Error(result.issues[0]?.message)
  return result.value
}

const measuredAt = unwrap(parseFhirInstant('2026-08-19T17:30:00Z'))

const identitySecret = process.env.GROVE_IDENTITY_SECRET_BASE64URL
if (identitySecret === undefined) {
  throw new Error('Load the Grove HMAC key from the deployment secret store.')
}

const identitySystem = (kind: string) =>
  unwrap(
    parseAbsoluteUri(
      `https://mystudy.example.org/fhir/identity/${kind}/study-key/1`,
    ),
  )

const deploymentIdentity: DeploymentIdentityInput = {
  opaqueIdentifierSystems: {
    'source-record': identitySystem('source-record'),
    'source-output': identitySystem('source-output'),
    'writer-record': identitySystem('writer-record'),
    'provider-record': identitySystem('provider-record'),
    'provider-output': identitySystem('provider-output'),
    'source-artifact': identitySystem('source-artifact'),
    'provider-artifact': identitySystem('provider-artifact'),
    'source-context': identitySystem('source-context'),
    'recording-device': identitySystem('recording-device'),
    'device-snapshot': identitySystem('device-snapshot'),
  },
  eventIdentifierSystem: identitySystem('event'),
  entryNodeIdentifierSystem: identitySystem('entry-node'),
  keyId: 'study-key',
  keyEpoch: '1',
  secretBase64Url: identitySecret,
  producerInstance: 'd59d7bda-7c5a-48f9-a5ac-0eb87ec04cb0',
}

const result = buildProviderMeasurementBundle({
  subject: {
    type: 'Patient',
    identifier: {
      system: unwrap(
        parseAbsoluteUri(
          'https://mystudy.example.org/fhir/identifiers/patient-pseudonyms',
        ),
      ),
      value: 'pseudonym-participant-01',
      assurance: 'deployment-scoped-pseudonym',
    },
  },
  measurements: [
    {
      kind: 'body-weight',
      value: 72.5,
      effective: { kind: 'date-time', value: measuredAt },
    },
  ],
  source: {
    adapter: { kind: 'providers', provider: 'google-health-api' },
    providerScopeIdentifier: {
      system: unwrap(
        parseAbsoluteUri(
          'https://mystudy.example.org/fhir/identifiers/provider-accounts',
        ),
      ),
      value: 'provider-account-pseudonym-7f3a',
      assurance: 'deployment-scoped-account-pseudonym',
    },
    sourceType: 'weight',
    sourceNativeId: 'ghapi-weight-20260819',
    recordingMethod: 'automatically-recorded',
    dataOrigin: {
      sourceDeviceToken: 'google-health-api-2026-08',
      name: 'Google Health API',
    },
  },
  application: {
    sourceDeviceToken: 'org.example.mystudy/2.1.0/42',
    name: 'MyStudy',
    version: '2.1.0',
    build: '42',
  },
  deploymentIdentity,
  eventSequence: '1042',
  occurred: measuredAt,
  recorded: unwrap(parseFhirInstant('2026-08-20T12:02:00Z')),
  assembled: unwrap(parseFhirInstant('2026-08-20T12:03:00Z')),
})

if (!result.ok) {
  for (const issue of result.issues) {
    console.error(issue.path.join('.'), issue.code, issue.message)
  }
}
```

A success gives you a frozen `collection` Bundle that has passed the package's profile-aware producer preflight, holding the Observation, application snapshots, and Provenance. Release conformance still uses the official validator as described below.

Four conventions are visible in that call and hold throughout the package:

- **Nothing throws for bad input.**
  Every parser and builder returns a `Result<T>`: either `{ ok: true, value }` or `{ ok: false, issues }`, where each issue carries a stable `code` and a `path` into your input.
  Unknown JavaScript input first crosses a strict JSON-domain snapshot boundary, so cycles, accessors, sparse arrays, special objects, and non-JSON values are reported rather than reaching schema code or becoming shared mutable state.
  Reserve `try`/`catch` for genuine programming errors.
- **Validated strings are branded types.**
  An `AbsoluteUri` or a `FhirInstant` can only be produced by its parser, so a malformed timestamp is caught where it enters rather than at the receiving server.
  This is why the example parses its literals instead of passing raw strings.
- **You supply governed identity inputs; the package derives the graph.**
  The deployment owns the key, key-epoch-specific Identifier systems, producer instance, monotonic event sequence, account pseudonym, source-native id, and all event times.
  Source and output identifiers use the Grove v0 domain-separated HMAC contract; internal `urn:uuid` links use UUIDv5 over the selected complete Identifier pair.
  An exact retry reuses the event sequence, `occurred`, `recorded`, `assembled`, and payload. A changed source revision or payload is a new event with a new sequence.
- **Results are frozen plain JSON.**
  Serialize them, store them, send them; there are no classes and no hidden state.

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
- Provider scope, native source id, device snapshot token, durable producer-wide event sequence, key lifecycle, and all times are caller-owned inputs. Account-scoped providers require a deployment pseudonym; a provider with authoritative global record keys instead requires one documented global key-space pair, so identity cannot fragment across accounts.
- Source/output/artifact/writer/device identifiers use HMAC-SHA-256 over unsigned-32-bit length-framed UTF-8 fields with an explicit protocol domain, key id, and positive key epoch.
- `Bundle.identifier` is the sole business identifier for one immutable source-record revision event; Provenance uses a typed event-scoped node key because R4 Provenance has no business-identifier element.
- Every Bundle `fullUrl` is lowercase UUIDv5 over the length-framed selected Identifier `(system, value)` pair. UUIDv5 formats an internal link; it is not a privacy mechanism.
- Every emitted output carries matching typed `source-record` and `source-output` identifiers. Source-preservation documents additionally carry one typed `source-artifact` identifier.
- `Resource.id` is omitted unless the caller supplies a repository-assigned id.

## Provider measurements

The generated Grove Mobile catalog defines the measurements whose semantics are
shared by at least two evidenced sources; `sharedMobileMeasurementCatalog` exposes them
with their value kind, coded-result vocabulary, method, and member contracts.
Owner-exclusive measurements (HealthKit, Health Connect, and
connected-provider platform exclusives) are deliberately absent from the
shared catalog and are published separately as `adapterMeasurementCatalog`,
keyed by owning adapter, from the `providers` entry point.
This Provider facade exposes a closed provider/source-token/measurement union
for the shared scalar and coded measurements admitted by the frozen Google
Health API, Oura, and Withings inventories. It includes point and period
quantities, closed coded results such as workout classification, and composite
blood pressure. Shared profiles without a semantically exact provider source
remain profiled but are not constructible through this facade, and
owner-exclusive scalar mappings are exposed only through their exact owner profile and provider source row. BMI reuses the
standard R4 profile with a HealthKit adapter claim; the four specimen-specific
glucose profiles belong to Health Connect. Neither is incorrectly presented as
a shared Mobile profile. Google glucose without specimen evidence maps only to
the specimen-neutral shared profile, daily vital summaries are admitted only
as their distinct daily-average measurements, and provider stage-duration
summaries map to the per-stage sleep-duration measurements rather than
sleep-stage intervals. There is intentionally no unprofiled fallback builder.

```typescript
import {
  buildProviderMeasurementBundle,
  parseProviderMeasurementBundleInput,
  parseNormalizedProviderRecord,
  type ProviderMeasurementBundleInput,
} from '@schmiedmayerlab/grove-fhir/providers'
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

`parseProviderMeasurementBundleInput(unknown)` applies the same fail-closed behavior to the
complete graph input. `buildProviderMeasurementBundle` also runs that strict parser itself,
so JavaScript callers cannot bypass the boundary or add fields that would be
silently ignored. Identity strings are validated without trimming or otherwise
changing their HMAC preimage.

Every scalar `effectiveDateTime` and aggregate `effectivePeriod` endpoint is
canonicalized with the generated Mobile IG contract: exact offset-bearing
instants are rounded to the nearest millisecond with ties to even, including
across the Unix epoch, and serialized with the supplied numeric offset. The
source offset is never replaced or invented. `canonicalizeMobileEffectiveInstant`
exposes the same `Result`-typed primitive operation; Sensor and ECG
`SampledData` timing intentionally remains outside this policy.

The public producer is deliberately closed to the Provider adapter
profile. A future HealthKit, Health Connect, or other adapter must add its own
closed facade and profile claims; callers cannot inject an arbitrary adapter
canonical into this API.

The four provider-native series that the IG marks `mapped-standard` use the
separate closed `buildProviderRecordingBundle` facade:

```typescript
import {
  buildProviderRecordingBundle,
  encodeRecordingBytes,
  parseMediaType,
} from '@schmiedmayerlab/grove-fhir/providers'
```

The admitted source tokens are Google Health API `heart-rate`, Oura
`heartrate`, and Withings `activityIntraday` and `sleepIntraday`. The caller
passes an explicitly authorized and minimized encoding of bytes already in its
possession, or an immutable version-specific HTTP(S) URL with required size and
SHA-1/base64 integrity metadata. The builder emits a Sensor + Provider
`DocumentReference`, converter and data-origin application Devices, conversion
Provenance targeting the document, and the enclosing Mobile collection Bundle.
It never fetches the URL or parses provider-native content. Embedded attachment
size and hash are computed from the exact decoded bytes.

Every attachment declares exactly one payload format from the closed
`groveRecordingFormatRegistry` (for provider API responses, `provider-recording`),
and its `contentType` must match that registry entry; the format is emitted as
the `DocumentReference.content.format` coding. Every attachment also requires
exactly one of the two catalog-derived producer assertions:
`caller-authorized-opaque-payload` or `verified-sanitized-input`. An absent,
ambiguous, or unsupported format or assertion fails closed. The assertion is producer preflight only, is never emitted as
FHIR authorization or consent, and is separate from recording-hardware identity
authorization.

For an admitted HealthKit clinical-record document, the parser consumes the
HealthKit catalog's `clinicalRecordAdmission.fhirRepresentation` object. It
requires exactly one extension at the published URL, exactly the published
FHIR value element, and the fixed admitted release. Missing, duplicate, DSTU2,
unknown, or differently shaped release metadata fails closed; Grove preserves
the provider-issued R4 payload bytes without asserting issuer conformance.

`sourceNativeId` remains HMAC-input-only by default for raw recordings too.
An application that deliberately needs round-trip traceability may opt in with
`nativeIdentifierDisclosure`; its absolute `system` must name the governed
repository/account/store key space and its `nativeId` must exactly equal
`source.sourceNativeId`. The builder then adds that Identifier only to the sole
primary `DocumentReference`. It never copies it to the companion artifact,
Devices, Provenance, entry keys, titles, URLs, or payload metadata. Opaque
attachment bytes are not inspected or sanitized by Grove; neither an HMAC nor
an Attachment hash grants authorization to disclose or retain them.

The high-level builder accepts a validated `ProviderMeasurementBundleInput` and returns a
`Result<GroveMobileExchangeBundle>`. The collection contains every output,
immutable converter and data-origin application snapshots, optional host and
recording-device snapshots, an optional distinct gateway application, and one
conversion Provenance. Every internal edge uses a derived `urn:uuid` Bundle
full URL. Each entry carries the selected complete Identifier pair from which
that URL was derived.

FHIR conversion does not make the converter a gateway. The gateway extension
is absent by default and appears only when `GatewayApplicationInput` carries the
explicit `mediated-or-routed-measurement` role assurance. The gateway may be the
converter in that additional role or a separately identified application.
Recording-device identity likewise declares either a deployment scope or an
explicitly authorized hardware scope. It requires a governed stable per-unit
token and emits both a stable `recording-device` identity and an event-scoped
`device-snapshot` identity; without that evidence the Device is omitted. Serial
numbers are not accepted by the producer API. Application and host snapshots
are separate Devices linked through `Device.parent`. A single snapshot can
fill multiple Provenance or gateway roles and is emitted only once.

The source record input contains a complete `providerScopeIdentifier`, an exact
catalog source token, and the provider-native id. Google Health API and Withings
require a deployment-scoped account pseudonym; Oura's authoritative globally
unique document ids use one documented global key-space pair rather than an
account coordinate. The native id and provider scope are HMAC inputs only unless
the caller uses the explicit native-Identifier disclosure above; the provider
scope is never emitted. A scalar record may disclose the native Identifier only when its
generated Provider source row designates one unique one-to-one Observation:

```typescript
import { parseAbsoluteUri } from '@schmiedmayerlab/grove-fhir'
import type { GovernedSourceIdentifierInput } from '@schmiedmayerlab/grove-fhir/providers'

const nativeIdentifierDisclosure: GovernedSourceIdentifierInput = {
  system: unwrap(
    parseAbsoluteUri(
      'https://example.org/repositories/withings-account-7/heart-rate-records',
    ),
  ),
  nativeId: 'withings-heart-rate-2026-08-20', // exactly source.sourceNativeId
  type: { text: 'Withings account-scoped heart-rate id' },
}
```

Provider disclosure is admitted only when the generated source row has one
unique supported measurement and the event contains that sole Observation.
Grouped rows such as Oura `daily_activity` have no unambiguous primary and must
omit it. The system cannot be a Grove graph-role, event, entry, or opaque identity
namespace, and `Identifier.type` cannot use the Grove identifier-role code
system. Omission remains conformant. The output role and discriminator are
selected by the generated catalog—callers cannot provide arbitrary text.
Scalar outputs use their exact catalog output role with discriminator `single`;
native provider recordings use role `native-recording` with discriminator
`single`. The positive decimal
event sequence changes the event and its Device snapshots without changing
logical source or output identity. The builder never generates keys, times,
event sequences, or repository ids.

An optional `writerRecord` always carries its separately derived
`writer-record` Identifier. Its canonical non-negative `version` remains
optional because some sources expose a stable writer record without a revision;
when absent, Grove emits no writer-version extension and makes no supersession
ordering claim. A writer-version extension is therefore never emitted without
the identity it qualifies.

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
under `.grove-fhir`. `catalog/measurement-capabilities.json` distinguishes the
constructible Provider scalar/coded measurements and native-recording sources
from shared profiles not admitted by this facade, adapter-profiled outputs,
platform-exclusive measurements, and reviewed future or out-of-scope candidates.

## Retractions

A source removal is a new append-only Provenance event, never a mutation of the
previous clinical resource:

```typescript
import {
  buildProviderRetractionBundle,
  parseProviderRetractionInput,
} from '@schmiedmayerlab/grove-fhir/providers'
```

`buildProviderRetractionBundle` accepts only logical targets the Provider facade can itself emit: primary Observations, native-recording documents, and Device snapshots.
Each target has a closed role and a typed Identifier; it never carries a literal
reference or a copied prior resource. Primary and source-artifact targets use
the exact prior Provider `provider-output` identity (carried with the FHIR
`source-output` role). A recording document additionally retains its distinct
`provider-artifact` identity with the `source-artifact` role, while the selected
entry and retraction key remain the Provider output identity. Device retirement
targets use the prior event's `device-snapshot` identity. The resulting Bundle
contains one retraction Provenance plus its immutable assembler application and
optional host snapshots. It never emits `entered-in-error`, a FHIR DELETE, or a
receiver retention instruction.

Receivers resolve complete Identifier pairs and apply their own idempotent,
atomic lifecycle policy. `parseProviderRetractionInput(unknown)` is the strict
JavaScript boundary and rejects unknown fields, unsupported target/type pairs,
malformed key material, and a device target that names the retraction event
itself.

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
  groveExchangeProtocol,
  groveMobilePackageMetadata,
  sharedMobileMeasurementCatalog,
  type MobileMeasurement,
} from '@schmiedmayerlab/grove-fhir/mobile'
```

Use the Provider entry point for the closed Google Health API, Oura,
and Withings mapping and graph builders:

```typescript
import {
  buildProviderMeasurementBundle,
  buildProviderRecordingBundle,
  buildProviderRetractionBundle,
  groveProviderPackageMetadata,
} from '@schmiedmayerlab/grove-fhir/providers'
```

Each generated package-metadata value is bounded to that entry point's
applicable IG package and includes its exact package id, canonical, dependency
list, FHIR release, and IG contract version. The root exposes only the shared
`groveFhirVersion` and `groveFhirContractVersion`; it does not expose the full
internal adapter package graph.

There is no generic Sensor producer entry point in this release. The admitted
raw-recording facade owns exact Sensor + Provider profile claims and
provider identity, so presenting it as source-neutral would weaken the closed
adapter contract. A future Sensor producer must expose its own evidenced,
profile-closed facade.

Use the R4 entry point for the bounded resource schemas and types:

```typescript
import {
  parseGroveMobileExchangeBundle,
  parseGroveMobileRetractionBundle,
  parseR4CollectionBundle,
  type GroveMobileExchangeBundle,
} from '@schmiedmayerlab/grove-fhir/r4'
```

`parseR4CollectionBundle` checks a bounded base-R4 collection Bundle and makes
no Grove profile claim. `parseGroveMobileExchangeBundle` and
`parseGroveMobileRetractionBundle` additionally enforce event identity,
entry-key selection and digest, deterministic UUIDv5 full URLs, reference
closure, output identities, exact Provenance coverage, event times, and the
active-versus-retraction graph shape. Active events admit only the catalog's
closed output/support/lifecycle resource set, prohibit contained resources,
require exact direct profile modes for outputs, Device,
QuestionnaireResponse, and Provenance, and reject disconnected supporting
nodes. Health Connect `DataOrigin.packageName` remains an identifier-only
logical Device agent on Provenance; it is never synthesized as an unprofiled
Bundle Device. The deliberately explicit parser names prevent callers from
mistaking base-R4 parsing for Grove profile validation.

For a shared producer-rule failure, `Issue.code` is the exact normative rule
identifier and `Issue.reason` plus `Issue.location` reproduce the stable
corpus diagnostic. `Issue.path` remains the parser-facing array path useful for
programmatic input handling; non-protocol schema failures continue to use
`schema-invalid` without inventing a Grove rule.

Parsing never returns a partially accepted resource:

```typescript
const result = parseObservation(input)

if (!result.ok) {
  for (const issue of result.issues) {
    console.error(issue.path, issue.code, issue.message)
  }
}
```

### Reading values back out

FHIR states time as a string and a measurement as a `Quantity`, neither of which a consumer can compute with directly.
Two accessors convert them, and both return a `Result` so a malformed value is reported rather than silently becoming `Invalid Date` or `NaN`:

```typescript
import {
  fhirDateTimeToDate,
  fhirQuantityToValue,
} from '@schmiedmayerlab/grove-fhir'

const recorded = fhirDateTimeToDate(observation.effectiveDateTime)
const measured = fhirQuantityToValue(observation.valueQuantity)
```

`fhirDateTimeToDate` accepts a `date`, `dateTime`, or `instant`; a value stated to lower precision resolves to the start of the period it names, in UTC, because a FHIR `date` carries no offset to resolve it against.
`fhirQuantityToValue` returns the number with the unit's code where the Quantity states one — only the code is comparable, `unit` alone being a label the source chose — along with the code's system and any comparator, since dropping a comparator would report a bound as a measurement.

### Extracting values

FHIR states a name across five fields, a code across three, and a period as two strings.
Accessors read each as the JavaScript value a consumer works with, and take `unknown` so they can be
applied to a resource before it has been narrowed.

```typescript
import {
  codeableConceptDisplay,
  observationEffectiveDate,
  observationNumericValue,
  patientAgeInYears,
  periodIsActive,
} from '@schmiedmayerlab/grove-fhir'

const when = observationEffectiveDate(observation)
const value = observationNumericValue(observation)
const label = codeableConceptDisplay(observation.code)
```

Absence and malformation are both reported as `undefined` rather than as a substitute value.
`codeableConceptDisplay` returns nothing rather than the bare code, which reads as a label but is not
one; `containsCoding` requires a system as well as a code, because matching a code across systems is how
two unrelated terminologies get conflated; and an absent `Period` counts as active but overlaps nothing,
which is how FHIR reads a missing period in each case.

Dates are computed in UTC throughout.
A FHIR `date` names a calendar day with no offset, so comparing it against the host's local calendar
moves the day for anyone west of UTC — which is a wrong age for one day each year.

### Validating another release

The root entry point validates R4, which is the release every Grove guide targets.
Consumers working in R4B import the same shapes from the R4B entry point; both are produced by one generator from their own release's definitions, so neither is a hand-maintained copy of the other.

```typescript
import { observationSchema } from '@schmiedmayerlab/grove-fhir/zod/r4'
import { observationSchema as r4bObservationSchema } from '@schmiedmayerlab/grove-fhir/zod/r4b'
```

Use these when you need a schema the root entry point does not narrow, or when you are validating a release other than R4.
Prefer `parseObservation` and its siblings for R4: they return a `Result` with typed issues instead of throwing.

## R4 boundary

The runtime schemas are generated from a FHIR release's own `StructureDefinition` resources, not written by hand.
Cardinality, choice types, offline-enumerable required bindings, and primitive
patterns come from the published definitions, so these structural rules do not
depend on hand-maintained copies.

Each schema exposes the release's TypeScript type corrected by the package's
`FhirJson<T>` wire representation. Recursive Zod schemas require internal type
assertions, so generator parity tests and runtime fixtures—not those assertions
alone—guard the emitted property surface.
Primitive metadata such as `_effectiveDateTime` is preserved, and a property the release does not define is rejected rather than silently dropped: FHIR JSON is a closed format, so an unmodelled property is an error and not an extension.
Repeated primitive arrays admit legal `null` value slots for extension-only
elements and require their parallel `_field` metadata arrays to remain aligned.
Required singular and repeated primitives may likewise be represented by their
`_field` metadata alone, while omitting both value and metadata still fails.
Primitive-only choice extensions count as the corresponding `value[x]`
alternative, and empty emitted string primitives are rejected.

These schemas validate already-materialized JavaScript values. JavaScript
`number` cannot retain a FHIR decimal's original lexical scale or arbitrary
precision after ordinary `JSON.parse`, so this package does not promise
lossless decimal wire round-tripping. Preserve/tokenize wire JSON with a
lossless decimal representation when lexical precision matters, and use the
official validator at that boundary. Grove builders emit only finite numeric
values inside JavaScript's supported producer scope.

A slot that may hold _any_ resource — `contained`, `Bundle.entry.resource`, and `Bundle.entry.response.outcome` — discriminates on `resourceType` and validates the resource against the schema for that type.
A malformed Observation nested in a bundle entry is rejected exactly where a standalone one would be, and the reported path names the element at fault rather than the entry that carries it.
Every resource the release publishes is modelled — 146 in R4 and 141 in R4B — so a resource arriving contained, bundled, or referenced is checked field by field rather than waved through.
The seed comes from the release's own StructureDefinitions, so a resource cannot be missing because nobody remembered to add it. A `resourceType` outside the pinned release is nonconformant and fails closed.

Seven FHIR invariants are enforced structurally — `ele-1`, `ext-1`, `per-1`,
`obs-3`, `obs-6`, `ref-1`, and `qty-3` — along with cardinality,
required-array minimums, and the rule that a choice element carries exactly one
alternative when required and at most one otherwise.
Every other invariant the release states is listed in the generated `UNCHECKED_CONSTRAINTS` map, keyed by the path it governs, so the boundary is inspectable rather than implied.
`STRUCTURAL_SCHEMA_SOURCE` publishes the exact package id, package/FHIR version,
archive SHA-512, and generated structure count behind each R4 or R4B surface.
Passing a runtime schema is therefore an application preflight, not a declaration of profile conformance.

Normative conformance is established by validating generated fixtures with the official HL7 FHIR Validator and the pinned Grove implementation-guide packages.
Synchronized IG catalogs and the Mobile semantic corpus retain the exact upstream bytes; local generated TypeScript is derived from those immutable inputs.

### Regenerating

```sh
npm run generate:zod   # rewrite the generated schemas for both releases
npm run check:zod      # fail if either is stale
```

`check:zod` runs as part of `typecheck`, so a stale schema fails the build the same way a stale catalog does.

## Development conformance

`npm run check:fixtures` regenerates the committed conformance corpus from the
public API and fails if any resource has drifted. With a local Grove FHIR
checkout, the fast fail-closed checks run as follows:

```sh
npm run conformance:structural -- --ig /path/to/grove-fhir
```

`npm run conformance` additionally requires the checksum-pinned official FHIR
Validator and the Mobile, Sensor, Provider, Questionnaire, Google Health,
Oura, and Withings packages built in that checkout. It validates the generated Mobile measurement
graphs, every admitted native-recording graph, the shared active/retraction
exchange corpus, and the Questionnaire/Response pair. Every admitted scalar fixture is generated from
the IG's versioned Mobile semantic corpus and bound through an exact RFC 6901
resource pointer, so the generic producer kit compares the emitted profile,
clinical code, effective time, and result projection—not only the resource
shape.

These committed demonstration fixtures deliberately use `example.org`
deployment systems. The official-validator runner enables the root validator's
explicit example-URL fixture mode for this lane only; it does not change the
runtime parsers or admit example systems in production data.

`grove-fhir.json` pins the exact immutable IG commit and the SHA-256 of the
corresponding GitHub archive consumed by generation. Fetching verifies that
archive before extraction and binds both values in its cache marker;
catalog, corpus, generated TypeScript, or emitted-resource drift fails CI.
For any future contract update, refresh both the immutable commit and archive
digest, regenerate from a clean checkout, and run unit, package, browser,
structural, and official validator checks. The validator steps use failure-independent conditions so a
browser failure cannot suppress their evidence.

## License

This project is licensed under the MIT License.
See [Licenses](https://github.com/SchmiedmayerLab/grove-ts/tree/main/LICENSES) for more information.

## Contributors

This package is developed by the Schmiedmayer Lab at Stanford University.
See [CONTRIBUTORS.md](../../CONTRIBUTORS.md).
