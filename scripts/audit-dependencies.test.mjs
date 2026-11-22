//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { auditTargets, validateAuditReport } from "./audit-dependencies.mjs";

const exceptions = new Map([["GHSA-g3hv-75wg-m249", "minimatch"]]);

const advisory = (id, moduleName) => ({
  github_advisory_id: id,
  module_name: moduleName,
  url: `https://github.com/advisories/${id}`,
  findings: [{ version: "1.0.0", paths: [`root>${moduleName}`] }],
});

const report = ({ includeUnexpected = false } = {}) => ({
  advisories: {
    1: advisory("GHSA-g3hv-75wg-m249", "minimatch"),
    ...(includeUnexpected && {
      2: advisory("GHSA-xxxx-yyyy-zzzz", "unexpected"),
    }),
  },
  metadata: {},
});

describe("dependency audit exceptions", () => {
  it("accepts only the documented advisories", () => {
    assert.deepEqual(validateAuditReport(report(), exceptions), [
      "GHSA-g3hv-75wg-m249",
    ]);
  });

  it("accepts a report without findings when no exceptions remain", () => {
    assert.deepEqual(
      validateAuditReport({ advisories: {}, metadata: {} }, new Map()),
      [],
    );
  });

  it("documents a reason for every exception", () => {
    for (const { exceptions: targetExceptions } of Object.values(
      auditTargets,
    )) {
      for (const reason of targetExceptions.values()) {
        assert.ok(reason.length > 0);
      }
    }
  });

  it("rejects unexpected advisories", () => {
    assert.throws(
      () =>
        validateAuditReport(report({ includeUnexpected: true }), exceptions),
      /Unexpected pnpm audit findings: GHSA-xxxx-yyyy-zzzz/,
    );
  });

  it("rejects registry errors", () => {
    assert.throws(
      () =>
        validateAuditReport(
          { error: { summary: "registry unavailable" } },
          exceptions,
        ),
      /pnpm audit failed: registry unavailable/,
    );
  });

  it("rejects stale exceptions", () => {
    const withResolved = new Map([
      ...exceptions,
      ["GHSA-resolved-advisory", "Resolved."],
    ]);
    assert.throws(
      () => validateAuditReport(report(), withResolved),
      /Remove resolved pnpm audit exceptions: GHSA-resolved-advisory/,
    );
  });

  it("identifies advisories from their URL when the ID field is missing", () => {
    const { github_advisory_id: _, ...withoutId } = advisory(
      "GHSA-g3hv-75wg-m249",
      "minimatch",
    );
    assert.deepEqual(
      validateAuditReport({ advisories: { 1: withoutId } }, exceptions),
      ["GHSA-g3hv-75wg-m249"],
    );
  });
});
