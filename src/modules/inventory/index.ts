/**
 * FROZEN CONTRACT (C1). LOCKED AREA. Database availability with lazy expiry.
 * Booking owns the scoped lazy-expiry transaction; availability then reads stock.
 */
import { z } from "zod";
import type { Err, Ok } from "@/lib/result";
import { isDateStr } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { releaseExpiredHoldsForAvailability } from "@/modules/booking/internal";
import { readAvailability } from "./read";

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
    if (parsed.data.roomTypeId && !z.uuid().safeParse(parsed.data.roomTypeId).success) {
      return { ok: true, rooms: [] };
    }
    const { roomTypeId, checkIn, checkOut } = parsed.data;
    await releaseExpiredHoldsForAvailability({ roomTypeId, checkIn, checkOut });
    const rooms = await readAvailability(getDb(), parsed.data);
    return { ok: true, rooms };
  },
};
