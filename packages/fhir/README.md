<!--

This source file is part of the Grove open-source project

SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)

SPDX-License-Identifier: MIT

-->

# Grove FHIR

[![Build and Test](https://github.com/SchmiedmayerLab/grove-ts/actions/workflows/build-and-test.yml/badge.svg)](https://github.com/SchmiedmayerLab/grove-ts/actions/workflows/build-and-test.yml)
[![codecov](https://codecov.io/gh/SchmiedmayerLab/grove-ts/graph/badge.svg)](https://codecov.io/gh/SchmiedmayerLab/grove-ts)

Type-safe FHIR R4B resource schemas and utilities for TypeScript applications, together with the Grove profiles layered over them.
This package provides comprehensive [Zod](https://zod.dev) schemas for FHIR (Fast Healthcare Interoperability Resources) data validation, making it easy to work with healthcare data in TypeScript applications, including those built on Firebase Functions and Firestore.

This package is part of the [Grove](https://github.com/SchmiedmayerLab/grove-ts) project, bringing standardized healthcare data exchange to TypeScript applications.

## Why Use This Package?

Working with FHIR resources in TypeScript can be challenging due to their complex, nested structures and strict validation requirements. This package solves that by providing:

- **Type Safety**: Leverage TypeScript's type system with automatically generated types from Zod schemas
- **Runtime Validation**: Validate FHIR resources at runtime to catch data issues early
- **Framework Agnostic**: Plain TypeScript/Zod schemas that work anywhere, including Firebase Functions and Firestore
- **Standards Compliance**: Schemas based on FHIR R4B specification
- **Developer Experience**: Intuitive API with helpful utility methods

## Two Layers

This package exposes two layers over the same data.

The **R4B base layer** is what the package has always been: Zod schemas covering the whole of FHIR R4B, permissive in the way the specification is permissive.
Unknown fields are stripped rather than rejected, and almost everything is optional, because R4B says almost everything is optional.
Reach for it when you are reading FHIR from somewhere you do not control, or working with resources Grove has no opinion about.

The **Grove profile layer** constrains those same shapes to what a Grove exchange actually admits.
Profiles are closed, so an unknown field is an error rather than something silently dropped; choice elements Grove does not use are absent; and fields Grove requires are required.
Reach for it when you are producing or ingesting Grove data, where a typo in a field name should stop you rather than vanish.

The profile schemas are _derived_ from the base schemas rather than written separately, so each field is declared in exactly one place.
What the profile layer adds is only the constraints, which is also what makes it readable as a statement of the profile.

### Choosing a name

No name means two things.
Where a profile needs a name the base layer already uses, the profile takes a `grove` prefix:

```typescript
import {
  observationSchema,
  groveObservationSchema,
} from '@schmiedmayerlab/grove-fhir'

observationSchema.parse(input) // permissive R4B: unknown fields are stripped
groveObservationSchema.parse(input) // Grove profile: unknown fields are rejected
```

### Entry points

The root entry point carries both layers.
The narrower ones exist for callers who want a single layer, and for the provider surface, which is deliberately not reachable from the root.

| Entry point                                 | Contents                                                                                                 |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `@schmiedmayerlab/grove-fhir`               | The R4B base layer, the profiles, the result channel, the mobile catalog, and the questionnaire builders |
| `@schmiedmayerlab/grove-fhir/core`          | `Result`, `Issue`, and the branded FHIR primitive parsers                                                |
| `@schmiedmayerlab/grove-fhir/r4`            | The profiles and their parsers, on their own                                                             |
| `@schmiedmayerlab/grove-fhir/mobile`        | The shared mobile measurement catalog and entry identity                                                 |
| `@schmiedmayerlab/grove-fhir/providers`     | Provider adapters, bundle builders, and recording payloads                                               |
| `@schmiedmayerlab/grove-fhir/questionnaire` | Questionnaire and response builders, parsers, and preflight                                              |
| `@schmiedmayerlab/grove-fhir/provenance`    | Provenance parsing                                                                                       |

Provider measurements are owned by a specific platform, so `buildProviderMeasurementBundle` and its neighbours are reachable only from `/providers`.
That boundary is asserted by tests rather than left to convention.

### Failures without exceptions

The profile layer reports failures as values.
`parseObservation` and its siblings return a `Result`, so a caller handles a malformed resource without a `try` block, and gets every issue at once rather than the first:

```typescript
import { parseObservation } from '@schmiedmayerlab/grove-fhir'

const result = parseObservation(input)
if (!result.ok) {
  for (const issue of result.issues) {
    console.error(`${issue.path.join('.')}: ${issue.message}`)
  }
  return
}
// result.value is deeply frozen and typed as an Observation
```

The base layer keeps Zod's own interface — `parse` throws, `safeParse` does not — exactly as before.

## Installation

```bash
npm install @schmiedmayerlab/grove-fhir
```

## Features

- **Comprehensive FHIR Resources**: Schemas for 40+ FHIR resources including Patient, Observation, Medication, Appointment, and more
- **FHIR Elements**: Support for all FHIR data types (CodeableConcept, Quantity, Reference, etc.)
- **Value Sets**: Pre-defined schemas for FHIR value sets and enumerations
- **Helper Methods**: Convenient utilities for working with coded concepts and extensions
- **Full Type Inference**: Get complete TypeScript autocompletion and type checking
- **Grove Profiles**: Closed schemas for the resources a Grove exchange carries, derived from the R4B schemas above so each field is declared once
- **Failures as Values**: A `Result` channel that collects every issue instead of throwing on the first
- **Measurement Catalogs**: The shared mobile measurements and the platform-exclusive provider adapters, generated from the pinned implementation guide

### Supported FHIR Resources

Patient, Practitioner, Observation, Medication, MedicationRequest, Appointment, AllergyIntolerance, Condition, Procedure, DiagnosticReport, Immunization, Questionnaire, QuestionnaireResponse, and many more. See the [full list](./src/index.ts).

## Quick Start

### Validating FHIR Resources

```typescript
import { FhirPatient } from '@schmiedmayerlab/grove-fhir'

// Parse and validate a patient resource
const rawData = {
  resourceType: 'Patient',
  id: 'patient-123',
  name: [
    {
      use: 'official',
      family: 'Smith',
      given: ['John', 'Michael'],
    },
  ],
  gender: 'male',
  birthDate: '1980-01-15',
}

// Validate the data and get a typed resource
const patient = FhirPatient.parse(rawData)
console.log(patient.value.name?.[0]?.family) // 'Smith'
```

### Working with Observations

```typescript
import { FhirObservation } from '@schmiedmayerlab/grove-fhir'

const observationData = {
  resourceType: 'Observation',
  status: 'final',
  code: {
    coding: [
      {
        system: 'http://loinc.org',
        code: '29463-7',
        display: 'Body Weight',
      },
    ],
  },
  subject: {
    reference: 'Patient/patient-123',
  },
  valueQuantity: {
    value: 72.5,
    unit: 'kg',
    system: 'http://unitsofmeasure.org',
    code: 'kg',
  },
}

const observation = FhirObservation.parse(observationData)
console.log(observation.value.valueQuantity?.value) // 72.5
```

### Using Helper Methods

```typescript
import { FhirCondition } from '@schmiedmayerlab/grove-fhir'

const condition = FhirCondition.parse({
  resourceType: 'Condition',
  code: {
    coding: [
      {
        system: 'http://snomed.info/sct',
        code: '73211009',
        display: 'Diabetes mellitus',
      },
    ],
  },
  // ... other fields
})

// Check if condition contains specific coding
const hasDiabetes = condition.containsCoding(condition.value.code, [
  {
    system: 'http://snomed.info/sct',
    code: '73211009',
  },
])

// Extract codes from CodeableConcept
const codes = condition.codes(condition.value.code, {
  system: 'http://snomed.info/sct',
})
console.log(codes) // ['73211009']
```

### Firebase Functions Integration

```typescript
import { onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { FhirPatient } from '@schmiedmayerlab/grove-fhir'

export const createPatient = onCall(async (request) => {
  const patientData = request.data

  // Validate the patient data
  const patient = FhirPatient.parse(patientData)

  // Store in Firestore
  const firestore = getFirestore()
  await firestore
    .collection('patients')
    .doc(patient.value.id)
    .set(patient.value)

  return { success: true, id: patient.value.id }
})
```

### Firestore Integration

```typescript
import { getFirestore } from 'firebase-admin/firestore'
import { FhirObservation } from '@schmiedmayerlab/grove-fhir'

const firestore = getFirestore()

// Read and validate from Firestore
const doc = await firestore.collection('observations').doc('obs-123').get()
const observation = FhirObservation.parse(doc.data())

// Write validated data to Firestore
const newObservation = FhirObservation.parse({/* ... */})
await firestore
  .collection('observations')
  .doc(newObservation.value.id)
  .set(newObservation.value)
```

## API Overview

### Resource Classes

All FHIR resources are exported as classes that extend `FhirDomainResource`:

```typescript
import {
  FhirPatient,
  FhirObservation,
  FhirMedicationRequest,
  FhirAppointment,
} from '@schmiedmayerlab/grove-fhir'

// Each resource has a parse method
const patient = FhirPatient.parse(rawData)

// Access the validated value
console.log(patient.value) // Typed FHIR Patient resource
```

### Helper Methods

The `FhirDomainResource` base class provides useful utilities:

- **`codes(concept, filter)`**: Extract code values from a CodeableConcept
- **`containsCoding(concept, filter)`**: Check if a CodeableConcept contains specific codings
- **`getExtension(url)`**: Retrieve extensions by URL

### Type Safety

All schemas provide full TypeScript type inference:

```typescript
import { type Patient } from 'fhir/r4b.js'

// The parsed value is fully typed
const patient = FhirPatient.parse(data)
const name: string | undefined = patient.value.name?.[0]?.family
```

## License

This project is licensed under the MIT License. See [Licenses](https://github.com/SchmiedmayerLab/grove-ts/tree/main/LICENSES) for more information.

## Contributors

This project is developed as part of the Schmiedmayer Lab at Stanford University.
See the repository's [CONTRIBUTORS.md](../../CONTRIBUTORS.md).
