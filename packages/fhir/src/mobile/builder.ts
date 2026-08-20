//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { deriveEntryFullUrl } from './identity.js'
import {
  groveFhirProfileCanonicals,
  implementedMeasurementCatalog,
} from './measurement-catalog.generated.js'
import { EXTENSIONS, PROFILES, SYSTEMS } from './profiles.js'
import type {
  ApplicationDeviceInput,
  CompleteIdentifierInput,
  EntryIdentityInput,
  GlucoseMeasurement,
  IdentifiedEntryIdentityInput,
  MobileBundleInput,
  MobileMeasurement,
  RecordingDeviceInput,
} from './types.js'
import {
  issues,
  parseAbsoluteUri,
  parseFhirId,
  parseFhirInstant,
  parsePatientReference,
  parseUrnUuid,
  type Issue,
  type Result,
} from '../core/index.js'
import { parseCollectionBundle, type CollectionBundle } from '../r4/index.js'

const VITAL_SIGNS = new Set([
  'blood-pressure',
  'body-height',
  'body-mass-index',
  'body-temperature',
  'body-weight',
  'heart-rate',
  'oxygen-saturation',
  'respiratory-rate',
])

const ACTIVITY = new Set([
  'active-energy',
  'distance',
  'sleep-duration',
  'sleep-stage',
  'step-count',
])

const GLUCOSE = new Set<MobileMeasurement['kind']>([
  'blood-glucose',
  'capillary-blood-glucose',
  'interstitial-glucose',
  'serum-plasma-glucose',
])

const isGlucoseMeasurement = (
  measurement: MobileMeasurement,
): measurement is GlucoseMeasurement => GLUCOSE.has(measurement.kind)

const resourceId = (identity: EntryIdentityInput): { readonly id?: string } =>
  identity.id === undefined ? {} : { id: identity.id }

const identifier = (input: CompleteIdentifierInput) => ({
  system: input.system,
  value: input.value,
})

const coding = (system: string, code: string, display?: string) => ({
  system,
  code,
  ...(display === undefined ? {} : { display }),
})

const concept = (system: string, code: string, display?: string) => ({
  coding: [coding(system, code, display)],
  ...(display === undefined ? {} : { text: display }),
})

const categoryFor = (kind: MobileMeasurement['kind']) => {
  if (VITAL_SIGNS.has(kind)) {
    return [concept(SYSTEMS.observationCategory, 'vital-signs', 'Vital Signs')]
  }
  if (ACTIVITY.has(kind)) {
    return [concept(SYSTEMS.observationCategory, 'activity', 'Activity')]
  }
  if (GLUCOSE.has(kind)) {
    return [concept(SYSTEMS.observationCategory, 'laboratory', 'Laboratory')]
  }
  return undefined
}

const profileFor = (
  kind: MobileMeasurement['kind'],
  connected: boolean,
): readonly string[] => {
  const definition = implementedMeasurementCatalog[kind]
  return [
    groveFhirProfileCanonicals[definition.profile],
    ...(connected ? [PROFILES.connectedHealthObservation] : []),
  ]
}

const effectiveFor = (measurement: MobileMeasurement) =>
  measurement.effective.kind === 'date-time' ?
    { effectiveDateTime: measurement.effective.value }
  : {
      effectivePeriod: {
        start: measurement.effective.start,
        end: measurement.effective.end,
      },
    }

