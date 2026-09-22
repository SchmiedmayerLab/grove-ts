//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { readFileSync } from 'node:fs'
import {
  context,
  heartRateMeasurement,
  record,
  resources,
  study,
  subject,
  unwrap,
} from './provider-test-support.js'
import { groveExchangeProtocol } from '../src/contract/measurement-catalog.generated.js'
import type { Subject } from '../src/mobile/index.js'
import {
  buildProviderExchangeGraph,
  buildProviderRecordingGraph,
  parseProviderRecordingSource,
} from '../src/providers/index.js'
import { parseExchangeGraph, type ExchangeGraph } from '../src/r4/index.js'

const bundled: Subject = {
  kind: 'bundled',
  identifier: subject.identifier,
  patient: {
    resourceType: 'Patient',
    identifier: [
      { system: subject.identifier.system, value: subject.identifier.value },
    ],
  },
}

const entryKeyOf = (
  graph: ExchangeGraph,
  resourceType: string,
  ordinal = 0,
): { readonly value: string; readonly fullUrl: string } => {
  const entries = graph.entry.filter(
    ({ resource }) => resource.resourceType === resourceType,
  )
  const entry = entries[ordinal]
  const value = entry?.extension?.[0]?.valueIdentifier?.value
  if (entry === undefined || value === undefined) {
    throw new Error(`No ${resourceType} entry at ordinal ${String(ordinal)}.`)
  }
  return { value, fullUrl: entry.fullUrl }
}

const corpusRoot = new URL(
  '../fixtures/conformance/study-attribution/',
  import.meta.url,
)
const corpus = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(name, corpusRoot), 'utf8'))

interface MutableGraph {
  entry: Array<{
    fullUrl: string
    extension?: Array<{ valueIdentifier?: { value: string } }>
    resource: Record<string, unknown> & { resourceType: string }
  }>
}

const mutableGraph = (): MutableGraph =>
  structuredClone(
    unwrap(
      buildProviderExchangeGraph(
        record('withings', 'getmeas:11', heartRateMeasurement),
        context('withings', '1', { studies: [study('a')] }),
      ),
    ).graph,
  ) as unknown as MutableGraph

const entryOf = (
  graph: MutableGraph,
  resourceType: string,
): MutableGraph['entry'][number] => {
  const entry = graph.entry.find(
    ({ resource }) => resource.resourceType === resourceType,
  )
  if (entry === undefined) throw new Error(`No ${resourceType} entry.`)
  return entry
}

const expectStudyContextRule = (graph: MutableGraph, location: string) => {
  const result = parseExchangeGraph(graph)
  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(
    result.issues
      .filter(({ code }) => code === 'mobile-support.study-context')
      .map((issue) => issue.location),
  ).toContain(location)
}

