//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from "fs";
import { expectTypeOf } from "expect-type";
import type { MedicationKnowledge } from "fhir/r4b.js";
import type { z } from "zod";
import {
  FhirMedicationKnowledge,
  type untypedMedicationKnowledgeSchema,
} from "../../src/index.js";
import { jsonStringifyDeterministically } from "./testHelpers.js";

describe("MedicationKnowledge Resource", () => {
  it("should validate FHIR medication knowledges from medicationKnowledges.json", () => {
    type Schema = z.infer<typeof untypedMedicationKnowledgeSchema>;
    expectTypeOf<Schema>().toExtend<MedicationKnowledge>();
    expectTypeOf<MedicationKnowledge>().toExtend<Schema>();

    const data = fs.readFileSync(
      "test/resources/medicationKnowledges.json",
      "utf-8",
    );
    const decodedJson = JSON.parse(data) as Record<string, unknown>;

    Object.values(decodedJson).forEach((jsonValue) => {
      const parsedResource = FhirMedicationKnowledge.parse(jsonValue).value;
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      );
    });
  });
});
