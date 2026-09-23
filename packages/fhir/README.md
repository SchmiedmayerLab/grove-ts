<!--

This source file is part of the Grove open-source project

SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)

SPDX-License-Identifier: MIT

-->

# Grove FHIR for TypeScript

`@schmiedmayerlab/grove-fhir` turns a connected-provider record into a Grove exchange graph: one FHIR R4 4.0.1 Bundle a receiver can trust.
It fetches nothing, authenticates with no one and stores nothing; those stay in your application.

If you already know the pieces, jump to [Beyond the minimum](#beyond-the-minimum) or the [Reference](#reference).

## Why this exists

A source record, such as a Withings measure or an Oura daily summary, becomes one immutable, self-describing FHIR Bundle called the exchange graph.
FHIR is the standard for exchanging health data as JSON documents called resources, and a Bundle is the document that carries several of them together.
Any receiver can deduplicate, correct and retract that graph without knowing which platform it came from.
Grove adds what plain FHIR lacks: stable identities that never leak the provider's own record ids, provenance that says which application assembled the graph on which host, and optional study context.
The receiver gets a record it can store, match to a retry, replace with a later revision and retract, all through identifiers it can verify and none it can reverse.

If FHIR is new to you, the [New to FHIR](https://schmiedmayerlab.github.io/grove-fhir/fhir-basics.html) page of the Grove Mobile guide explains the resources this package emits in about ten minutes.

## What you need and why

Five inputs are yours to supply, in the order the graph is assembled.
Everything else has a default.

### The subject pseudonym

The subject is the participant, named by a pseudonym your deployment issued: an identifier system you own plus the pseudonym value, as a `Subject` of kind `logical`.
Every output says who the measurement is about, and a receiver matches records by that pair, so it must be stable and it must not be a name or a provider account.
It comes from your enrollment records.
Persist the system and the pseudonym with the participant; changing either makes later records look like another person.

### The identity scope

The identity scope is the material that mints every identifier: the twelve identifier systems derived from your deployment root, an HMAC key with its key id and epoch, and the id of this producer instance, validated once into an `OpaqueIdentityScope`.
HMAC is what makes an identifier both stable and opaque: the same source record exported twice yields the same identifier, so a receiver can deduplicate, and nobody without the key can recover the provider's id from it.
The root is a base URL your deployment owns, the key comes from your secret store, and the producer instance id is a UUID you generate once per installation.
Persist the key id, the epoch and the producer instance id beside the key; a rotation moves to a new epoch and therefore new systems, never a new key under an old epoch.

### The event identifier

The event identifier names one export: an immutable event with a monotonic sequence per producer instance, minted by `deriveEventIdentifier`.
A retry resends the same bytes under the same identifier, and a new revision of the record gets a new sequence, which is how a receiver tells a repeat from a change.
The sequence comes from your own storage, reserved in the same transaction that records the export.
Persist the last reserved sequence per producer instance.

### The repository scope

The repository scope is the store the record came from, as a `BusinessIdentifier`: the linked provider account under a system you own, again as a pseudonym.
A provider's record ids are unique only within one account, so two accounts can hold the same id; the scope keeps them apart inside every derived identity.
It comes from your provider-account records.
Persist the account pseudonym with the linked account.

### The application

The application is the software assembling the graph: a name, a version and a token for this build of the form `<application id>|<version>`, as an `ApplicationDevice`.
Provenance names the assembler, so a receiver knows which code produced a graph and can act on a defect in one version.
It is a constant of your build; nothing to persist beyond your release history.

> **Note:** `host` is required on TypeScript, unlike the Swift and Kotlin producers: a phone reads its own facts from the operating system, a server states them, so you pass its operating system version and a token of the form `<hardware facts>|<operating system version>`.
> The conversion instant defaults to the moment the builder runs; pass `conversionInstant` when you replay a stored export or when one batch must share one instant.
> `converterRole` defaults to the assembler, `studies` to none and `repositoryIds` to none.

## Assemble it

Once per installation: derive the identifier systems, validate the scope and describe the application.

```typescript
import {
  deriveOpaqueIdentitySystems,
  parseAbsoluteUri,
  parseIdentifierSystem,
  parseKeyEpoch,
  validateOpaqueIdentityScope,
  type ApplicationDevice,
  type Result,
} from '@schmiedmayerlab/grove-fhir'

// Every parser returns a Result; report the issues where a real application handles them.
const unwrap = <Value>(result: Result<Value>): Value => {
  if (!result.ok) {
    throw new Error(result.issues.map(({ message }) => message).join('\n'))
  }
  return result.value
}
const uri = (value: string) => unwrap(parseAbsoluteUri(value))
const identifierSystem = (value: string) => unwrap(parseIdentifierSystem(value))

// From your secret store: the HMAC key as base64url, and the UUID generated for this installation.
const identitySecret = process.env.GROVE_IDENTITY_SECRET_BASE64URL
const producerInstance = process.env.GROVE_PRODUCER_INSTANCE
if (identitySecret === undefined || producerInstance === undefined) {
  throw new Error('The identity key and the producer instance id are missing.')
}

const keyEpoch = unwrap(parseKeyEpoch('1'))
const identityScope = unwrap(
  validateOpaqueIdentityScope({
    systems: unwrap(
      deriveOpaqueIdentitySystems(
        uri('https://mystudy.example.org/fhir'),
        'study-key',
        keyEpoch,
      ),
    ),
    keyId: 'study-key',
    keyEpoch,
    secretBase64Url: identitySecret,
    producerInstance,
  }),
)

const application: ApplicationDevice = {
  sourceDeviceToken: 'org.example.mystudy-server|2.1.0',
  name: 'MyStudy server',
  version: '2.1.0',
}
```

Per export: reserve the next event sequence and create the context, using every default.

```typescript
import { machine, release, type } from 'node:os'
import {
  deriveEventIdentifier,
  parseEventSequence,
  type ExchangeEventContext,
} from '@schmiedmayerlab/grove-fhir'

// Reserve the sequence in the same transaction that records this export; it is never reused.
const sequence = unwrap(parseEventSequence(reserveNextEventSequence()))

const context: ExchangeEventContext = {
  subject: {
    kind: 'logical',
    identifier: {
      system: identifierSystem(
        'https://mystudy.example.org/fhir/identifiers/participants',
      ),
      value: participant.pseudonym,
    },
  },
  event: unwrap(deriveEventIdentifier(identityScope, sequence)),
  identityScope,
  repositoryScope: {
    system: identifierSystem(
      'https://mystudy.example.org/fhir/identifiers/withings-accounts',
    ),
    value: participant.withingsAccountPseudonym,
  },
  application,
  host: {
    sourceDeviceToken: `${machine()}|${type()} ${release()}`,
    operatingSystemVersion: `${type()} ${release()}`,
  },
}
```

Convert one record and hand the Bundle to your uploader.

```typescript
import { parseFhirInstant } from '@schmiedmayerlab/grove-fhir'
import {
  buildProviderExchangeGraph,
  type NormalizedProviderRecord,
} from '@schmiedmayerlab/grove-fhir/providers'

// One row of the Withings measure response, already fetched and decoded by your adapter.
const record: NormalizedProviderRecord = {
  source: {
    adapter: { kind: 'providers', provider: 'withings' },
    sourceType: 'getmeas:11',
    sourceNativeId: measure.grpid,
    writer: { sourceDeviceToken: 'withings-api', name: 'Withings API' },
  },
  measurements: [
    {
      kind: 'heart-rate',
      value: measure.value,
      effective: {
        kind: 'date-time',
        value: unwrap(parseFhirInstant(measure.date)),
      },
    },
  ],
}

const result = buildProviderExchangeGraph(record, context)
if (result.ok) {
  upload(result.value.graph)
} else {
  for (const issue of result.issues) {
    console.error(issue.code, issue.path.join('.'), issue.message)
  }
}
```

What to persist, and why:

| Value                                          | Why                                                                                          |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------- |
| The last event sequence, per producer instance | A reused sequence under different bytes is two events claiming one identity.                 |
| The key id and the epoch, beside the key       | They are part of every identifier system; the wrong pair mints identifiers nobody can match. |
| The producer instance id                       | It is inside every event identifier; a new one starts a new sequence space.                  |

> **Important:** Never reuse a sequence for different content.
> A retry is the same bytes under the same identifier; anything else is a new event with a new sequence.

> **Important:** Never change the key or the epoch without changing the systems.
> `deriveOpaqueIdentitySystems` derives the systems from the key id and the epoch, so a rotation is a new epoch with new systems, and the old epoch stays readable for the identifiers minted under it.

## Beyond the minimum

### Study enrollment

When you know the participant's enrollment, name the study, its exact protocol revision and the enrollment; the graph bundles them as ResearchStudy, PlanDefinition and ResearchSubject entries and references the study from every output.
A bundled subject adds your own Patient entry.
Reference: [The exchange event context](#the-exchange-event-context) and the guide's [Study context](https://schmiedmayerlab.github.io/grove-fhir/study.html).

```typescript
const enrolled: ExchangeEventContext = {
  ...context,
  subject: {
    kind: 'bundled',
    identifier: context.subject.identifier,
    patient: {
      resourceType: 'Patient',
      identifier: [context.subject.identifier],
    },
  },
  studies: [
    {
      study: {
        system: identifierSystem(
          'https://mystudy.example.org/fhir/identifiers/studies',
        ),
        value: 'heart-2026',
      },
      protocolUrl: uri(
        'https://mystudy.example.org/fhir/PlanDefinition/heart-2026',
      ),
      protocolVersion: '3',
      enrollment: {
        system: identifierSystem(
          'https://mystudy.example.org/fhir/identifiers/enrollments',
        ),
        value: 'enrollment-7f3a',
      },
    },
  ],
}
```

### Disclosure policies

By default the provider's record id is HMAC input only; nothing in the graph reveals it.
A deployment that needs round-trip traceability discloses it on the primary output under a key space it governs.
Reference: [Governed source identifiers](#governed-source-identifiers).

```typescript
const disclosed = buildProviderExchangeGraph(record, context, {
  nativeIdentifierDisclosure: {
    kind: 'authorized',
    system: identifierSystem(
      'https://mystudy.example.org/fhir/identifiers/withings-measure-groups',
    ),
    type: { text: 'Withings measure group id' },
  },
})
```

### Repository ids

A graph carries no `Resource.id` unless your repository has already assigned one to a node.
Reference: [The exchange event context](#the-exchange-event-context).

```typescript
import { parseFhirId } from '@schmiedmayerlab/grove-fhir'

const stored: ExchangeEventContext = {
  ...context,
  repositoryIds: {
    bundle: unwrap(parseFhirId('bundle-1042')),
    'primary-output': unwrap(parseFhirId('observation-1042')),
  },
}
```

### A distinct gateway application

When another application relayed the measurement, name it as the gateway; it appears as a second application snapshot referenced from every output.
Reference: [Devices and writers](#devices-and-writers).

```typescript
const relayed: ExchangeEventContext = {
  ...context,
  converterRole: {
    kind: 'gateway-application',
    application: {
      sourceDeviceToken: 'org.example.mystudy-app|4.2.0',
      name: 'MyStudy app',
      version: '4.2.0',
    },
  },
}
```

### Warnings

An accepted record can still lose something, and `warnings` says what, with a registered `mobile-omission.*` code: `recording-device` when the source names a device without a stable per-unit token, so no Device is emitted; `source-offset` when an instant came without a UTC offset, so it is serialized in UTC; `unmodeled-metadata` when the source carried fields outside the adapter's allowlist, so they were withheld.
A `source-offset` warning names the element that lost its offset in `location`: `Observation.effectiveDateTime`, `Observation.effectivePeriod.start` or `Observation.effectivePeriod.end`.
Log them with the event so a receiver's question has an answer.
Reference: [Diagnostics](#diagnostics).

```typescript
if (result.ok) {
  for (const warning of result.value.warnings) {
    console.warn(warning.code, warning.reason)
  }
}
```

### Batch conversion

Convert many records under one call; the callback reserves a fresh event for each one, and refusals sit beside conversions instead of aborting the batch.
Reference: [Provider measurements](#provider-measurements).

```typescript
import { buildProviderExchangeGraphs } from '@schmiedmayerlab/grove-fhir/providers'

const batch = buildProviderExchangeGraphs(records, () => ({
  ...context,
  event: unwrap(
    deriveEventIdentifier(
      identityScope,
      unwrap(parseEventSequence(reserveNextEventSequence())),
    ),
  ),
}))
for (const conversion of batch.conversions) upload(conversion.graph)
for (const failure of batch.failures) {
  console.error(
    failure.record.source.sourceNativeId,
    failure.issues.map(({ code }) => code),
  )
}
```

### Retries

A receiver decides whether a replay is the exact retry over JSON tokens, never bytes: member order, whitespace and escaping do not matter, decimal lexemes do.
Reference: [Replay and equality](#replay-and-equality).

```typescript
import { isSemanticallyEqual } from '@schmiedmayerlab/grove-fhir'

const sameEvent = unwrap(
  isSemanticallyEqual(storedGraphText, JSON.stringify(graph)),
)
```

### Retraction events

A source removal is a new event that names what it retracts by identity, never a mutation of the earlier graph.
`conversion` is the successful result of `buildProviderExchangeGraph`.
Reference: [Retractions](#retractions).

```typescript
import { retractionTargets } from '@schmiedmayerlab/grove-fhir'
import { buildProviderRetractionEvent } from '@schmiedmayerlab/grove-fhir/providers'

const retraction = buildProviderRetractionEvent(
  unwrap(retractionTargets(graph)),
  {
    ...context,
    event: unwrap(
      deriveEventIdentifier(
        identityScope,
        unwrap(parseEventSequence(reserveNextEventSequence())),
      ),
    ),
  },
  conversion.identifiers.sourceRecord,
  unwrap(parseFhirInstant('2026-09-01T08:00:00Z')),
)
```

### Writing back

Connected providers are read-only sources, so there is no reverse projection from FHIR to a provider record here.
Reference: [No reverse projection](#no-reverse-projection).

### The conformance lane

Prove your output against the guide's own corpus and the official validator before you ship.
Reference: [Development conformance](#development-conformance).

```sh
npm run conformance:structural -- --ig /path/to/grove-fhir
npm run conformance -- --ig /path/to/grove-fhir
```

## Glossary

The guide's vocabulary and the TypeScript type that carries it.

| Term in the guide                                 | Here                                                                                                                                         |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Exchange event                                    | `ExchangeEventIdentifier`, minted by `deriveEventIdentifier`                                                                                 |
| Exchange graph                                    | `ExchangeGraph`, built by `buildProviderExchangeGraph` and checked by `parseExchangeGraph`                                                   |
| Business identifier                               | `BusinessIdentifier`, whose `system` is an `IdentifierSystem`                                                                                |
| Identifier role                                   | `GroveIdentifierRole`, carried by a `RoledIdentifier`                                                                                        |
| Opaque identity                                   | minted by an `OpaqueIdentityScope` under `DeploymentIdentifierSystems`; a record's as a `SourceRecordIdentity` or `ProviderRecordIdentity`   |
| Entry-node key                                    | `EntryNodeKey`, rendered as an `EntryNodeIdentifier`                                                                                         |
| Subject                                           | `Subject`                                                                                                                                    |
| Study enrollment                                  | `StudyEnrollment`                                                                                                                            |
| Application device, host device, recording device | `ApplicationDevice`, `HostDevice`, `RecordingDevice`                                                                                         |
| Writer                                            | `Writer`, the source record's `writer`; `WriterRecord` when the platform assigns a record identity                                           |
| Retraction event and retraction target            | `RetractionEvent` and `RetractionTarget`, derived by `retractionTargets`                                                                     |
| Governed source identifier                        | `GovernedSourceIdentifierDisclosurePolicy`                                                                                                   |
| Producer diagnostic                               | `ProducerDiagnostic`, an `Issue` narrowed by `isProducerDiagnostic`; its `ProducerDiagnosticCode` is described by `groveProducerDiagnostics` |

## Reference

### Migrating from 0.1.x

This release replaces the entire hand-written 0.1.x surface.
Nothing is carried forward under its old name, and every published 0.1.x export is gone.

Import the generated, contract-derived replacements from the entry point that owns them: the root for validated primitives, the bounded R4 closure, and Questionnaire support; `/r4` for the resource schemas and graph parsers; `/mobile` for the shared measurement contract and deterministic identity; `/providers` for the closed connected-provider builders; `/questionnaire` for the instrument pair; and `/zod/r4` or `/zod/r4b` for the generated base-release schemas.
Coverage only grew: every resource type the 0.1.x line validated has a generated schema here, alongside the rest of R4 and R4B.

The 0.1.x line is superseded and should be deprecated on the registry once this release publishes:

```sh
npm deprecate '@schmiedmayerlab/grove-fhir@<0.2.0' \
  'Superseded by the generated Grove FHIR contracts; see the Migrating from 0.1.x section of the README.'
```

### Requirements

- Node.js 24 or newer
- npm 12 for repository development
- TypeScript 6 for repository development
- `zod` 4 as a peer dependency, installed by the consuming application

The published JavaScript uses portable ES2022 and Web Platform APIs.

### Design

- FHIR resources are immutable plain JSON values.
- Runtime schemas are strict and reject unknown properties instead of silently removing them.
- The supported R4 closure is intentionally bounded to the resources Grove constructs and validates.
- Expected input failures use a discriminated `Result<T>` with stable issue codes and paths; successful results may carry non-blocking warnings.
- Validated strings use branded types for instants, canonical URLs, identifier systems, FHIR ids, Patient references, `urn:uuid` full URLs, key epochs, event sequences, entry-node ordinals, and part indexes.
- `IdentifierSystem` and `AbsoluteUri` validate alike but are distinct brands: an identifier system names the key space of an `Identifier.value`, while an absolute URI is anything else, such as a deployment root, a code system, or a canonical url; a value crosses from one to the other only through its parser.
- The identity scope, event identifier, repository scope, device snapshots, conversion instant, and studies are caller-owned context; the source record is the adapter's normalized handoff.
- Source/output/artifact/writer/device identifiers use HMAC-SHA-256 over unsigned-32-bit length-framed UTF-8 fields with an explicit protocol domain, key id, and positive key epoch.
- `Bundle.identifier` is the sole business identifier for one immutable source-record revision event; Provenance uses a typed event-scoped node key because R4 Provenance has no business-identifier element.
- Every Bundle `fullUrl` is lowercase UUIDv5 over the length-framed selected Identifier `(system, value)` pair. UUIDv5 formats an internal link; it is not a privacy mechanism.
- Every emitted output carries matching typed `source-record` and `source-output` identifiers. Source-preservation documents additionally carry one typed `source-artifact` identifier.
- `Resource.id` is omitted unless the context supplies a repository-assigned id for that graph node.
- Every public concept is named after the Mobile guide's vocabulary: exchange graph, business identifier, identifier role, opaque identity, entry-node key, subject, study enrollment, application device, host device, recording device, writer, retraction event, retraction target, governed source identifier, and producer diagnostic.

### Deployment identity

`deriveOpaqueIdentitySystems(root, keyId, epoch)` takes the root as an `AbsoluteUri` and names all twelve deployment-owned `IdentifierSystem` values by the catalog's recommended form: `<root>/NamingSystem/grove-<identity-kind>-v0/<key-id>/<epoch>` for the ten opaque identity kinds, `<root>/NamingSystem/grove-event-v0` for events, and `<root>/NamingSystem/grove-entry-node-v0` for entry-node keys.
The normative test vectors are derived from `https://study.example.org/fhir`, so a deployment that adopts the form names its identities exactly as every other Grove producer does.
A deployment that already governs its own namespaces supplies them explicitly instead.

`validateOpaqueIdentityScope(input)` checks the systems, key id, epoch, secret, and producer instance once and returns an `OpaqueIdentityScope`.
The handle prints its systems, key id, epoch, and producer instance; the decoded key stays private to the module, and every minting function accepts only a handle it validated.
A rotated key uses a new epoch and therefore new systems, and a deployment retains old epochs while identifiers minted under them can still be replayed or retracted.

`deriveSourceRecordIdentity(scope, record)` derives the `SourceRecordIdentity` of one record from its `adapterId`, `sourceType`, `repositoryScope`, and `nativeRecordId`.
Its `identifier` is the typed `source-record` identifier, `output({ role, discriminator })` mints the `source-output` identifier of one output the record yields, and `artifact({ formatCode, partIndex })` mints the `source-artifact` identifier of one part of a recording it carries.
`deriveProviderRecordIdentity(scope, record)` on the providers entry point does the same for a connected provider's record, named by its catalog `providerCode` and `providerScope`, and returns a `ProviderRecordIdentity`.
Output and artifact identities extend their record's components, so they are minted only through it; the record identity keeps the scope and its coordinates private and serializes as its identifier alone.
`deriveOpaqueIdentifier(scope, kind, components)` mints the other kinds, `deriveEventIdentifier(scope, sequence)` and `deriveEntryNodeIdentifier(scope, key)` the event and entry-node identifiers, and `createEntryIdentity` and `deriveEntryFullUrl` derive the deterministic Bundle `fullUrl` for any complete identifier pair.

### The exchange event context

Every builder takes an `ExchangeEventContext` beside the source record.
It names the subject, the event identifier the scope minted for this event, the identity scope, the repository scope the source keys are unique in, the converter application and its host.
`host` stays required on TypeScript because a server supplies its own facts, where the Swift and Kotlin producers read them from the device.
`conversionInstant` defaults to the instant the builder runs, `converterRole` to the assembler, `studies` to none and `repositoryIds` to none; `parseExchangeEventContext(input)` is the strict boundary that applies them and returns a `ResolvedExchangeEventContext`, and the builders run it themselves.
`gateway` states that the converter itself mediated the measurement and `gateway-application` names a distinct application that did, emitted as a second application snapshot referenced by `observation-gatewayDevice`.
A bundled study context is held to `mobile-support.study-context` by `parseExchangeGraph`: one ResearchStudy whose `protocol` names its PlanDefinition, that PlanDefinition with `url` and `version`, and one ResearchSubject linking the graph's subject to the study, each keyed as an entry node with its study-context role.

The subject is logical by default: the identifier-only deployment pseudonym reference the guide admits, with no fabricated Patient entry.
A bundled subject adds the deployment's own Patient resource as an entry keyed by the `patient` node role, and every output references that entry.

A `StudyEnrollment` names one ResearchStudy by business identifier, the exact protocol revision by its PlanDefinition `protocolUrl` and `protocolVersion`, and one ResearchSubject enrollment identifier.
For each enrollment the graph bundles those three entries under the catalog's `research-study`, `plan-definition`, and `research-subject` node roles, references the study from every output through `workflow-researchStudy`, and references the protocol from `ResearchStudy.protocol`.
`workflow-instantiatesCanonical` is not an admitted extension and is never emitted.
A native recording document cannot carry the study extension, so a context that names studies is a fault for the recording builder rather than a silent omission.

Context faults are deployment configuration, never producer rules: they carry the package's schema codes, because no source record can cause them.

### Provider measurements

The generated Grove Mobile catalog defines the measurements whose semantics are shared by at least two evidenced sources; `sharedMobileMeasurementCatalog` exposes them with their value kind, coded-result vocabulary, method, and member contracts.
Owner-exclusive measurements (HealthKit, Health Connect, and connected-provider platform exclusives) are deliberately absent from the shared catalog and are published separately as `adapterMeasurementCatalog`, keyed by owning adapter, from the `providers` entry point.
This Provider facade exposes a closed provider/source-token/measurement union for the shared scalar and coded measurements admitted by the frozen Google Health API, Oura, and Withings inventories.
It includes point and period quantities, closed coded results such as workout classification, and composite blood pressure.
Shared profiles without a semantically exact provider source remain profiled but are not constructible through this facade, and owner-exclusive scalar mappings are exposed only through their exact owner profile and provider source row.
BMI reuses the standard R4 profile with a HealthKit adapter claim; the four specimen-specific glucose profiles belong to Health Connect.
Neither is incorrectly presented as a shared Mobile profile.
Google glucose without specimen evidence maps only to the specimen-neutral shared profile, daily vital summaries are admitted only as their distinct daily-average measurements, and provider stage-duration summaries map to the per-stage sleep-duration measurements rather than sleep-stage intervals.
There is intentionally no unprofiled fallback builder.

```typescript
import {
  buildProviderExchangeGraph,
  buildProviderExchangeGraphs,
  parseNormalizedProviderRecord,
  type NormalizedProviderRecord,
} from '@schmiedmayerlab/grove-fhir/providers'
```

`parseNormalizedProviderRecord(unknown)` is the strict boundary for one source record that an application has already mapped from Google Health API, Oura, or Withings.
Its `measurements` tuple is a non-empty, unique subset of the outputs present in that record and admitted for its exact provider/source token, and its `source` names the adapter, source type, native id, the application that entered the record at the provider (`writer`), and optionally the recording method, the recording device, and the writer record.
The builder emits all supplied outputs atomically with one Provenance that targets every resulting Observation; a malformed member refuses the entire record.
Catalog order makes serialization deterministic but carries no FHIR semantic meaning.
For example, one Oura `daily_activity` record may carry any present subset of step count, active energy, and distance; those outputs remain one auditable conversion event and share the source's complete midnight-to-midnight civil-day Period.
The same complete-day rule applies to Withings daily activity rows and permits offset changes across daylight-saving transitions.
The strict schema refuses unknown fields and raw provider responses.
This package contains no provider client, authentication, pagination, webhook, or fetching behavior.

`buildProviderExchangeGraph(record, context, options?)` runs that strict parser itself, so JavaScript callers cannot bypass the boundary or add fields that would be silently ignored.
Identity strings are validated without trimming or otherwise changing their HMAC preimage.
`buildProviderExchangeGraphs(records, context, options?)` converts several records, calling the context function once per record so each reservation of an event sequence stays the application's own decision, and returns a `ConversionBatch` whose `conversions` and `failures` sit side by side; an error the context function throws propagates, because a failed reservation is the caller's exception and never a refusal.

Provenance.occurred[x] spans the effective times of the record's outputs, Provenance.recorded and Bundle.timestamp are the conversion instant, and every scalar `effectiveDateTime` and aggregate `effectivePeriod` endpoint is canonicalized with the generated Mobile IG contract: exact offset-bearing instants are rounded to the nearest millisecond with ties to even, including across the Unix epoch, and serialized with the supplied numeric offset.
The source offset is never replaced or invented.
`canonicalizeMobileEffectiveInstant` exposes the same `Result`-typed primitive operation; Sensor and ECG `SampledData` timing intentionally remains outside this policy.

The public producer is deliberately closed to the Provider adapter profile.
A future HealthKit, Health Connect, or other adapter must add its own closed facade and profile claims; callers cannot inject an arbitrary adapter canonical into this API.

#### Native recordings

The four provider-native series that the IG marks `mapped-standard` use the separate closed `buildProviderRecordingGraph(source, attachment, context, options?)` facade:

```typescript
import {
  buildProviderRecordingGraph,
  encodeRecordingBytes,
  parseMediaType,
} from '@schmiedmayerlab/grove-fhir/providers'
```

The admitted source tokens are Google Health API `heart-rate`, Oura `heartrate`, and Withings `activityIntraday` and `sleepIntraday`.
The source names the span the recording covers as its `effective` time, and the caller passes an explicitly authorized and minimized encoding of bytes already in its possession, or an immutable version-specific HTTP(S) URL with required size and SHA-1/base64 integrity metadata.
The builder emits a Sensor + Provider `DocumentReference`, the converter application, its host and the writer as Device snapshots, conversion Provenance targeting the document, and the enclosing Mobile collection Bundle.
It never fetches the URL or parses provider-native content.
Embedded attachment size and hash are computed from the exact decoded bytes.

Every attachment declares exactly one payload format from the closed `groveRecordingFormatRegistry` (for provider API responses, `provider-recording`), and its `contentType` must match that registry entry; the format is emitted as the `DocumentReference.content.format` coding.
Every attachment also requires exactly one of the two catalog-derived producer assertions: `caller-authorized-opaque-payload` or `verified-sanitized-input`.
An absent, ambiguous, or unsupported format or assertion refuses the record.
The assertion is producer preflight only, is never emitted as FHIR authorization or consent, and is separate from recording-hardware identity authorization.

For an admitted HealthKit clinical-record document, the parser consumes the HealthKit catalog's `clinicalRecordAdmission.fhirRepresentation` object.
It requires exactly one extension at the published URL, exactly the published FHIR value element, and the fixed admitted release.
Missing, duplicate, DSTU2, unknown, or differently shaped release metadata fails closed; Grove preserves the provider-issued R4 payload bytes without asserting issuer conformance.

#### Governed source identifiers

`sourceNativeId` is HMAC input only by default, for measurements and recordings alike.
An application that deliberately needs round-trip traceability opts in through the conversion options, as the [disclosure fragment](#disclosure-policies) shows.

The policy defaults to `{ kind: 'omit' }` on every platform.
When authorized, the absolute `system` must name the governed repository/account/store key space and the builder adds the source-native id only to the designated primary output: the sole Observation of a source row that designates exactly one, or the sole recording `DocumentReference`.
It never copies it to the companion artifact, Devices, Provenance, entry keys, titles, URLs, or payload metadata.
Grouped rows such as Oura `daily_activity` have no unambiguous primary and must omit it.
The system cannot be a Grove graph-role, event, entry, or opaque identity namespace, and `Identifier.type` cannot use the Grove identifier-role code system.
Omission remains conformant.

#### Devices and writers

The converter application and its host always appear as separate Device snapshots linked through `Device.parent`.
The writer appears as its own application snapshot under the `writer` graph node; a provider reports no host for it and rarely its version, so a `Writer` has no host and an optional `version`, where an `ApplicationDevice` requires one.
A single snapshot can fill multiple Provenance or gateway roles and is emitted only once; two different devices supplying the same source device token are an identity collision and refuse the conversion.

Recording-device identity requires a governed stable per-unit token on the record's `recordingDevice` and emits both a stable `recording-device` identity, derived with the subject, and an event-scoped `device-snapshot` identity; without that evidence the record names no device.
Serial numbers are not accepted by the producer API.

An optional `writerRecord` always carries its separately derived `writer-record` Identifier.
Its canonical non-negative `version` remains optional because some sources expose a stable writer record without a revision; when absent, Grove emits no writer-version extension and makes no supersession ordering claim.

`createEntryIdentity(identifier, id?)` remains available for deriving the normative UUID-v5 full URL for caller-owned Device or Specimen business identifiers.
The builders perform that derivation automatically.

Provider source tokens are lineage and identity inputs; they are never appended to `Observation.code` as if they were clinically equivalent concepts.

The synchronized normative catalog and its resolved development reference live under `.grove-fhir`.
`catalog/measurement-capabilities.json` distinguishes the constructible Provider scalar/coded measurements and native-recording sources from shared profiles not admitted by this facade, adapter-profiled outputs, platform-exclusive measurements, and reviewed future or out-of-scope candidates.

### Diagnostics

Every `Issue` is either a schema issue or a producer diagnostic, reported through the one `Result` channel.
A schema issue is this package's own input contract: its `SchemaIssueCode` is an undotted code such as `invalid-uri`, and grove-fhir does not define it.
A producer diagnostic is a grove-fhir registry rule: its `ProducerDiagnosticCode` is registered in the exchange protocol, and `groveProducerDiagnostics` publishes each code with its normative `reason`, its `severity`, and the side that emits it.
`isProducerDiagnostic(issue)` narrows an `Issue` to a `ProducerDiagnostic`, whose registered `code` and `reason` are always present.
A refused source record carries exactly one `mobile-input.*` code per countable reason: an unsupported source type, an unsupported source value, a value outside its catalog domain, a malformed value shape, missing required metadata, an invalid effective period, text with an unpaired surrogate, an invalid native identifier, an oversized recording payload, or an empty recording series.
`Issue.reason` is the registry text and `Issue.message` the typed detail of that particular refusal.
A graph rule reported by `parseExchangeGraph` or `parseRetractionEvent` additionally carries the stable FHIR-facing `Issue.location` the shared corpus pins; a rule about a refused or trimmed record has no location, because no FHIR element exists yet, except a `source-offset` warning, which names the effective element that lost its offset.
A producer diagnostic's `location` is therefore present for a graph rule and absent for a refusal or an omission, the `source-offset` warning aside.
Deployment faults, such as an invalid identity scope, an event another producer minted, or a disclosure policy naming a Grove system, use the package's undotted schema codes, because no record can cause them.

`Result.warnings` and `ProviderConversion.warnings` carry the non-blocking findings of an accepted record under the registry's `mobile-omission.*` rows, each of severity `warning`; the graph stays valid, and an omission a disclosure policy chose is never reported.
The provider facade currently emits none, because its normalized input cannot describe a device without a token, an instant without an offset, or unmodeled metadata.

### Retractions

A source removal is a new append-only Provenance event, never a mutation of the previous clinical resource; the [retraction fragment](#retraction-events) shows the call.

`retractionTargets(graph)` derives every node of an accepted graph a retraction must name, typed by the catalog's closed target roles: `primary-output`, `child-output`, `source-artifact`, `specimen`, and `device-snapshot`, each with its admitted resource type and the exact opaque identity previously emitted.
An Observation another Observation lists in `hasMember` is a child output; every other output is primary.
A governed source identifier disclosed on the primary output travels along as the target's `nativeRecordIdentifier`, and an application may also supply the adapter's own record key there itself.
It is emitted verbatim as a target-carried native record Identifier, must use an absolute system outside every Grove namespace, and never carries a Grove identifier-role coding.

`buildProviderRetractionEvent(targets, context, sourceRecord, retractedAt)` accepts only targets and a source record the context's own scope minted.
Without the earlier conversion at hand, `deriveProviderRecordIdentity(scope, record).identifier` derives the same source record again from its coordinates.
Each target has a closed role and a typed Identifier; it never carries a literal reference or a copied prior resource.
`retractedAt` is the time the producer learned the source no longer exposes the record and becomes Provenance.occurred[x]; the conversion instant becomes its recorded time and the Bundle timestamp.
The resulting event contains one retraction Provenance plus its immutable assembler application and host snapshots.
It never emits `entered-in-error`, a FHIR DELETE, or a receiver retention instruction.
Receivers resolve complete Identifier pairs and apply their own idempotent, atomic lifecycle policy.

### Replay and equality

An exact retry reuses the event identifier, all three times, entry keys, and payload; a receiver decides whether a replay is that exact retry over lossless JSON tokens, never bytes.
`isSemanticallyEqual(left, right)` implements that comparison on serialized graphs, as text or UTF-8 bytes, without any dependency: member order, whitespace, and string escaping are irrelevant, decimal lexemes are compared as text, so `72.0` is different content from `72`, and malformed JSON is an issue rather than `false`.
The receiver-lifecycle corpus pins it: `reformatted-retry` equals `original` and `lexeme-retry` does not.

The [retry fragment](#retries) shows the comparison; parse a stored graph again with `parseExchangeGraph` before you act on it.

### No reverse projection

Connected providers are read-only sources with no native store to write back to, so this package has no reverse projection from FHIR to a provider record and no durable export or outbox.
The `extract/*` accessors on the root entry point are the read-back API for FHIR values, and the application owns storage, transport, retry, and receiver policy.

### Questionnaires

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
The Grove profiles fix both subjects to `Patient`, so `subjectTypes` is required and is exactly `['Patient']`, and a response requires one `Patient`-typed `subject`.
Both builders and both parsers enforce this, as does the exchange-graph validator for every mandatory governed subject.
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

One Grove Questionnaire element is deliberately deferred.
`grove-questionnaire-writer-context` is `0..1 MS` on the Grove QuestionnaireResponse profile and states the capturing application and host, but the Grove FHIR catalogs do not publish it, so this package cannot project its canonical or its sub-extension contract without hand-copying the implementation guide.
Until the catalog carries it, a writer context supplied through the builder's `extensions` pass-through reaches consumers with only generic FHIR extension shape checking, and neither the builder nor the parser validates its sub-extensions.

### Entry points

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

Use the Mobile entry point for source-neutral shared semantics, deployment identity, the exchange event context, and effective-time canonicalization; it never imports the provider catalog, so an identity-only consumer does not ship it:

```typescript
import {
  canonicalizeMobileEffectiveInstant,
  deriveOpaqueIdentitySystems,
  groveExchangeProtocol,
  groveProducerDiagnostics,
  parseExchangeEventContext,
  sharedMobileMeasurementCatalog,
  validateOpaqueIdentityScope,
  type ExchangeEventContext,
  type MobileMeasurement,
} from '@schmiedmayerlab/grove-fhir/mobile'
```

Use the Provider entry point for the closed Google Health API, Oura, and Withings mapping and graph builders:

```typescript
import {
  buildProviderExchangeGraph,
  buildProviderExchangeGraphs,
  buildProviderRecordingGraph,
  buildProviderRetractionEvent,
  groveProviderPackageMetadata,
} from '@schmiedmayerlab/grove-fhir/providers'
```

Each generated package-metadata value is bounded to that entry point's
applicable IG package and includes its exact package id, canonical, dependency
list, FHIR release, and package SemVer coordinate. The root exposes the shared
`groveFhirVersion` and the Mobile package coordinates; it does not expose the
full internal adapter package graph or a release-number compatibility gate.

There is no generic Sensor producer entry point. The admitted
raw-recording facade owns exact Sensor + Provider profile claims and
provider identity, so presenting it as source-neutral would weaken the closed
adapter contract. A future Sensor producer must expose its own evidenced,
profile-closed facade.

Use the R4 entry point for the bounded resource schemas and types:

```typescript
import {
  parseExchangeGraph,
  parseRetractionEvent,
  parseR4CollectionBundle,
  type ExchangeGraph,
  type RetractionEvent,
} from '@schmiedmayerlab/grove-fhir/r4'
```

`parseR4CollectionBundle` checks a bounded base-R4 collection Bundle and makes no Grove profile claim.
`parseExchangeGraph` and `parseRetractionEvent` additionally enforce event identity, entry-key selection and digest, deterministic UUIDv5 full URLs, reference closure, output identities, exact Provenance coverage, event times, the study-context entry roles, and the active-versus-retraction graph shape.
Active events admit only the catalog's closed output/support/lifecycle resource set, prohibit contained resources, require exact direct profile modes for outputs, Device, QuestionnaireResponse, and Provenance, and reject disconnected supporting nodes.
Health Connect `DataOrigin.packageName` remains an identifier-only logical Device agent on Provenance; it is never synthesized as an unprofiled Bundle Device.
The deliberately explicit parser names prevent callers from mistaking base-R4 parsing for Grove profile validation.

For a producer-rule failure, `Issue.code` is the exact registry identifier and `Issue.reason` plus `Issue.location` reproduce the stable corpus diagnostic; a graph rule is reported even when the base R4 schema would already reject the Bundle.
`Issue.path` remains the parser-facing array path useful for programmatic input handling; non-protocol schema failures continue to use `schema-invalid` without inventing a Grove rule.

Parsing never returns a partially accepted resource:

```typescript
import { parseObservation } from '@schmiedmayerlab/grove-fhir'

const parsed = parseObservation(input)

if (!parsed.ok) {
  for (const issue of parsed.issues) {
    console.error(issue.path, issue.code, issue.message)
  }
}
```

#### Reading values back out

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

#### Extracting values

FHIR states a name across five fields, a code across three, and a period as two strings.
Accessors read each as the JavaScript value a consumer works with, and take `unknown` so they can be
applied to a resource before it has been narrowed.

```typescript
import {
  codeableConceptDisplay,
  observationEffectiveDate,
  observationNumericValue,
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

#### Validating another release

The root entry point validates R4, which is the release every Grove guide targets.
Consumers working in R4B import the same shapes from the R4B entry point; both are produced by one generator from their own release's definitions, so neither is a hand-maintained copy of the other.

```typescript
import { observationSchema } from '@schmiedmayerlab/grove-fhir/zod/r4'
import { observationSchema as r4bObservationSchema } from '@schmiedmayerlab/grove-fhir/zod/r4b'
```

Use these when you need a schema the root entry point does not narrow, or when you are validating a release other than R4.
Prefer `parseObservation` and its siblings for R4: they return a `Result` with typed issues instead of throwing.

### R4 boundary

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

These schemas validate already-materialized JavaScript values.
JavaScript `number` cannot retain a FHIR decimal's original lexical scale or arbitrary precision after ordinary `JSON.parse`, so this package does not promise lossless decimal wire round-tripping through its parsers.
Where lexical precision decides an outcome, compare the serialized text with `isSemanticallyEqual`, which tokenizes it losslessly, and use the official validator at that boundary.
Grove builders emit only finite numeric values inside JavaScript's supported producer scope.

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

#### Regenerating

```sh
npm run generate:zod       # rewrite the generated schemas for both releases
npm run check:zod          # fail if either is stale
npm run generate:catalog   # reproject the Grove contracts a pin bump changed
npm run check:catalog      # fail if the projected contracts are stale
npm run generate:fixtures  # rebuild the conformance corpus from the public API
npm run check:fixtures     # fail if any emitted resource has drifted
npm run generate:surface   # snapshot the declared public surface from the built .d.ts files
npm run check:surface      # fail if a public type or signature changed without review
```

`check:zod` and `check:catalog` run as part of `typecheck`, and `check:surface` as part of `test:package`, so a stale schema, catalog, or surface fails the build the same way a stale fixture does.
The runtime export snapshot in `test/export-surface.json` and the declared surface snapshot in `test/type-surface.json` sit side by side; both are reviewed diffs, never regenerated silently.

### Development conformance

`npm run check:fixtures` regenerates the committed conformance corpus from the
public API and fails if any resource has drifted. With a local Grove FHIR
checkout, the fast fail-closed checks run as follows:

```sh
npm run conformance:structural -- --ig /path/to/grove-fhir
```

`npm run conformance` additionally requires the checksum-pinned official FHIR Validator and the Mobile, Sensor, Provider, Questionnaire, Google Health, Oura, and Withings packages built in that checkout.
It validates the generated Mobile measurement graphs, the study-context graph, every admitted native-recording graph, both retraction events, the shared active/retraction exchange corpus, and the Questionnaire/Response pair.
Every admitted scalar fixture is generated from the IG's versioned Mobile semantic corpus and bound through an exact RFC 6901 resource pointer, so the generic producer kit compares the emitted profile, clinical code, effective time, and result projection, not only the resource shape.
The unit tests bind the same contract from the committed fixtures: the protocol vectors and the derived identifier systems, every negative case of the mobile-exchange corpus with its exact code and location, every equality decision of the receiver-lifecycle sequences, the study-attribution events, and the registry's severities.

While a contract change is still unmerged upstream, `GROVE_FHIR_CHECKOUT=/path/to/grove-fhir npm run check:catalog` (or `node scripts/fetch-grove-fhir.mjs --local /path/to/grove-fhir`) vendors the consumed paths from that working tree instead of the pin; the validator then reports that the pin is not verified.
The pin moves to the final commit before the change ships.

These committed demonstration fixtures deliberately use `example.org`
deployment systems. The official-validator runner enables the root validator's
explicit example-URL fixture mode for this lane only; it does not change the
runtime parsers or admit example systems in production data.

`grove-fhir.json` pins the exact immutable IG commit and the SHA-256 of the
corresponding GitHub archive consumed by generation. Fetching verifies that
archive before extraction and binds both values in its cache marker;
catalog, corpus, generated TypeScript, or emitted-resource drift fails CI.
For any future contract update, refresh both the immutable commit and archive
digest, rerun every generator in [Regenerating](#regenerating) from a clean
checkout, and run unit, package, browser, structural, and official validator
checks. The validator steps use failure-independent conditions so a
browser failure cannot suppress their evidence.

## License

This project is licensed under the MIT License.
See [Licenses](https://github.com/SchmiedmayerLab/grove-ts/tree/main/LICENSES) for more information.

## Contributors

This package is developed by the Schmiedmayer Lab at Stanford University.
See [CONTRIBUTORS.md](../../CONTRIBUTORS.md).
