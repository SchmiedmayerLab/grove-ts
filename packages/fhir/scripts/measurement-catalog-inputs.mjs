//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'))

/** Resolve the local/pinned IG layout and load every generator input once. */
export const loadMeasurementCatalogInputs = async (scriptUrl, arguments_) => {
  const packageRoot = resolve(dirname(fileURLToPath(scriptUrl)), '..')
  const localIgIndex = arguments_.indexOf('--ig')
  const upstreamRoot =
    localIgIndex === -1 ?
      resolve(packageRoot, '.grove-fhir')
    : resolve(arguments_[localIgIndex + 1] ?? '')
  const catalogRoot = resolve(upstreamRoot, 'catalog')
  const paths = {
    capability: resolve(packageRoot, 'catalog/measurement-capabilities.json'),
    catalog: resolve(catalogRoot, 'measurement-catalog.json'),
    exchangeCorpus: resolve(
      upstreamRoot,
      'Conformance/corpora/mobile-exchange/corpus.json',
    ),
    exchangeProtocol: resolve(catalogRoot, 'exchange-protocol.json'),
    formatRegistry: resolve(catalogRoot, 'format-registry.json'),
    healthConnectAdapter: resolve(catalogRoot, 'health-connect-adapter.json'),
    healthKitAdapter: resolve(catalogRoot, 'healthkit-adapter.json'),
    packageGraph: resolve(catalogRoot, 'package-graph.json'),
    profileClaims: resolve(catalogRoot, 'profile-claims.json'),
    providerAdapter: resolve(catalogRoot, 'providers-adapter.json'),
    semanticCorpus: resolve(
      upstreamRoot,
      'Conformance/corpora/mobile-semantics/corpus.json',
    ),
    sensorCatalog: resolve(catalogRoot, 'sensor-catalog.json'),
    sensorKitAdapter: resolve(catalogRoot, 'sensorkit-adapter.json'),
    sourceRef: resolve(packageRoot, 'grove-fhir.json'),
  }
  const [
    capabilities,
    catalog,
    exchangeCorpus,
    exchangeProtocol,
    formatRegistry,
    healthConnectAdapter,
    healthKitAdapter,
    packageGraph,
    profileClaims,
    providerAdapter,
    semanticCorpus,
    sensorCatalog,
    sensorKitAdapter,
    sourceRef,
  ] = await Promise.all([
    readJson(paths.capability),
    readJson(paths.catalog),
    readJson(paths.exchangeCorpus),
    readJson(paths.exchangeProtocol),
    readJson(paths.formatRegistry),
    readJson(paths.healthConnectAdapter),
    readJson(paths.healthKitAdapter),
    readJson(paths.packageGraph),
    readJson(paths.profileClaims),
    readJson(paths.providerAdapter),
    readJson(paths.semanticCorpus),
    readJson(paths.sensorCatalog),
    readJson(paths.sensorKitAdapter),
    readJson(paths.sourceRef),
  ])

  return {
    capabilities,
    catalog,
    exchangeCorpus,
    exchangeProtocol,
    formatRegistry,
    healthConnectAdapter,
    healthKitAdapter,
    outputPaths: {
      mobile: resolve(
        packageRoot,
        'src/mobile/measurement-catalog.generated.ts',
      ),
      provider: resolve(packageRoot, 'src/providers/contract.generated.ts'),
      questionnaire: resolve(
        packageRoot,
        'src/questionnaire/contract.generated.ts',
      ),
    },
    packageGraph,
    profileClaims,
    providerAdapter,
    semanticCorpus,
    sensorCatalog,
    sensorKitAdapter,
    sourceRef,
  }
}
