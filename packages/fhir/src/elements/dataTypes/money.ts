//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type Money } from "fhir/r4b.js";
import { z, type ZodType } from "zod";
import { elementSchema } from "../element.js";
import { codeSchema, decimalSchema } from "./primitiveTypes.js";

/**
 * Zod schema for FHIR Money data type.
 */
export const untypedMoneySchema = z.lazy(() =>
  elementSchema.extend({
    value: decimalSchema.optional(),
    currency: codeSchema.optional(),
    _currency: elementSchema.optional(),
  }),
) satisfies ZodType<Money>;

/**
 * Zod schema for FHIR Money data type.
 */
export const moneySchema: ZodType<Money> = untypedMoneySchema;
