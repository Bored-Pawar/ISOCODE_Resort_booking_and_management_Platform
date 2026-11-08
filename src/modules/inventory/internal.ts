/**
 * INTERNAL, transaction-aware inventory helpers for the booking module only (R01).
 * Not exported from index.ts and never imported by UI. Helpers never commit.
 * See docs/01-booking-core.md, "Contracts", and docs/s2-multiroom-change.md section 4.
 */
import type { Tx } from "@/lib/db";
import type { Err, Ok } from "@/lib/result";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { nightsBetween } from "@/lib/dates";

export type LockedNight = {
  date: string;
  allotment: number;
  sold: number;
  held: number;
  blackedOut: boolean;
};

/** Units of one room type a cart needs on every night (B10: the number of lines of that type). */
export type Demand = { roomTypeId: string; units: number };

export type LockNightsInput = {
  checkIn: string;
  checkOut: string;
  /** Repeated room types are merged. Order does not matter: locks are ordered in SQL. */
  demand: Demand[];
};

/** Nights per room type, each list in date order. */
export type LockNightsResult =
  | Ok<{ nights: Record<string, LockedNight[]> }>
  | Err<"SOLD_OUT" | "BLACKOUT", { roomTypeId?: string }>;

const uuid = z.uuid();

/** Sums units per room type, keeping the first-seen order for deterministic error reporting. */
export function mergeDemand(demand: Demand[]): Demand[] {
  const merged = new Map<string, number>();
  for (const d of demand) {
    const id = d.roomTypeId.toLowerCase();
    merged.set(id, (merged.get(id) ?? 0) + d.units);
  }
  return [...merged].map(([roomTypeId, units]) => ({ roomTypeId, units }));
}

function uuidArray(ids: string[]) {
  return sql`ARRAY[${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )}]`;
}

/**
 * Locks every required (room_type_id, date) row in ONE statement, ordered by
 * (room_type_id, date) in SQL, never per type in JS (B10 rule 4). All or nothing across types:
 * a blackout on any type rejects the cart with BLACKOUT; a missing row or
 * allotment - sold - held < units on any night of any type rejects it with SOLD_OUT.
 * Takes no stock itself. Locks are held until the caller's transaction ends.
 */
export async function lockNights(tx: Tx, input: LockNightsInput): Promise<LockNightsResult> {
  const demand = mergeDemand(input.demand);
  if (!demand.length) return { ok: false, code: "SOLD_OUT" };
  const invalid = demand.find((d) => !uuid.safeParse(d.roomTypeId).success);
  if (invalid) return { ok: false, code: "SOLD_OUT", roomTypeId: invalid.roomTypeId };
  const types = uuidArray(demand.map((d) => d.roomTypeId));
  const rows = await tx.execute<{
    room_type_id: string;
    date: string;
    allotment: number;
    sold: number;
    held: number;
  }>(sql`
    SELECT room_type_id, date::text, allotment, sold, held FROM inventory
    WHERE room_type_id = ANY(${types})
      AND date >= ${input.checkIn}::date AND date < ${input.checkOut}::date
    ORDER BY room_type_id, date FOR UPDATE
  `);
  const blackouts = await tx.execute<{ room_type_id: string | null }>(sql`
    SELECT room_type_id FROM blackout_dates
    WHERE (room_type_id IS NULL OR room_type_id = ANY(${types}))
      AND start_date < ${input.checkOut}::date AND end_date >= ${input.checkIn}::date
  `);
  if (blackouts.length) {
    const typed = demand.find((d) => blackouts.some((b) => b.room_type_id === d.roomTypeId));
    return typed
      ? { ok: false, code: "BLACKOUT", roomTypeId: typed.roomTypeId }
      : { ok: false, code: "BLACKOUT" };
  }
  const nightCount = nightsBetween(input.checkIn, input.checkOut);
  const nights: Record<string, LockedNight[]> = {};
  for (const r of rows)
    (nights[r.room_type_id] ??= []).push({
      date: r.date,
      allotment: r.allotment,
      sold: r.sold,
      held: r.held,
      blackedOut: false,
    });
  for (const d of demand) {
    const list = nights[d.roomTypeId] ?? [];
    if (list.length !== nightCount || list.some((n) => n.allotment - n.sold - n.held < d.units))
      return { ok: false, code: "SOLD_OUT", roomTypeId: d.roomTypeId };
  }
  return { ok: true, nights };
}

export type NightChange = {
  roomTypeId: string;
  dates: string[];
  /** Added to inventory.held on every date (negative to release). */
  heldDelta: number;
  /** Added to inventory.sold on every date (negative on staff cancel). */
  soldDelta: number;
};

export type AdjustNightsInput = { changes: NightChange[] };

/** Lock a batch across room types before an expiry batch changes any inventory. */
export async function lockInventoryRows(
  tx: Tx,
  rows: { roomTypeId: string; date: string }[],
): Promise<void> {
  if (!rows.length) return;
  const tuples = sql.join(
    rows.map((r) => sql`(${r.roomTypeId}::uuid, ${r.date}::date)`),
    sql`, `,
  );
  await tx.execute(sql`SELECT room_type_id, date FROM inventory
    WHERE (room_type_id, date) IN (VALUES ${tuples})
    ORDER BY room_type_id, date FOR UPDATE`);
}

/**
 * Applies every change across room types in aggregate: deltas are summed per (type, date), the
 * rows are locked in one statement ordered by (room_type_id, date), then updated in one statement.
 * The table CHECKs (including sold + held <= allotment) are the last line of defence: a violation
 * throws, which rolls back the caller's transaction. Call lockNights first on the hold path.
 */
export async function adjustNights(tx: Tx, input: AdjustNightsInput): Promise<void> {
  const cells = new Map<string, { roomTypeId: string; date: string; held: number; sold: number }>();
  for (const c of input.changes)
    for (const date of new Set(c.dates)) {
      const roomTypeId = c.roomTypeId.toLowerCase();
      const key = `${roomTypeId}|${date}`;
      const cell = cells.get(key) ?? { roomTypeId, date, held: 0, sold: 0 };
      cell.held += c.heldDelta;
      cell.sold += c.soldDelta;
      cells.set(key, cell);
    }
  if (!cells.size) return;
  const list = [...cells.values()];
  await lockInventoryRows(tx, list);
  const values = sql.join(
    list.map((c) => sql`(${c.roomTypeId}::uuid, ${c.date}::date, ${c.held}::int, ${c.sold}::int)`),
    sql`, `,
  );
  const rows = await tx.execute(sql`
    UPDATE inventory i SET held = i.held + v.held_delta, sold = i.sold + v.sold_delta,
      updated_at = clock_timestamp()
    FROM (VALUES ${values}) AS v(room_type_id, date, held_delta, sold_delta)
    WHERE i.room_type_id = v.room_type_id AND i.date = v.date
    RETURNING i.room_type_id
  `);
  if (rows.length !== list.length) throw new Error("Missing inventory rows for adjustment");
}
