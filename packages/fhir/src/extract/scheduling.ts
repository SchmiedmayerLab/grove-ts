//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { codeableConceptDisplay } from './coding.js'
import { asDate, field } from './internal.js'

/**
 * The start of an Appointment or a Slot.
 *
 * Both state `start` and `end` as instants directly rather than as a Period, so one pair of
 * accessors serves them and anything else shaped the same way.
 */
export const scheduledStart = (resource: unknown): Date | undefined =>
  asDate(field(resource, 'start'))

/** The end of an Appointment or a Slot. */
export const scheduledEnd = (resource: unknown): Date | undefined =>
  asDate(field(resource, 'end'))

/** The milliseconds a scheduled slot spans, stated only when it names both ends. */
export const scheduledDuration = (resource: unknown): number | undefined => {
  const start = scheduledStart(resource)
  const end = scheduledEnd(resource)
  if (start === undefined || end === undefined) return undefined
  return end.getTime() - start.getTime()
}

/**
 * Whether a scheduled slot has already ended.
 *
 * The end decides it, not the start: an appointment under way has begun but is not past. One
 * stating no end is judged by its start, and one stating neither cannot be placed in time at all.
 */
export const scheduledIsPast = (
  resource: unknown,
  asOf: Date = new Date(),
): boolean | undefined => {
  const at = scheduledEnd(resource) ?? scheduledStart(resource)
  return at === undefined ? undefined : at < asOf
}

/** Whether a scheduled slot has not started yet. */
export const scheduledIsUpcoming = (
  resource: unknown,
  asOf: Date = new Date(),
): boolean | undefined => {
  const start = scheduledStart(resource)
  return start === undefined ? undefined : start > asOf
}

/** Whether a scheduled slot covers an instant, inclusive at both ends. */
export const scheduledCovers = (
  resource: unknown,
  asOf: Date = new Date(),
): boolean => {
  const start = scheduledStart(resource)
  const end = scheduledEnd(resource)
  if (start === undefined || end === undefined) return false
  return asOf >= start && asOf <= end
}

/** The displays a Slot's specialties are named by. */
export const slotSpecialtyDisplays = (slot: unknown): readonly string[] => {
  const specialties = field(slot, 'specialty')
  if (!Array.isArray(specialties)) return []
  return specialties
    .map((specialty) => codeableConceptDisplay(specialty))
    .filter((display): display is string => display !== undefined)
}

/** The display an Appointment's service type is named by. */
export const appointmentServiceTypeDisplay = (
  appointment: unknown,
): string | undefined => {
  const types = field(appointment, 'serviceType')
  if (!Array.isArray(types)) return undefined
  return types
    .map((type) => codeableConceptDisplay(type))
    .find((display): display is string => display !== undefined)
}
