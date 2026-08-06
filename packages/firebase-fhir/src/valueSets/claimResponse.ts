//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { z } from 'zod'

/**
 * Zod schema for FHIR NoteType value set.
 * The type of note.
 */
export const noteTypeSchema = z.enum(['display', 'print', 'printoper'])