const resultFor = (measurement: MobileMeasurement) => {
  if (measurement.kind === 'sleep-stage') {
    const definition = implementedMeasurementCatalog['sleep-stage']
    return {
      valueCodeableConcept: {
        coding: [
          coding(definition.resultCodeSystem, measurement.stage),
          ...(measurement.sourceStageCoding === undefined ?
            []
          : [
              coding(
                measurement.sourceStageCoding.system,
                measurement.sourceStageCoding.code,
                measurement.sourceStageCoding.display,
              ),
            ]),
        ],
      },
    }
  }
  if (measurement.kind === 'blood-pressure') {
    const definition = implementedMeasurementCatalog['blood-pressure']
    const systolic = definition.components[0]
    const diastolic = definition.components[1]
    return {
      component: [
        {
          code: concept(systolic.system, systolic.code),
          valueQuantity: {
            value: measurement.systolic,
            system: systolic.quantity.system,
            code: systolic.quantity.code,
          },
        },
        {
          code: concept(diastolic.system, diastolic.code),
          valueQuantity: {
            value: measurement.diastolic,
            system: diastolic.quantity.system,
            code: diastolic.quantity.code,
          },
        },
      ],
    }
  }

  const definition = implementedMeasurementCatalog[measurement.kind]

  return {
    valueQuantity: {
      value: measurement.value,
      system: definition.quantity.system,
      code: definition.quantity.code,
    },
  }
}

const makeApplicationDevice = (input: ApplicationDeviceInput) => ({
  resourceType: 'Device' as const,
  ...resourceId(input.identity),
  meta: { profile: [PROFILES.applicationDevice] },
  identifier: [identifier(input.identity.identifier)],
  status: 'active' as const,
  ...(input.manufacturer === undefined ?
    {}
  : { manufacturer: input.manufacturer }),
  deviceName: [{ name: input.name, type: 'user-friendly-name' as const }],
  ...(input.version === undefined ?
    {}
  : {
      version: [
        {
          type: {
            coding: [
              coding(
                'urn:iso:std:iso:11073:10101',
                '531975',
                'Software revision',
              ),
            ],
          },
          value: input.version,
        },
      ],
    }),
})

const makeRecordingDevice = (input: RecordingDeviceInput) => ({
  resourceType: 'Device' as const,
  ...resourceId(input.identity),
  meta: { profile: [PROFILES.recordingDevice] },
  identifier: [identifier(input.identity.identifier)],
  status: 'active' as const,
  ...(input.name === undefined ?
    {}
  : {
      deviceName: [{ name: input.name, type: 'user-friendly-name' as const }],
    }),
  ...(input.manufacturer === undefined ?
    {}
  : { manufacturer: input.manufacturer }),
  ...(input.modelNumber === undefined ?
    {}
  : { modelNumber: input.modelNumber }),
  ...(input.serialNumber === undefined ?
    {}
  : { serialNumber: input.serialNumber }),
})

const specimenCodingFor = (measurement: GlucoseMeasurement) => {
  switch (measurement.kind) {
    case 'blood-glucose':
      return implementedMeasurementCatalog['blood-glucose'].specimen
    case 'capillary-blood-glucose':
      return implementedMeasurementCatalog['capillary-blood-glucose'].specimen
    case 'interstitial-glucose':
      return implementedMeasurementCatalog['interstitial-glucose'].specimen
    case 'serum-plasma-glucose': {
      const [plasma, serum] =
        implementedMeasurementCatalog['serum-plasma-glucose']
          .specimenAlternatives
      return measurement.specimen.specimenKind === 'plasma' ? plasma : serum
    }
  }
}

const makeSpecimen = (measurement: GlucoseMeasurement, subject: string) => {
  const definition = specimenCodingFor(measurement)
  return {
    resourceType: 'Specimen' as const,
    ...resourceId(measurement.specimen.identity),
    identifier: [identifier(measurement.specimen.identity.identifier)],
    type: concept(definition.system, definition.code, definition.display),
    subject: { reference: subject },
  }
}