describe('study context', () => {
  const roles =
    groveExchangeProtocol.lifecycle.active.studyContext.entryNodeRoles

  it('bundles the enrollment as the catalog-keyed entries the IG recommends', () => {
    const graph = unwrap(
      buildProviderExchangeGraph(
        record('withings', 'getmeas:11', heartRateMeasurement),
        context('withings', '1', { subject: bundled, studies: [study('a')] }),
      ),
    ).graph
    expect(resources(graph).map(({ resourceType }) => resourceType)).toEqual([
      'Patient',
      'Observation',
      'ResearchStudy',
      'PlanDefinition',
      'ResearchSubject',
      'Device',
      'Device',
      'Device',
      'Provenance',
    ])
    const patient = entryKeyOf(graph, 'Patient')
    const researchStudy = entryKeyOf(graph, 'ResearchStudy')
    const plan = entryKeyOf(graph, 'PlanDefinition')
    const enrollment = entryKeyOf(graph, 'ResearchSubject')
    expect(patient.value).toMatch(/^n0:patient:0:/u)
    expect(researchStudy.value).toMatch(/^n0:research-study:0:/u)
    expect(plan.value).toMatch(/^n0:plan-definition:0:/u)
    expect(enrollment.value).toMatch(/^n0:research-subject:0:/u)
    expect(roles).toEqual([
      'patient',
      'research-study',
      'research-subject',
      'plan-definition',
    ])

    const observation = resources(graph).find(
      (r) => r.resourceType === 'Observation',
    )
    if (observation?.resourceType !== 'Observation')
      throw new Error('No Observation.')
    expect(observation.subject).toEqual({ reference: patient.fullUrl })
    expect(observation.extension).toContainEqual({
      url: 'http://hl7.org/fhir/StructureDefinition/workflow-researchStudy',
      valueReference: { reference: researchStudy.fullUrl },
    })
    expect(JSON.stringify(graph)).not.toContain(
      'workflow-instantiatesCanonical',
    )

    const studyResource = resources(graph).find(
      (r) => r.resourceType === 'ResearchStudy',
    )
    if (studyResource?.resourceType !== 'ResearchStudy')
      throw new Error('No study.')
    expect(studyResource.identifier).toEqual([study('a').study])
    expect(studyResource.protocol).toEqual([{ reference: plan.fullUrl }])
    const planResource = resources(graph).find(
      (r) => r.resourceType === 'PlanDefinition',
    )
    if (planResource?.resourceType !== 'PlanDefinition')
      throw new Error('No plan.')
    expect(planResource.url).toBe(study('a').protocol.url)
    expect(planResource.version).toBe('1')
    const subjectResource = resources(graph).find(
      (r) => r.resourceType === 'ResearchSubject',
    )
    if (subjectResource?.resourceType !== 'ResearchSubject')
      throw new Error('No subject.')
    expect(subjectResource.identifier).toEqual([study('a').enrollment])
    expect(subjectResource.study).toEqual({ reference: researchStudy.fullUrl })
    expect(subjectResource.individual).toEqual({ reference: patient.fullUrl })
    expect(parseExchangeGraph(graph).ok).toBe(true)
  })

  it('numbers each role independently across two enrollments', () => {
    const graph = unwrap(
      buildProviderExchangeGraph(
        record('withings', 'getmeas:11', heartRateMeasurement),
        context('withings', '1', { studies: [study('a'), study('b')] }),
      ),
    ).graph
    for (const [resourceType, role] of [
      ['ResearchStudy', 'research-study'],
      ['PlanDefinition', 'plan-definition'],
      ['ResearchSubject', 'research-subject'],
    ] as const) {
      expect(entryKeyOf(graph, resourceType, 0).value).toMatch(
        new RegExp(`^n0:${role}:0:`, 'u'),
      )
      expect(entryKeyOf(graph, resourceType, 1).value).toMatch(
        new RegExp(`^n0:${role}:1:`, 'u'),
      )
    }
    const observation = resources(graph).find(
      (r) => r.resourceType === 'Observation',
    )
    if (observation?.resourceType !== 'Observation')
      throw new Error('No Observation.')
    expect(
      observation.extension?.filter(({ url }) =>
        url?.endsWith('workflow-researchStudy'),
      ),
    ).toHaveLength(2)
  })

  it('keeps the logical subject by default and references it from the enrollment', () => {
    const graph = unwrap(
      buildProviderExchangeGraph(
        record('withings', 'getmeas:11', heartRateMeasurement),
        context('withings', '1', { studies: [study('a')] }),
      ),
    ).graph
    expect(resources(graph).some((r) => r.resourceType === 'Patient')).toBe(
      false,
    )
    const subjectResource = resources(graph).find(
      (r) => r.resourceType === 'ResearchSubject',
    )
    if (subjectResource?.resourceType !== 'ResearchSubject')
      throw new Error('No subject.')
    expect(subjectResource.individual).toEqual({
      type: 'Patient',
      identifier: {
        system: subject.identifier.system,
        value: subject.identifier.value,
      },
    })
  })

  it('rejects a study context on a graph whose output cannot carry it', () => {
    const source = unwrap(
      parseProviderRecordingSource({
        adapter: { kind: 'providers', provider: 'oura' },
        sourceType: 'heartrate',
        sourceNativeId: 'series-1',
        writer: { sourceDeviceToken: 'oura-app', name: 'Oura' },
        effective: { kind: 'date-time', value: '2026-08-20T12:00:00Z' },
      }),
    )
    const result = buildProviderRecordingGraph(
      source,
      {
        kind: 'embedded',
        contentType: 'application/json' as never,
        format: 'provider-recording',
        payloadAssertion: 'caller-authorized-opaque-payload',
        dataBase64: 'AQID' as never,
      },
      context('oura', '1', { studies: [study('a')] }),
    )
    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: 'value-mismatch', path: ['studies'] }],
    })
  })

  it('accepts both study-attribution corpus events and refuses the canonical protocol', () => {
    expect(parseExchangeGraph(corpus('source-event.json')).ok).toBe(true)
    expect(parseExchangeGraph(corpus('context-two-studies.json')).ok).toBe(true)
    const negatives = corpus('negative-cases.json') as {
      readonly cases: ReadonlyArray<{
        readonly id: string
        readonly base: string
        readonly patch: ReadonlyArray<{
          readonly op: string
          readonly path: string
          readonly value?: unknown
        }>
        readonly expectedRule: { readonly code: string }
      }>
    }
    const protocolCase = negatives.cases.find(
      ({ id }) => id === 'protocol-is-not-a-reference',
    )
    const subjectCase = negatives.cases.find(
      ({ id }) => id === 'subject-mismatch',
    )
    if (protocolCase === undefined || subjectCase === undefined)
      throw new Error('Corpus changed.')
    const apply = (
      base: unknown,
      patch: typeof protocolCase.patch,
    ): unknown => {
      const copy = structuredClone(base) as Record<string, unknown>
      for (const operation of patch) {
        const parts = operation.path.slice(1).split('/')
        const last = parts.pop() ?? ''
        let parent: unknown = copy
        for (const part of parts) {
          parent = (parent as Record<string, unknown>)[part]
        }
        ;(parent as Record<string, unknown>)[last] = operation.value
      }
      return copy
    }
    const protocol = parseExchangeGraph(
      apply(corpus('source-event.json'), protocolCase.patch),
    )
    expect(protocol.ok).toBe(false)
    if (!protocol.ok) {
      expect(protocol.issues.map(({ code }) => code)).toContain(
        protocolCase.expectedRule.code,
      )
    }
    // A foreign enrollment subject is a receiver decision, not a graph rule.
    expect(
      parseExchangeGraph(apply(corpus('source-event.json'), subjectCase.patch))
        .ok,
    ).toBe(true)
  })

  it('reports a study entry keyed by a role outside the catalog', () => {
    const tampered = mutableGraph()
    const studyEntry = entryOf(tampered, 'ResearchStudy')
    const key = studyEntry.extension?.[0]?.valueIdentifier
    if (key === undefined) throw new Error('No study key.')
    key.value = key.value.replace('research-study', 'study')
    expectStudyContextRule(
      tampered,
      `Bundle.entry[${String(tampered.entry.indexOf(studyEntry))}].extension.valueIdentifier`,
    )
  })

  it.each([
    [
      'a protocol without its exact revision',
      (graph: MutableGraph) => {
        delete entryOf(graph, 'PlanDefinition').resource.version
      },
      'PlanDefinition.version',
    ],
    [
      'a study that names no protocol',
      (graph: MutableGraph) => {
        entryOf(graph, 'ResearchStudy').resource.protocol = []
      },
      'ResearchStudy.protocol',
    ],
    [
      'an enrollment linked to the protocol instead of the study',
      (graph: MutableGraph) => {
        entryOf(graph, 'ResearchSubject').resource.study = {
          reference: entryOf(graph, 'PlanDefinition').fullUrl,
        }
      },
      'ResearchSubject.study',
    ],
    [
      'an enrollment that names no subject',
      (graph: MutableGraph) => {
        entryOf(graph, 'ResearchSubject').resource.individual = {
          display: 'the participant',
        }
      },
      'ResearchSubject.individual',
    ],
  ])('reports %s', (_name, mutate, location) => {
    const tampered = mutableGraph()
    mutate(tampered)
    expectStudyContextRule(tampered, location)
  })

  it('reports a study without its enrollment', () => {
    const tampered = mutableGraph()
    const studyIndex = tampered.entry.indexOf(
      entryOf(tampered, 'ResearchStudy'),
    )
    tampered.entry.splice(
      tampered.entry.indexOf(entryOf(tampered, 'ResearchSubject')),
      1,
    )
    expectStudyContextRule(
      tampered,
      `Bundle.entry[${String(studyIndex)}].resource`,
    )
  })
})
