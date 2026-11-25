//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from "fs";
import { expectTypeOf } from "expect-type";
import type { ClinicalUseDefinition } from "fhir/r4b.js";
import type { z } from "zod";
import {
  FhirClinicalUseDefinition,
  type untypedClinicalUseDefinitionSchema,
} from "../../src/index.js";
import { jsonStringifyDeterministically } from "./testHelpers.js";

describe("ClinicalUseDefinition Resource", () => {
  it("should validate FHIR clinical use definition from clinicalUseDefinitions.json", () => {
    type Schema = z.infer<typeof untypedClinicalUseDefinitionSchema>;
    expectTypeOf<Schema>().toExtend<ClinicalUseDefinition>();
    expectTypeOf<ClinicalUseDefinition>().toExtend<Schema>();

    const data = fs.readFileSync(
      "test/resources/clinicalUseDefinitions.json",
      "utf-8",
    );
    const decodedJson = JSON.parse(data) as Record<string, unknown>;

    Object.values(decodedJson).forEach((jsonValue) => {
      const parsedResource = FhirClinicalUseDefinition.parse(jsonValue).value;
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      );
    });
  });
});