const makeObservation = (input: MobileBundleInput) => {
  const connected = input.source.adapter.kind === 'connected-health'
  const definition = implementedMeasurementCatalog[input.measurement.kind]
  const category = categoryFor(input.measurement.kind)
  const extensions = [
    {
      url: EXTENSIONS.gatewayDevice,
      valueReference: { reference: input.application.identity.fullUrl },
    },
    ...(input.source.recordingMethod === undefined ?
      []
    : [
        {
          url: EXTENSIONS.recordingMethod,
          valueCode: input.source.recordingMethod,
        },
      ]),
    ...(input.researchStudyReferences ?? []).map((reference) => ({
      url: EXTENSIONS.researchStudy,
      valueReference: { reference },
    })),
  ]

  return {
    resourceType: 'Observation' as const,
    ...resourceId(input.observation),
    meta: { profile: profileFor(input.measurement.kind, connected) },
    extension: extensions,
    identifier: [
      identifier(input.observation.identifier),
      identifier(input.source.identifier),
    ],
    status: 'final' as const,
    ...(category === undefined ? {} : { category }),
    code: {
      coding: [
        coding(definition.code.system, definition.code.code),
        ...(input.source.sourceTypeCoding === undefined ?
          []
        : [
            coding(
              input.source.sourceTypeCoding.system,
              input.source.sourceTypeCoding.code,
              input.source.sourceTypeCoding.display,
            ),
          ]),
      ],
    },
    subject: { reference: input.subject },
    ...effectiveFor(input.measurement),
    issued: input.issued,
    ...resultFor(input.measurement),
    ...(isGlucoseMeasurement(input.measurement) ?
      {
        specimen: {
          reference: input.measurement.specimen.identity.fullUrl,
        },
      }
    : {}),
    ...(input.source.recordingDevice === undefined ?
      {}
    : { device: { reference: input.source.recordingDevice.identity.fullUrl } }),
  }
}

const makeProvenance = (input: MobileBundleInput) => {
  const connected = input.source.adapter.kind === 'connected-health'
  const entityAgent =
    input.source.dataOrigin === undefined ?
      undefined
    : [
        {
          type: concept(SYSTEMS.provenanceParticipant, 'enterer', 'Enterer'),
          who: { reference: input.source.dataOrigin.identity.fullUrl },
        },
      ]

  return {
    resourceType: 'Provenance' as const,
    ...resourceId(input.provenance),
    meta: {
      profile: [
        PROFILES.mobileConversionProvenance,
        ...(connected ? [PROFILES.connectedHealthConversionProvenance] : []),
      ],
    },
    target: [{ reference: input.observation.fullUrl }],
    recorded: input.recorded,
    activity: concept(
      SYSTEMS.isoLifecycle,
      'transform',
      'Transform/Translate Record Lifecycle Event',
    ),
    agent: [
      {
        type: concept(SYSTEMS.provenanceParticipant, 'assembler', 'Assembler'),
        who: { reference: input.application.identity.fullUrl },
      },
    ],
    entity: [
      {
        role: 'source' as const,
        what: {
          identifier: identifier(input.source.identifier),
          ...(input.source.display === undefined ?
            {}
          : { display: input.source.display }),
        },
        ...(entityAgent === undefined ? {} : { agent: entityAgent }),
      },
    ],
  }
}

const pathIssues = (
  result: Result<unknown>,
  prefix: ReadonlyArray<number | string>,
): readonly Issue[] =>
  result.ok ?
    []
  : result.issues.map((issue) => ({
      ...issue,
      path: [...prefix, ...issue.path],
    }))

const validateIdentifier = (
  input: CompleteIdentifierInput,
  path: ReadonlyArray<number | string>,
): readonly Issue[] => [
  ...pathIssues(parseAbsoluteUri(input.system), [...path, 'system']),
  ...(input.value.trim() === '' ?
    [
      {
        severity: 'error' as const,
        code: 'invalid-identifier' as const,
        path: [...path, 'value'],
        message: 'Identifier.value must not be empty.',
      },
    ]
  : []),
]

const validateSourceCoding = (
  input: { readonly system: string; readonly code: string },
  path: ReadonlyArray<number | string>,
): readonly Issue[] => [
  ...pathIssues(parseAbsoluteUri(input.system), [...path, 'system']),
  ...(input.code.trim() === '' ?
    [
      {
        severity: 'error' as const,
        code: 'invalid-code' as const,
        path: [...path, 'code'],
        message: 'Source coding code must not be empty.',
      },
    ]
  : []),
]

