//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from "fs";
import { expectTypeOf } from "expect-type";
import type { Observation } from "fhir/r4b.js";
import type { z } from "zod";
import {
  FhirObservation,
  type untypedObservationSchema,
} from "../../src/index.js";
import { jsonStringifyDeterministically } from "./testHelpers.js";

describe("Observation Resource", () => {
  it("should validate FHIR observation from observation.json", () => {
    type Schema = z.infer<typeof untypedObservationSchema>;
    expectTypeOf<Schema>().toExtend<Observation>();
    expectTypeOf<Observation>().toExtend<Schema>();

    const data = fs.readFileSync("test/resources/observations.json", "utf-8");
    const decodedJson = JSON.parse(data) as Record<string, unknown>;

    Object.values(decodedJson).forEach((jsonValue) => {
      const parsedResource = FhirObservation.parse(jsonValue).value;
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      );
    });
  });
});
