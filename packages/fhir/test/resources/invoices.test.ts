// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import fs from "fs";
import { expectTypeOf } from "expect-type";
import type { Invoice } from "fhir/r4b.js";
import type { z } from "zod";
import { FhirInvoice, type untypedInvoiceSchema } from "../../src/index.js";
import { jsonStringifyDeterministically } from "./testHelpers.js";

describe("Invoice Resource", () => {
  it("should validate FHIR Invoices from invoices.json", () => {
    type Schema = z.infer<typeof untypedInvoiceSchema>;
    expectTypeOf<Schema>().toExtend<Invoice>();
    expectTypeOf<Invoice>().toExtend<Schema>();

    const data = fs.readFileSync("test/resources/invoices.json", "utf-8");
    const decodedJson = JSON.parse(data) as Record<string, unknown>;

    Object.values(decodedJson).forEach((jsonValue) => {
      const parsedResource = FhirInvoice.parse(jsonValue).value;
      expect(jsonStringifyDeterministically(jsonValue)).toBe(
        jsonStringifyDeterministically(parsedResource),
      );
    });
  });
});