const validateIdentity = (
  input: EntryIdentityInput,
  path: ReadonlyArray<number | string>,
): readonly Issue[] => [
  ...pathIssues(parseUrnUuid(input.fullUrl), [...path, 'fullUrl']),
  ...(input.id === undefined ?
    []
  : pathIssues(parseFhirId(input.id), [...path, 'id'])),
]

const validateIdentifiedIdentity = (
  input: IdentifiedEntryIdentityInput,
  path: ReadonlyArray<number | string>,
): readonly Issue[] => {
  const failures = [
    ...validateIdentity(input, path),
    ...validateIdentifier(input.identifier, [...path, 'identifier']),
  ]
  const expected = deriveEntryFullUrl(input.identifier)
  if (!expected.ok) {
    failures.push(
      ...expected.issues.map((issue) => ({
        ...issue,
        path: [...path, 'identifier', ...issue.path],
      })),
    )
  } else if (expected.value !== input.fullUrl) {
    failures.push({
      severity: 'error',
      code: 'value-mismatch',
      path: [...path, 'fullUrl'],
      message:
        'Bundle entry fullUrl must be the IG-defined UUID-v5 derivation of its business identifier.',
    })
  }
  return failures
}

const numericValues = (measurement: MobileMeasurement): readonly number[] => {
  if (measurement.kind === 'blood-pressure') {
    return [measurement.systolic, measurement.diastolic]
  }
  if (measurement.kind === 'sleep-stage') return []
  return [measurement.value]
}

const valueIssues = (measurement: MobileMeasurement): readonly Issue[] => {
  const values = numericValues(measurement)
  const failures: Issue[] = []

  values.forEach((value, index) => {
    if (!Number.isFinite(value)) {
      failures.push({
        severity: 'error',
        code: 'invalid-type',
        path: ['measurement', index],
        message: 'Measurement values must be finite numbers.',
      })
    }
  })

  if (
    measurement.kind === 'oxygen-saturation' &&
    (measurement.value < 0 || measurement.value > 100)
  ) {
    failures.push({
      severity: 'error',
      code: 'out-of-range',
      path: ['measurement', 'value'],
      message: 'Oxygen saturation must be between 0 and 100 percent.',
    })
  }

  if (
    measurement.kind === 'step-count' &&
    !Number.isInteger(measurement.value)
  ) {
    failures.push({
      severity: 'error',
      code: 'invalid-type',
      path: ['measurement', 'value'],
      message: 'Step count must be an integer.',
    })
  }

  const permitsZero = new Set([
    'active-energy',
    'distance',
    'sleep-duration',
    'step-count',
  ])
  if (
    values.some((value) =>
      permitsZero.has(measurement.kind) ? value < 0 : value <= 0,
    )
  ) {
    failures.push({
      severity: 'error',
      code: 'out-of-range',
      path: ['measurement'],
      message:
        permitsZero.has(measurement.kind) ?
          'This measurement must not be negative.'
        : 'This measurement must be greater than zero.',
    })
  }

  return failures
}

const glucoseIssues = (measurement: MobileMeasurement): readonly Issue[] => {
  if (!isGlucoseMeasurement(measurement)) return []

  const failures = validateIdentifiedIdentity(measurement.specimen.identity, [
    'measurement',
    'specimen',
    'identity',
  ])
  if (
    measurement.kind === 'serum-plasma-glucose' &&
    !['plasma', 'serum'].includes(measurement.specimen.specimenKind)
  ) {
    return [
      ...failures,
      {
        severity: 'error',
        code: 'invalid-code',
        path: ['measurement', 'specimen', 'specimenKind'],
        message: 'Serum/plasma glucose specimenKind must be plasma or serum.',
      },
    ]
  }
  return failures
}

