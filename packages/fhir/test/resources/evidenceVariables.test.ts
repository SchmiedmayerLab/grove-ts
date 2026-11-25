//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from "fs";
import { expectTypeOf } from "expect-type";
import type { EvidenceVariable } from "fhir/r4b.js";
import type { z } from "zod";
import {
  FhirEvidenceVariable,
  type untypedEvidenceVariableSchema,
} from "../../src/index.js";
import { jsonStringifyDeterministically } from "./testHelpers.js";

describe("EvidenceVariable Resource", () => {
  it("should validate FHIR evidence variables from evidenceVariables.json", () => {
    type Schema = z.infer<typeof untypedEvidenceVariableSchema>;
    expectTypeOf<Schema>().toExtend<EvidenceVariable>();
    expectTypeOf<EvidenceVariable>().toExtend<Schema>();

    const data = fs.readFileSync(
      "test/resources/evidenceVariables.json",
      "utf-8",
    );
    const decodedJson = JSON.parse(data) as Record<string, unknown>;

    Object.values(decodedJson).forEach((jsonValue) => {
      const parsedResource = FhirEvidenceVariable.parse(jsonValue).value;
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      );
    });
  });
});
