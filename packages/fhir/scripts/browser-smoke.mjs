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
        {"imports":{"uuid":"/uuid/index.js","zod":"/zod/index.js"}}
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
    const grove = await import(`${base}/grove/mobile/index.js`)
    const absolute = grove.deriveEntryFullUrl({
      system: 'https://study.example.org/fhir/identifiers/mobile-observation',
      value: 'heart-rate-20260820-001',
    })
    return {
      fullUrl: absolute.ok ? absolute.value : undefined,
      hasNodeProcess: typeof globalThis.process !== 'undefined',
      measurementCount: Object.keys(grove.implementedMeasurementCatalog).length,
    }
  }, origin)

  if (
    result.fullUrl !== 'urn:uuid:cd27941b-2a75-5f7a-bd25-71e9480eac24' ||
    result.hasNodeProcess ||
    result.measurementCount !== 18
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
