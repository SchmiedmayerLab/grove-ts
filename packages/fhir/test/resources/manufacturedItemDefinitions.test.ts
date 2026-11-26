//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from "fs";
import { expectTypeOf } from "expect-type";
import type { ManufacturedItemDefinition } from "fhir/r4b.js";
import type { z } from "zod";
import {
  FhirManufacturedItemDefinition,
  type untypedManufacturedItemDefinitionSchema,
} from "../../src/index.js";
import { jsonStringifyDeterministically } from "./testHelpers.js";

describe("ManufacturedItemDefinition Resource", () => {
  it("should validate FHIR manufacturedItemDefinition from manufacturedItemDefinitions.json", () => {
    type Schema = z.infer<typeof untypedManufacturedItemDefinitionSchema>;
    expectTypeOf<Schema>().toExtend<ManufacturedItemDefinition>();
    expectTypeOf<ManufacturedItemDefinition>().toExtend<Schema>();

    const data = fs.readFileSync(
      "test/resources/manufacturedItemDefinitions.json",
      "utf-8",
    );
    const decodedJson = JSON.parse(data) as Record<string, unknown>;

    Object.values(decodedJson).forEach((jsonValue) => {
      const parsedResource =
        FhirManufacturedItemDefinition.parse(jsonValue).value;
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      );
    });
  });
});
