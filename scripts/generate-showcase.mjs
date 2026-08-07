//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { createServer } from 'node:http'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { chromium } from 'playwright'

const storybookDirectory = resolve('packages/design-system/storybook-static')
const documentationImageDirectory = resolve(
  'packages/design-system/docs/static/img',
)
const showcaseVariants = [
  { name: 'light', story: 'light' },
  { name: 'dark', story: 'dark' },
]

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
])

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url ?? '/', 'http://localhost').pathname,
    )
    const relativePath = normalize(pathname).replace(/^[/\\]+/, '')
    let filePath = resolve(storybookDirectory, relativePath || 'index.html')

    if (
      filePath !== storybookDirectory &&
      !filePath.startsWith(`${storybookDirectory}${sep}`)
    ) {
      response.writeHead(403).end('Forbidden')
      return
    }

    if ((await stat(filePath)).isDirectory()) {
      filePath = join(filePath, 'index.html')
    }

    const body = await readFile(filePath)
    response.writeHead(200, {
      'Content-Type':
        contentTypes.get(extname(filePath)) ?? 'application/octet-stream',
    })
    response.end(body)
  } catch {
    response.writeHead(404).end('Not found')
  }
})

await new Promise((resolveServer, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', resolveServer)
})

const address = server.address()
if (!address || typeof address === 'string') {
  server.close()
  throw new Error('Unable to determine the showcase server address.')
}

let browser
try {
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL ?? 'chrome',
    headless: true,
  })
  await Promise.all([
    mkdir(storybookDirectory, { recursive: true }),
    mkdir(documentationImageDirectory, { recursive: true }),
  ])

  for (const variant of showcaseVariants) {
    const filename = `grove-showcase-${variant.name}.png`
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    })
    await page.emulateMedia({
      colorScheme: variant.name,
      reducedMotion: 'reduce',
    })
    await page.goto(
      `http://127.0.0.1:${address.port}/iframe.html?id=examples-grove-showcase--${variant.story}&viewMode=story`,
      { waitUntil: 'networkidle' },
    )
    await page.evaluate(() => document.fonts.ready)
    await page.addStyleTag({
      content:
        'html, body, #storybook-root, .sb-show-main { background: transparent !important; }',
    })

    const showcase = page.getByTestId('grove-showcase')
    await showcase.waitFor({ state: 'visible' })
    const screenshot = await showcase.screenshot({
      animations: 'disabled',
      omitBackground: true,
    })
    const outputPaths = [
      join(storybookDirectory, filename),
      join(documentationImageDirectory, filename),
    ]
    await Promise.all(outputPaths.map((path) => writeFile(path, screenshot)))
    await page.close()
    outputPaths.forEach((path) => console.log(`Generated ${path}`))
  }
} finally {
  await browser?.close()
  await new Promise((resolveServer) => server.close(resolveServer))
}
