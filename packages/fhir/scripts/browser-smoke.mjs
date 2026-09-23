//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, extname, resolve, sep } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { chromium } from 'playwright'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const groveRoot = resolve(packageRoot, 'dist')
const nobleRoot = resolve(packageRoot, '../../node_modules/@noble/hashes')
const uuidRoot = resolve(packageRoot, '../../node_modules/uuid/dist')
const zodRoot = resolve(packageRoot, '../../node_modules/zod')

const contentType = (path) =>
  extname(path) === '.js' ?
    'text/javascript; charset=utf-8'
  : 'application/octet-stream'

const resolveRequest = (url) => {
  const parsed = new URL(url, 'http://localhost')
  const route =
    parsed.pathname.startsWith('/grove/') ?
      { root: groveRoot, relative: parsed.pathname.slice('/grove/'.length) }
    : parsed.pathname.startsWith('/noble/') ?
      { root: nobleRoot, relative: parsed.pathname.slice('/noble/'.length) }
    : parsed.pathname.startsWith('/uuid/') ?
      { root: uuidRoot, relative: parsed.pathname.slice('/uuid/'.length) }
    : parsed.pathname.startsWith('/zod/') ?
      { root: zodRoot, relative: parsed.pathname.slice('/zod/'.length) }
    : undefined
  if (route === undefined) return undefined

  const candidate = resolve(route.root, route.relative)
  return candidate.startsWith(`${route.root}${sep}`) ? candidate : undefined
}

const server = createServer(async (request, response) => {
  if (request.url === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(`<!doctype html>
      <meta charset="utf-8">
      <script type="importmap">
        {"imports":{"@noble/hashes/":"/noble/","uuid":"/uuid/index.js","zod":"/zod/index.js"}}
      </script>`)
    return
  }

  const path = resolveRequest(request.url ?? '')
  if (path === undefined) {
    response.writeHead(404)
    response.end()
    return
  }
  try {
    response.writeHead(200, { 'content-type': contentType(path) })
    response.end(await readFile(path))
  } catch {
    response.writeHead(404)
    response.end()
  }
})

await new Promise((resolveListen) => {
  server.listen(0, '127.0.0.1', resolveListen)
})
const address = server.address()
if (address === null || typeof address === 'string') {
  throw new Error('Browser test server did not bind to a TCP port.')
}
const origin = `http://127.0.0.1:${address.port}`

const launchBrowser = async () => {
  try {
    return await chromium.launch({ headless: true })
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Executable doesn't exist")
    ) {
      return chromium.launch({ channel: 'chrome', headless: true })
    }
    throw error
  }
}

