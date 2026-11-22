//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from "fs";
import { expectTypeOf } from "expect-type";
import { type ConceptMap } from "fhir/r4b.js";
import { type z } from "zod";
import {
  FhirConceptMap,
  type untypedConceptMapSchema,
} from "../../src/index.js";
import { jsonStringifyDeterministically } from "./testHelpers.js";

describe("ConceptMap Resource", () => {
  it("should validate FHIR ConceptMaps from conceptMaps.json", () => {
    type Schema = z.infer<typeof untypedConceptMapSchema>;
    expectTypeOf<Schema>().toExtend<ConceptMap>();
    expectTypeOf<ConceptMap>().toExtend<Schema>();

    const data = fs.readFileSync("test/resources/conceptMaps.json", "utf-8");
    const decodedJson = JSON.parse(data) as Record<string, unknown>;

    Object.values(decodedJson).forEach((jsonValue) => {
      const parsedResource = FhirConceptMap.parse(jsonValue).value;
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      );
    });
  });
});
