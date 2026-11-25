//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from "fs";
import { expectTypeOf } from "expect-type";
import { type EvidenceReport } from "fhir/r4b.js";
import { type z } from "zod";
import {
  FhirEvidenceReport,
  type untypedEvidenceReportSchema,
} from "../../src/index.js";
import { jsonStringifyDeterministically } from "./testHelpers.js";

describe("EvidenceReport Resource", () => {
  it("should validate FHIR evidence reports from evidenceReports.json", () => {
    type Schema = z.infer<typeof untypedEvidenceReportSchema>;
    expectTypeOf<Schema>().toExtend<EvidenceReport>();
    expectTypeOf<EvidenceReport>().toExtend<Schema>();

    const data = fs.readFileSync(
      "test/resources/evidenceReports.json",
      "utf-8",
    );
    const decodedJson = JSON.parse(data) as Record<string, unknown>;

    Object.values(decodedJson).forEach((jsonValue) => {
      const parsedResource = FhirEvidenceReport.parse(jsonValue).value;
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      );
    });
  });
});
