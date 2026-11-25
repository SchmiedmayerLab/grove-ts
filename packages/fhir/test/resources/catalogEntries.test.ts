//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from "fs";
import { expectTypeOf } from "expect-type";
import type { CatalogEntry } from "fhir/r4b.js";
import type { z } from "zod";
import {
  FhirCatalogEntry,
  type untypedCatalogEntrySchema,
} from "../../src/index.js";
import { jsonStringifyDeterministically } from "./testHelpers.js";

describe("CatalogEntry Resource", () => {
  it("should validate FHIR catalog entry from catalogEntries.json", () => {
    type Schema = z.infer<typeof untypedCatalogEntrySchema>;
    expectTypeOf<Schema>().toExtend<CatalogEntry>();
    expectTypeOf<CatalogEntry>().toExtend<Schema>();

    const data = fs.readFileSync("test/resources/catalogEntries.json", "utf-8");
    const decodedJson = JSON.parse(data) as Record<string, unknown>;

    Object.values(decodedJson).forEach((jsonValue) => {
      const parsedResource = FhirCatalogEntry.parse(jsonValue).value;
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      );
    });
  });
});
