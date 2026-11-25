//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from "fs";
import { expectTypeOf } from "expect-type";
import type { ActivityDefinition } from "fhir/r4b.js";
import type { z } from "zod";
import {
  FhirActivityDefinition,
  type untypedActivityDefinitionSchema,
} from "../../src/index.js";
import { jsonStringifyDeterministically } from "./testHelpers.js";

describe("ActivityDefinition Resource", () => {
  it("should validate FHIR activity definitions from activityDefinitions.json", () => {
    type Schema = z.infer<typeof untypedActivityDefinitionSchema>;
    expectTypeOf<Schema>().toExtend<ActivityDefinition>();
    expectTypeOf<ActivityDefinition>().toExtend<Schema>();

    const data = fs.readFileSync(
      "test/resources/activityDefinitions.json",
      "utf-8",
    );
    const decodedJson = JSON.parse(data) as Record<string, unknown>;

    Object.values(decodedJson).forEach((jsonValue) => {
      const parsedResource = FhirActivityDefinition.parse(jsonValue).value;
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      );
    });
  });
});
