import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Db, Tx } from "@/lib/db";
import { nightsBetween } from "@/lib/dates";
import type { AvailabilityInput, RoomAvailability } from "./index";

/** Include rooms with missing stock rows: an incomplete range is unavailable, never omitted. */
export async function readAvailability(
  db: Db | Tx,
  input: AvailabilityInput,
): Promise<RoomAvailability[]> {
  if (input.roomTypeId && !z.uuid().safeParse(input.roomTypeId).success) return [];
  const roomFilter = input.roomTypeId ? sql`WHERE r.id = ${input.roomTypeId}::uuid` : sql``;
  const nights = nightsBetween(input.checkIn, input.checkOut);
  const rows = await db.execute<{
    room_type_id: string;
    available_units: number;
    blacked_out: boolean;
  }>(sql`
    SELECT r.id AS room_type_id,
      CASE WHEN count(i.date) = ${nights} THEN min(i.allotment - i.sold - i.held) ELSE 0 END::int
        AS available_units,
      EXISTS (SELECT 1 FROM blackout_dates b
        WHERE (b.room_type_id IS NULL OR b.room_type_id = r.id)
          AND b.start_date < ${input.checkOut}::date AND b.end_date >= ${input.checkIn}::date)
        AS blacked_out
    FROM room_types r LEFT JOIN inventory i ON i.room_type_id = r.id
      AND i.date >= ${input.checkIn}::date AND i.date < ${input.checkOut}::date
    ${roomFilter}
    GROUP BY r.id ORDER BY r.sort, r.id
  `);
  return rows.map((r) => ({
    roomTypeId: r.room_type_id,
    availableUnits: r.available_units,
    soldOut: r.blacked_out || r.available_units < (input.units ?? 1),
    blackedOut: r.blacked_out,
  }));
}
