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
    const deploymentIdentity = {
      opaqueIdentifierSystems: Object.fromEntries(
        [
          'source-record',
          'source-output',
          'writer-record',
          'provider-record',
          'provider-output',
          'source-artifact',
          'provider-artifact',
          'source-context',
          'recording-device',
          'device-snapshot',
        ].map((kind) => [
          kind,
          `https://example.org/browser/identity/${kind}/browser-key/1`,
        ]),
      ),
      eventIdentifierSystem: 'https://example.org/browser/identity/event',
      entryNodeIdentifierSystem:
        'https://example.org/browser/identity/entry-node',
      keyId: 'browser-key',
      keyEpoch: '1',
      secretBase64Url: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY',
      producerInstance: '9738c1a2-4258-4ba7-a9f7-e7f56e2996d8',
    }
    const providerSubject = {
      type: 'Patient',
      identifier: {
        system: 'https://example.org/browser/patient-pseudonyms',
        value: 'patient-browser',
        assurance: 'deployment-scoped-pseudonym',
      },
    }
    const measurementGraph = provider.buildProviderMeasurementBundle({
      subject: providerSubject,
      measurements: [
        {
          kind: 'heart-rate',
          value: 64,
          effective: { kind: 'date-time', value: '2026-08-20T12:00:00Z' },
        },
      ],
      source: {
        adapter: { kind: 'providers', provider: 'withings' },
        providerScopeIdentifier: {
          system: 'https://example.org/provider-account-pseudonyms',
          value: 'browser-account',
          assurance: 'deployment-scoped-account-pseudonym',
        },
        sourceType: 'getmeas:11',
        sourceNativeId: 'browser-heart-rate',
        dataOrigin: {
          sourceDeviceToken: 'browser-withings-origin',
          name: 'Withings',
        },
      },
      application: {
        sourceDeviceToken: 'browser-converter',
        name: 'Browser converter',
      },
      eventSequence: '1',
      deploymentIdentity,
      occurred: '2026-08-20T12:00:00Z',
      recorded: '2026-08-20T12:02:00Z',
      assembled: '2026-08-20T12:03:00Z',
    })
    const outputCoordinates = provider.providerOutputCoordinates(
      'withings',
      'getmeas:11',
      'heart-rate',
    )
    const retraction =
      outputCoordinates === undefined ?
        { ok: false }
      : provider.buildProviderRetractionBundle({
          source: {
            provider: 'withings',
            providerScopeIdentifier: {
              system: 'https://example.org/provider-account-pseudonyms',
              value: 'browser-account',
              assurance: 'deployment-scoped-account-pseudonym',
            },
            sourceType: 'getmeas:11',
            sourceNativeId: 'browser-heart-rate',
          },
          targets: [
            {
              role: 'primary-output',
              resourceType: 'Observation',
              ...outputCoordinates,
            },
          ],
          application: {
            sourceDeviceToken: 'browser-converter',
            name: 'Browser converter',
          },
          eventSequence: '3',
          deploymentIdentity,
          occurred: '2026-08-21T12:00:00Z',
          recorded: '2026-08-21T12:01:00Z',
          assembled: '2026-08-21T12:02:00Z',
        })
    const recording = provider.buildProviderRecordingBundle({
      source: {
        adapter: { kind: 'providers', provider: 'google-health-api' },
        providerScopeIdentifier: {
          system: 'https://example.org/provider-account-pseudonyms',
          value: 'browser-raw-account',
          assurance: 'deployment-scoped-account-pseudonym',
        },
        sourceType: 'heart-rate',
        sourceNativeId: 'browser-native-recording-42',
        dataOrigin: {
          sourceDeviceToken: 'browser-google-origin',
          name: 'Google Health API',
        },
      },
      attachment: {
        kind: 'embedded',
        contentType: 'application/json',
        title: 'Authorized minimized provider recording',
        format: 'provider-recording',
        payloadAssertion: 'caller-authorized-opaque-payload',
        dataBase64: 'AQID',
      },
      subject: providerSubject,
      application: {
        sourceDeviceToken: 'browser-raw-converter',
        name: 'Browser raw converter',
      },
      eventSequence: '2',
      deploymentIdentity,
      documentDate: '2026-08-20T12:01:00Z',
      occurred: '2026-08-20T12:00:00Z',
      recorded: '2026-08-20T12:02:00Z',
      assembled: '2026-08-20T12:03:00Z',
    })
    const instrument = questionnaire.buildQuestionnaire({
      url: 'https://example.org/Questionnaire/browser',
      version: '1.0.0',
      status: 'active',
      items: [
        {
          linkId: 'ready',
          text: 'Are you ready?',
          type: 'boolean',
          required: true,
        },
      ],
    })
    const response = questionnaire.buildQuestionnaireResponse({
      questionnaire: 'https://example.org/Questionnaire/browser|1.0.0',
      identifier: {
        system: 'https://example.org/responses',
        value: 'browser-1',
      },
      status: 'completed',
      authored: '2026-08-20T12:00:00Z',
      items: [
        {
          linkId: 'ready',
          text: 'Are you ready?',
          answer: [{ valueBoolean: true }],
        },
      ],
    })
    const pair =
      instrument.ok && response.ok ?
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
      providerApiVisibleFromMobile:
        'buildProviderMeasurementBundle' in mobile ||
        'buildProviderRecordingBundle' in mobile ||
        'buildProviderRetractionBundle' in mobile,
      providerApiVisibleFromRoot:
        'buildProviderMeasurementBundle' in grove ||
        'buildProviderRecordingBundle' in grove ||
        'buildProviderRetractionBundle' in grove,
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
    result.recordingGraph !== true ||
    result.retractionGraph !== true ||
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