const effectiveIssues = (measurement: MobileMeasurement): readonly Issue[] => {
  const effective = measurement.effective
  if (effective.kind === 'date-time') {
    return pathIssues(parseFhirInstant(effective.value), [
      'measurement',
      'effective',
      'value',
    ])
  }

  const failures = [
    ...pathIssues(parseFhirInstant(effective.start), [
      'measurement',
      'effective',
      'start',
    ]),
    ...pathIssues(parseFhirInstant(effective.end), [
      'measurement',
      'effective',
      'end',
    ]),
  ]
  if (Date.parse(effective.start) >= Date.parse(effective.end)) {
    failures.push({
      severity: 'error',
      code: 'out-of-range',
      path: ['measurement', 'effective'],
      message: 'A measurement Period must end after it starts.',
    })
  }
  return failures
}

const sourceGraphIssues = (
  source: MobileBundleInput['source'],
): readonly Issue[] => {
  const failures: Issue[] = []
  if (source.recordingDevice !== undefined) {
    failures.push(
      ...validateIdentifiedIdentity(source.recordingDevice.identity, [
        'source',
        'recordingDevice',
        'identity',
      ]),
    )
  }
  if (source.dataOrigin !== undefined) {
    failures.push(
      ...validateIdentifiedIdentity(source.dataOrigin.identity, [
        'source',
        'dataOrigin',
        'identity',
      ]),
    )
  }
  if (
    source.adapter.kind === 'connected-health' &&
    source.dataOrigin === undefined
  ) {
    failures.push({
      severity: 'error',
      code: 'missing-required',
      path: ['source', 'dataOrigin'],
      message:
        'Connected-health conversion requires the source DataOrigin application.',
    })
  }
  return failures
}

const validateInput = (input: MobileBundleInput): readonly Issue[] => {
  const failures: Issue[] = [
    ...pathIssues(parsePatientReference(input.subject), ['subject']),
    ...pathIssues(parseFhirInstant(input.issued), ['issued']),
    ...pathIssues(parseFhirInstant(input.recorded), ['recorded']),
    ...validateIdentifier(input.bundle.identifier, ['bundle', 'identifier']),
    ...(input.bundle.id === undefined ?
      []
    : pathIssues(parseFhirId(input.bundle.id), ['bundle', 'id'])),
    ...validateIdentifiedIdentity(input.observation, ['observation']),
    ...validateIdentifiedIdentity(input.provenance, ['provenance']),
    ...validateIdentifiedIdentity(input.application.identity, [
      'application',
      'identity',
    ]),
    ...validateIdentifier(input.source.identifier, ['source', 'identifier']),
    ...(input.source.sourceTypeCoding === undefined ?
      []
    : validateSourceCoding(input.source.sourceTypeCoding, [
        'source',
        'sourceTypeCoding',
      ])),
    ...((
      input.measurement.kind !== 'sleep-stage' ||
      input.measurement.sourceStageCoding === undefined
    ) ?
      []
    : validateSourceCoding(input.measurement.sourceStageCoding, [
        'measurement',
        'sourceStageCoding',
      ])),
    ...valueIssues(input.measurement),
    ...glucoseIssues(input.measurement),
    ...effectiveIssues(input.measurement),
    ...sourceGraphIssues(input.source),
  ]

  if (input.application.name.trim() === '') {
    failures.push({
      severity: 'error',
      code: 'missing-required',
      path: ['application', 'name'],
      message: 'Application name must not be empty.',
    })
  }

  const fullUrls = [
    input.observation.fullUrl,
    input.provenance.fullUrl,
    input.application.identity.fullUrl,
    input.source.recordingDevice?.identity.fullUrl,
    input.source.dataOrigin?.identity.fullUrl,
    ...(isGlucoseMeasurement(input.measurement) ?
      [input.measurement.specimen.identity.fullUrl]
    : []),
  ].filter((value): value is NonNullable<typeof value> => value !== undefined)
  if (new Set(fullUrls).size !== fullUrls.length) {
    failures.push({
      severity: 'error',
      code: 'duplicate-identifier',
      path: [],
      message: 'Every Bundle entry requires a distinct fullUrl.',
    })
  }

  const observationIdentifiers = [
    input.observation.identifier,
    input.source.identifier,
  ]
  if (
    observationIdentifiers[0]?.system === observationIdentifiers[1]?.system &&
    observationIdentifiers[0]?.value === observationIdentifiers[1]?.value
  ) {
    failures.push({
      severity: 'error',
      code: 'duplicate-identifier',
      path: ['observation', 'identifier'],
      message:
        'Output and source identifiers must have distinct system/value pairs.',
    })
  }

  for (const [index, reference] of (
    input.researchStudyReferences ?? []
  ).entries()) {
    if (
      !/^ResearchStudy\/[A-Za-z0-9\-.]{1,64}$/u.test(reference) &&
      !reference.includes('/ResearchStudy/')
    ) {
      failures.push({
        severity: 'error',
        code: 'invalid-reference',
        path: ['researchStudyReferences', index],
        message:
          'Expected ResearchStudy/{id} or an absolute ResearchStudy reference.',
      })
    }
  }

  return failures
}

