//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from "fs";
import { expectTypeOf } from "expect-type";
import type { DocumentManifest } from "fhir/r4b.js";
import type { z } from "zod";
import {
  FhirDocumentManifest,
  type untypedDocumentManifestSchema,
} from "../../src/index.js";
import { jsonStringifyDeterministically } from "./testHelpers.js";

describe("DocumentManifest Resource", () => {
  it("should validate FHIR document manifest from documentManifests.json", () => {
    type Schema = z.infer<typeof untypedDocumentManifestSchema>;
    expectTypeOf<Schema>().toExtend<DocumentManifest>();
    expectTypeOf<DocumentManifest>().toExtend<Schema>();

    const data = fs.readFileSync(
      "test/resources/documentManifests.json",
      "utf-8",
    );
    const decodedJson = JSON.parse(data) as Record<string, unknown>;

    Object.values(decodedJson).forEach((jsonValue) => {
      const parsedResource = FhirDocumentManifest.parse(jsonValue).value;
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      );
    });
  });
});
