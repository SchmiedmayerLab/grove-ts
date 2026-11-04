//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type Bundle, type Patient } from 'fhir/r4b.js'
import {
  extensionSchema,
  FhirBundle,
  FhirPatient,
  patientSchema,
} from '../../src/index.js'

const patientNumberType = {
  // eslint-disable-next-line sonarjs/no-clear-text-protocols -- FHIR code system identifier, not a transport URL.
  system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
  code: 'PN',
}

const complexExtension = {
  url: 'http://example.org/fhir/StructureDefinition/complex',
  extension: [
    { url: 'code', valueString: 'a' },
    { url: 'text', valueString: 'b' },
  ],
}

const patient = (pn: string, extra: Partial<Patient> = {}): Patient => ({
  resourceType: 'Patient',
  identifier: [
    {
      type: { coding: [{ ...patientNumberType, code: 'MR' }] },
      value: `MR-${pn}`,
    },
    {
      type: { coding: [patientNumberType] },
      value: pn,
    },
  ],
  ...extra,
})

describe('Extension', () => {
  it('should accept relative sub-extension urls of complex extensions', () => {
    expect(extensionSchema.parse(complexExtension)).toEqual(complexExtension)
  })

  it('should accept relative uri values', () => {
    const extension = { url: 'local', valueUri: 'Patient/123' }
    expect(extensionSchema.parse(extension)).toEqual(extension)
  })

  it('should still require a url', () => {
    expect(() => extensionSchema.parse({ valueString: 'a' })).toThrow()
  })

  it('should parse bundles of patients carrying complex extensions', () => {
    const bundle: Bundle<Patient> = {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        { resource: patient('PN1', { extension: [complexExtension] }) },
        { resource: patient('PN2') },
      ],
    }

    const fhirBundle = FhirBundle.parse(bundle, patientSchema)
    const patientNumbers = (fhirBundle.value.entry ?? []).flatMap((entry) =>
      entry.resource ?
        [FhirPatient.parse(entry.resource).identifierByType(patientNumberType)]
      : [],
    )

    expect(patientNumbers).toEqual(['PN1', 'PN2'])
  })
})
