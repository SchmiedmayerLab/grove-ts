//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from "fs";
import { expectTypeOf } from "expect-type";
import type { RelatedPerson } from "fhir/r4b.js";
import type { z } from "zod";
import {
  FhirRelatedPerson,
  type untypedRelatedPersonSchema,
} from "../../src/index.js";
import { jsonStringifyDeterministically } from "./testHelpers.js";

describe("RelatedPerson Resource", () => {
  it("should validate FHIR relatedPerson from relatedPersons.json", () => {
    type Schema = z.infer<typeof untypedRelatedPersonSchema>;
    expectTypeOf<Schema>().toExtend<RelatedPerson>();
    expectTypeOf<RelatedPerson>().toExtend<Schema>();

    const data = fs.readFileSync("test/resources/relatedPersons.json", "utf-8");
    const decodedJson = JSON.parse(data) as Record<string, unknown>;

    Object.values(decodedJson).forEach((jsonValue) => {
      const parsedResource = FhirRelatedPerson.parse(jsonValue).value;
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      );
    });
  });
});
