//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from "fs";
import { expectTypeOf } from "expect-type";
import type { EpisodeOfCare } from "fhir/r4b.js";
import type { z } from "zod";
import {
  FhirEpisodeOfCare,
  type untypedEpisodeOfCareSchema,
} from "../../src/index.js";
import { jsonStringifyDeterministically } from "./testHelpers.js";

describe("EpisodeOfCare Resource", () => {
  it("should validate FHIR episodeOfCare from episodeOfCares.json", () => {
    type Schema = z.infer<typeof untypedEpisodeOfCareSchema>;
    expectTypeOf<Schema>().toExtend<EpisodeOfCare>();
    expectTypeOf<EpisodeOfCare>().toExtend<Schema>();

    const data = fs.readFileSync("test/resources/episodeOfCares.json", "utf-8");
    const decodedJson = JSON.parse(data) as Record<string, unknown>;

    Object.values(decodedJson).forEach((jsonValue) => {
      const parsedResource = FhirEpisodeOfCare.parse(jsonValue).value;
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      );
    });
  });
});
