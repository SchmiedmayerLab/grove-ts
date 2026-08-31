//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

export {
  decodeCanonicalBase64,
  encodeBase64,
  type Base64Options,
} from './base64.js'
export { deepFreeze, type ReadonlyDeep } from './freeze.js'
export { cloneJsonValue, type JsonValue } from './json.js'
export {
  compareFhirInstants,
  fhirDateTimeToDate,
  parseAbsoluteUri,
  parseCanonical,
  parseFhirId,
  parseFhirInstant,
  parsePatientReference,
  parsePositiveInteger,
  parseResearchStudyReference,
  parseSemVer,
  parseUrnUuid,
  type AbsoluteUri,
  type Canonical,
  type FhirId,
  type FhirInstant,
  type PatientReference,
  type PositiveInteger,
  type ResearchStudyReference,
  type SemVer,
  type UrnUuid,
} from './primitives.js'
export {
  fhirQuantityToValue,
  type QuantityComparator,
  type QuantityValue,
} from './quantity.js'
export {
  collectResults,
  err,
  issue,
  issues,
  mapResult,
  ok,
  zodIssuePath,
  zodIssueToIssue,
  type Issue,
  type IssueCode,
  type IssueSeverity,
  type Result,
} from './result.js'
