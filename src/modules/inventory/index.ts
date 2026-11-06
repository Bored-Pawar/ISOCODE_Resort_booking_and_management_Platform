/**
 * FROZEN CONTRACT (C1). LOCKED AREA. Stub returns fixtures until B2.
 * Availability is read-only here; holds are taken only through booking.acquireHold.
 */
import { z } from "zod";
import type { Err, Ok } from "@/lib/result";
import { isDateStr } from "@/lib/dates";
import { availabilityFixture } from "./fixtures";

const dateStr = z.string().refine(isDateStr, "Expected a YYYY-MM-DD date");

export const availabilityInputSchema = z
  .object({
    roomTypeId: z.string().min(1).optional(),
    checkIn: dateStr,
    checkOut: dateStr,
    /** MVP enforces 1; kept generic per 01-booking-core. */
    units: z.number().int().min(1).max(1).default(1),
  })
  .refine((v) => v.checkOut > v.checkIn, { message: "checkOut must be after checkIn" });
export type AvailabilityInput = z.input<typeof availabilityInputSchema>;

export type RoomAvailability = {
  roomTypeId: string;
  /** Minimum of (allotment - sold - held) across all requested nights. */
  availableUnits: number;
  soldOut: boolean;
  blackedOut: boolean;
};

export type AvailabilityResult = Ok<{ rooms: RoomAvailability[] }> | Err<"INVALID_INPUT">;

export const inventory = {
  async availability(input: AvailabilityInput): Promise<AvailabilityResult> {
    const parsed = availabilityInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
    const { roomTypeId } = parsed.data;
    const rooms = roomTypeId
      ? availabilityFixture.filter((r) => r.roomTypeId === roomTypeId)
      : availabilityFixture;
    return { ok: true, rooms };
  },
};