/**
 * Builds the deterministic, profile-stamped R4 resource graph for one admitted
 * mobile measurement. All identity and time values are caller-owned; malformed
 * or semantically inconsistent inputs return structured issues.
 */
export const buildMobileBundle = (
  input: MobileBundleInput,
): Result<CollectionBundle> => {
  const failures = validateInput(input)
  if (failures.length > 0) {
    return issues(failures)
  }

  const observation = makeObservation(input)
  const application = makeApplicationDevice(input.application)
  const recordingDeviceInput = input.source.recordingDevice
  const recordingDevice =
    recordingDeviceInput === undefined ? undefined : (
      makeRecordingDevice(recordingDeviceInput)
    )
  const dataOriginInput = input.source.dataOrigin
  const dataOrigin =
    dataOriginInput === undefined ? undefined : (
      makeApplicationDevice(dataOriginInput)
    )
  const provenance = makeProvenance(input)
  const specimen =
    isGlucoseMeasurement(input.measurement) ?
      makeSpecimen(input.measurement, input.subject)
    : undefined
  const identifiedEntry = (
    identity: IdentifiedEntryIdentityInput,
    resource:
      | typeof application
      | typeof observation
      | typeof provenance
      | NonNullable<typeof specimen>
      | NonNullable<typeof recordingDevice>,
  ) => ({
    fullUrl: identity.fullUrl,
    extension: [
      {
        url: EXTENSIONS.exchangeEntryIdentifier,
        valueIdentifier: identifier(identity.identifier),
      },
    ],
    resource,
  })
  const entry = [
    identifiedEntry(input.observation, observation),
    ...(specimen === undefined || !isGlucoseMeasurement(input.measurement) ?
      []
    : [identifiedEntry(input.measurement.specimen.identity, specimen)]),
    ...(recordingDevice === undefined || recordingDeviceInput === undefined ?
      []
    : [identifiedEntry(recordingDeviceInput.identity, recordingDevice)]),
    ...(dataOrigin === undefined || dataOriginInput === undefined ?
      []
    : [identifiedEntry(dataOriginInput.identity, dataOrigin)]),
    identifiedEntry(input.application.identity, application),
    identifiedEntry(input.provenance, provenance),
  ]

  return parseCollectionBundle({
    resourceType: 'Bundle',
    ...(input.bundle.id === undefined ? {} : { id: input.bundle.id }),
    meta: { profile: [PROFILES.mobileBundle] },
    identifier: identifier(input.bundle.identifier),
    type: 'collection',
    timestamp: input.recorded,
    total: entry.length,
    entry,
  })
}
