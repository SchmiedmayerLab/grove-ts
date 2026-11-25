//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from "fs";
import { expectTypeOf } from "expect-type";
import type { Substance } from "fhir/r4b.js";
import type { z } from "zod";
import { FhirSubstance, type untypedSubstanceSchema } from "../../src/index.js";
import { jsonStringifyDeterministically } from "./testHelpers.js";

describe("Substance Resource", () => {
  it("should validate FHIR substance from substances.json", () => {
    type Schema = z.infer<typeof untypedSubstanceSchema>;
    expectTypeOf<Schema>().toExtend<Substance>();
    expectTypeOf<Substance>().toExtend<Schema>();

    const data = fs.readFileSync("test/resources/substances.json", "utf-8");
    const decodedJson = JSON.parse(data) as Record<string, unknown>;

    Object.values(decodedJson).forEach((jsonValue) => {
      const parsedResource = FhirSubstance.parse(jsonValue).value;
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      );
    });
  });
});