const browser = await launchBrowser()
try {
  const page = await browser.newPage()
  await page.goto(origin)
  const result = await page.evaluate(async (base) => {
    const grove = await import(`${base}/grove/index.js`)
    const mobile = await import(`${base}/grove/mobile/index.js`)
    const provider = await import(`${base}/grove/providers/index.js`)
    const questionnaire = await import(`${base}/grove/questionnaire/index.js`)
    const absolute = mobile.deriveEntryFullUrl({
      system: 'https://study.example.org/fhir/identifiers/mobile-observation',
      value: 'heart-rate-20260820-001',
    })
    const unwrap = (result) => {
      if (!result.ok) throw new Error(JSON.stringify(result.issues))
      return result.value
    }
    const identityScope = unwrap(
      mobile.validateOpaqueIdentityScope({
        systems: unwrap(
          mobile.deriveOpaqueIdentitySystems(
            'https://example.org/browser',
            'browser-key',
            '1',
          ),
        ),
        keyId: 'browser-key',
        keyEpoch: '1',
        secretBase64Url: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY',
        producerInstance: '9738c1a2-4258-4ba7-a9f7-e7f56e2996d8',
      }),
    )
    const context = (sequence, repositoryScope) => ({
      subject: {
        kind: 'logical',
        identifier: {
          system: 'https://example.org/browser/patient-pseudonyms',
          value: 'patient-browser',
        },
      },
      event: unwrap(mobile.deriveEventIdentifier(identityScope, sequence)),
      identityScope,
      repositoryScope,
      application: {
        sourceDeviceToken: 'browser-converter',
        name: 'Browser converter',
        version: '1.0.0',
      },
      host: {
        sourceDeviceToken: 'browser-host',
        operatingSystemVersion: 'Browser 1',
      },
      conversionInstant: '2026-08-20T12:03:00Z',
    })
    const accountScope = {
      system: 'https://example.org/provider-account-pseudonyms',
      value: 'browser-account',
    }
    const measurementGraph = provider.buildProviderExchangeGraph(
      {
        source: {
          adapter: { kind: 'providers', provider: 'withings' },
          sourceType: 'getmeas:11',
          sourceNativeId: 'browser-heart-rate',
          writer: {
            sourceDeviceToken: 'browser-withings-origin',
            name: 'Withings',
          },
        },
        measurements: [
          {
            kind: 'heart-rate',
            value: 64,
            effective: { kind: 'date-time', value: '2026-08-20T12:00:00Z' },
          },
        ],
      },
      context('1', accountScope),
    )
    const heartRateRecord = unwrap(
      provider.deriveProviderRecordIdentity(identityScope, {
        providerCode: 'withings',
        sourceType: 'getmeas:11',
        providerScope: accountScope,
        nativeRecordId: 'browser-heart-rate',
      }),
    )
    const heartRateOutput = unwrap(
      heartRateRecord.output(
        provider.providerOutputCoordinates(
          'withings',
          'getmeas:11',
          'heart-rate',
        ),
      ),
    )
    const retraction =
      measurementGraph.ok ?
        provider.buildProviderRetractionEvent(
          unwrap(grove.retractionTargets(measurementGraph.value.graph)),
          context('3', accountScope),
          heartRateRecord.identifier,
          '2026-08-21T12:00:00Z',
        )
      : { ok: false }
    const recording = provider.buildProviderRecordingGraph(
      {
        adapter: { kind: 'providers', provider: 'google-health-api' },
        sourceType: 'heart-rate',
        sourceNativeId: 'browser-native-recording-42',
        writer: {
          sourceDeviceToken: 'browser-google-origin',
          name: 'Google Health API',
        },
        effective: {
          kind: 'period',
          start: '2026-08-20T00:00:00Z',
          end: '2026-08-20T12:00:00Z',
        },
      },
      {
        kind: 'embedded',
        contentType:
          provider.groveRecordingFormatRegistry.formats['provider-recording']
            .contentTypes[0],
        title: 'Authorized minimized provider recording',
        format: 'provider-recording',
        payloadAssertion: 'caller-authorized-opaque-payload',
        dataBase64: 'AQID',
      },
      context('2', {
        system: 'https://example.org/provider-account-pseudonyms',
        value: 'browser-raw-account',
      }),
    )
    const replayed =
      measurementGraph.ok ?
        grove.isSemanticallyEqual(
          JSON.stringify(measurementGraph.value.graph),
          JSON.stringify(measurementGraph.value.graph, null, 2),
        )
      : { ok: false }
    const instrument = questionnaire.buildQuestionnaire({
      url: 'https://example.org/Questionnaire/browser',
      version: '1.0.0',
      language: 'en-US',
      status: 'active',
      subjectTypes: ['Patient'],
      items: [
        {
          linkId: 'ready',
          text: 'Are you ready?',
          type: 'boolean',
          required: true,
        },
      ],
    })
    const response =
      instrument.ok ?
        questionnaire.buildQuestionnaireResponse(
          {
            language: 'en-US',
            identifier: {
              system: 'https://example.org/responses',
              value: 'browser-1',
            },
            status: 'completed',
            subject: { type: 'Patient', reference: 'Patient/browser' },
            authored: '2026-08-20T12:00:00Z',
            items: [{ linkId: 'ready', answer: [{ valueBoolean: true }] }],
          },
          instrument.value,
        )
      : undefined
    const pair =
      response?.ok === true ?
        questionnaire.preflightQuestionnairePair(
          instrument.value,
          response.value,
        )
      : undefined
    return {
      fullUrl: absolute.ok ? absolute.value : undefined,
      hasNodeProcess: typeof globalThis.process !== 'undefined',
      measurementCount: Object.keys(mobile.sharedMobileMeasurementCatalog)
        .length,
      measurementGraph: measurementGraph.ok,
      recordIdentity:
        measurementGraph.ok &&
        JSON.stringify([heartRateRecord.identifier, heartRateOutput]) ===
          JSON.stringify([
            measurementGraph.value.identifiers.sourceRecord,
            measurementGraph.value.identifiers.outputs[0],
          ]),
      recordingGraph: recording.ok,
      retractionGraph:
        retraction.ok &&
        !JSON.stringify(retraction.value).includes('entered-in-error'),
      rawSourceCount: Object.values(provider.providerRawOutputRoles).reduce(
        (count, mappings) => count + Object.keys(mappings).length,
        0,
      ),
      scalarMeasurementCount: new Set(
        Object.values(provider.providerScalarOutputRoles).flatMap(
          (sourceMappings) =>
            Object.values(sourceMappings).flatMap((mapping) =>
              Object.keys(mapping),
            ),
        ),
      ).size,
      replayed: replayed.ok && replayed.value,
      providerApiVisibleFromMobile:
        'buildProviderExchangeGraph' in mobile ||
        'buildProviderRecordingGraph' in mobile ||
        'buildProviderRetractionEvent' in mobile,
      providerApiVisibleFromRoot:
        'buildProviderExchangeGraph' in grove ||
        'buildProviderRecordingGraph' in grove ||
        'buildProviderRetractionEvent' in grove,
      internalGraphVisible:
        'groveFhirPackageGraph' in grove ||
        'groveFhirProfileClaims' in grove ||
        'groveFhirPackageGraph' in mobile ||
        'groveFhirProfileClaims' in mobile,
      questionnairePair: pair?.ok,
    }
  }, origin)

  if (
    result.fullUrl !== 'urn:uuid:9ca77ee5-421b-5f0c-8206-7e9e65485ae5' ||
    result.hasNodeProcess ||
    result.measurementCount !== 84 ||
    result.measurementGraph !== true ||
    result.recordIdentity !== true ||
    result.recordingGraph !== true ||
    result.retractionGraph !== true ||
    result.replayed !== true ||
    result.rawSourceCount !== 4 ||
    result.scalarMeasurementCount !== 47 ||
    result.providerApiVisibleFromMobile ||
    result.providerApiVisibleFromRoot ||
    result.internalGraphVisible ||
    result.questionnairePair !== true
  ) {
    throw new Error(`Browser contract failed: ${JSON.stringify(result)}`)
  }
} finally {
  await browser.close()
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error === undefined) resolveClose()
      else rejectClose(error)
    })
  })
}
