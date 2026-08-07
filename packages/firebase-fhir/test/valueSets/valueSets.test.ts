//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { expectTypeOf } from 'expect-type'
import {
  type CapabilityStatement,
  type DataRequirement,
  type ExampleScenarioInstance,
  type ImplementationGuide,
  type TestScriptSetupActionOperation,
  type TimingRepeat,
} from 'fhir/r4b.js'
import { type z } from 'zod'
import {
  type CodeSearchSupport,
  codeSearchSupportSchema,
  eventTimingSchema,
  fhirDefinedTypeSchema,
  fhirLicenseSchema,
  fhirResourceTypeSchema,
  fhirTypeSchema,
  fhirVersionSchema,
} from '../../src/index.js'

describe('Value set exports', () => {
  it('exports terminology capability search support from the public entry point', () => {
    expect(codeSearchSupportSchema.options).toEqual(['explicit', 'all'])
    expectTypeOf<CodeSearchSupport>().toEqualTypeOf<'explicit' | 'all'>()
  })

  it('matches the required FHIR R4B bindings', () => {
    expectTypeOf<z.infer<typeof fhirResourceTypeSchema>>().toEqualTypeOf<
      ExampleScenarioInstance['resourceType']
    >()
    expectTypeOf<z.infer<typeof fhirTypeSchema>>().toEqualTypeOf<
      DataRequirement['type']
    >()
    expectTypeOf<z.infer<typeof fhirDefinedTypeSchema>>().toEqualTypeOf<
      NonNullable<TestScriptSetupActionOperation['resource']>
    >()
    expectTypeOf<z.infer<typeof fhirVersionSchema>>().toEqualTypeOf<
      CapabilityStatement['fhirVersion']
    >()
    expectTypeOf<z.infer<typeof fhirLicenseSchema>>().toEqualTypeOf<
      NonNullable<ImplementationGuide['license']>
    >()
    expectTypeOf<z.infer<typeof eventTimingSchema>>().toEqualTypeOf<
      NonNullable<TimingRepeat['when']>[number]
    >()
  })

  it('rejects values outside required FHIR R4B bindings', () => {
    expect(fhirResourceTypeSchema.safeParse('UnknownResource').success).toBe(
      false,
    )
    expect(fhirTypeSchema.safeParse('UnknownType').success).toBe(false)
    expect(fhirDefinedTypeSchema.safeParse('Type').success).toBe(false)
    expect(fhirVersionSchema.safeParse('9.9.9').success).toBe(false)
    expect(fhirLicenseSchema.safeParse('Unknown-License').success).toBe(false)
    expect(eventTimingSchema.safeParse('UNKNOWN').success).toBe(false)
  })
})
