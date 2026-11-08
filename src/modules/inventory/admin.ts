/**
 * Admin writes and reads for inventory-owned tables: website allotment (A2) and online/offline by
 * date through `blackout_dates` (A3). Called only through `@/modules/admin`. Every function checks
 * the actor's capability and validates with Zod itself.
 *
 * Stock invariants: `sold + held <= allotment` (table CHECK) and `allotment <= total_units` are
 * enforced by the conditional update, never by a read-then-write. Inventory rows are locked in
 * `(room_type_id, date)` order in one statement, exactly like the hold path (01 Lock order), so an
 * admin edit and a hold queue on the same rows instead of deadlocking.
 */
import { sql, type SQL } from "drizzle-orm";
import type { Err, Ok } from "@/lib/result";
import { getDb, type Db, type Tx } from "@/lib/db";
import { addDays } from "@/lib/dates";
import { can } from "@/lib/auth/permissions";
import { releaseExpiredHoldsForAvailability } from "@/modules/booking/internal";
import { windowError, type AdminActor } from "@/modules/admin/rules";
export { rejectionMessage } from "@/modules/admin/rules";
import {
  fieldErrors,
  setAllotmentInputSchema,
  type SetAllotmentInput,
} from "@/modules/admin/schemas";

type AdminInvalid = Err<"INVALID_INPUT", { errors: Record<string, string> }>;
type Forbidden = Err<"FORBIDDEN">;

function uuidArray(ids: string[]) {
  return sql`ARRAY[${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )}]::uuid[]`;
}

function intArray(xs: readonly number[]) {
  return sql`ARRAY[${sql.join(
    xs.map((x) => sql`${x}::int`),
    sql`, `,
  )}]::int[]`;
}

// ---- A2 allotment ------------------------------------------------------------------------------

export type RejectedAllotment = {
  roomTypeId: string;
  date: string;
  requested: number;
  /** sold + held: the lowest allotment allowed on this date. */
  min: number;
  /** room_types.total_units: the highest allotment allowed. */
  cap: number;
  reason: "BELOW_COMMITTED" | "ABOVE_TOTAL";
};

export type SetAllotmentResult =
  Ok<{ updated: number; rejected: RejectedAllotment[] }> | AdminInvalid | Forbidden;

/**
 * Sets website allotment for cells or a range. One transaction:
 * 1. insert missing inventory rows inside the horizon (allotment 0, sold 0, held 0);
 * 2. lock every target row in one statement ordered by (room_type_id, date);
 * 3. one conditional `UPDATE ... WHERE sold + held <= new AND new <= total_units RETURNING`;
 * 4. report the targets that did not update, with the minimum (sold + held) and the cap.
 * Other dates in the same request still apply. Expired holds in the range are released first
 * (booking-owned, its own transaction) so stale holds do not block a cut.
 */
export async function setAllotment(
  input: SetAllotmentInput,
  actor: AdminActor,
  opts: { db?: Db; now?: Date } = {},
): Promise<SetAllotmentResult> {
  if (!can(actor.role, "allotment.edit")) return { ok: false, code: "FORBIDDEN" };
  const parsed = setAllotmentInputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, code: "INVALID_INPUT", errors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const dates = v.mode === "cells" ? v.cells.map((c) => c.date).sort() : [v.from, v.to];
  const first = dates[0];
  const last = dates[dates.length - 1];
  const outside = windowError(first, last, opts.now);
  if (outside) return { ok: false, code: "INVALID_INPUT", errors: { form: outside } };

  const types = v.mode === "cells" ? [...new Set(v.cells.map((c) => c.roomTypeId))] : v.roomTypeIds;
  await releaseExpiredHoldsForAvailability({
    roomTypeId: types.length === 1 ? types[0] : undefined,
    checkIn: first,
    checkOut: addDays(last, 1),
  });

  // Targets (room_type_id, date, allotment) of known room types; re-emitted in each statement.
  const targets: SQL =
    v.mode === "cells"
      ? sql`SELECT v.room_type_id, v.date, v.allotment
          FROM (VALUES ${sql.join(
            v.cells.map((c) => sql`(${c.roomTypeId}::uuid, ${c.date}::date, ${c.allotment}::int)`),
            sql`, `,
          )}) AS v(room_type_id, date, allotment)
          JOIN room_types r ON r.id = v.room_type_id`
      : sql`SELECT r.id AS room_type_id, d::date AS date, ${v.allotment}::int AS allotment
          FROM room_types r
          CROSS JOIN generate_series(${v.from}::date, ${v.to}::date, interval '1 day') AS d
          WHERE r.id = ANY(${uuidArray(v.roomTypeIds)})
            AND extract(dow FROM d)::int = ANY(${intArray(v.days)})`;

  const db = opts.db ?? getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`
      INSERT INTO inventory (room_type_id, date, allotment, sold, held)
      SELECT t.room_type_id, t.date, 0, 0, 0 FROM (${targets}) AS t
      ORDER BY t.room_type_id, t.date
      ON CONFLICT (room_type_id, date) DO NOTHING
    `);
    await lockTargets(tx, targets);
    const updated = await tx.execute(sql`
      UPDATE inventory i SET allotment = t.allotment, updated_at = clock_timestamp()
      FROM (${targets}) AS t, room_types r
      WHERE i.room_type_id = t.room_type_id AND i.date = t.date AND r.id = i.room_type_id
        AND i.sold + i.held <= t.allotment AND t.allotment <= r.total_units
      RETURNING i.room_type_id
    `);
    const rejected = await tx.execute<{
      room_type_id: string;
      date: string;
      requested: number;
      committed: number;
      cap: number;
    }>(sql`
      SELECT i.room_type_id, i.date::text AS date, t.allotment AS requested,
        (i.sold + i.held)::int AS committed, r.total_units AS cap
      FROM (${targets}) AS t
      JOIN inventory i ON i.room_type_id = t.room_type_id AND i.date = t.date
      JOIN room_types r ON r.id = i.room_type_id
      WHERE i.allotment <> t.allotment
      ORDER BY i.room_type_id, i.date
    `);
    return {
      ok: true,
      updated: updated.length,
      rejected: rejected.map((r) => ({
        roomTypeId: r.room_type_id,
        date: r.date,
        requested: r.requested,
        min: r.committed,
        cap: r.cap,
        reason: r.requested > r.cap ? "ABOVE_TOTAL" : "BELOW_COMMITTED",
      })),
    } satisfies SetAllotmentResult;
  });
}

/** One statement, ordered like the hold path: (room_type_id, date) ascending. */
async function lockTargets(tx: Tx, targets: SQL) {
  await tx.execute(sql`
    SELECT i.room_type_id FROM inventory i
    JOIN (${targets}) AS t ON t.room_type_id = i.room_type_id AND t.date = i.date
    ORDER BY i.room_type_id, i.date FOR UPDATE OF i
  `);
}

export type AllotmentGridRow = {
  roomTypeId: string;
  name: string;
  totalUnits: number;
  /** date -> stock; a missing date has no inventory row (sells nothing). */
  nights: Record<string, { allotment: number; sold: number; held: number }>;
};

export type BlackoutRow = {
  id: string;
  /** null = all room types. */
  roomTypeId: string | null;
  startDate: string;
  endDate: string;
  reason: string | null;
};

/** Allotment grid for `from` to `to` inclusive, plus blackouts overlapping it. */
export async function readAllotment(
  input: { from: string; to: string },
  actor: AdminActor,
  opts: { db?: Db } = {},
): Promise<Ok<{ rows: AllotmentGridRow[]; blackouts: BlackoutRow[] }> | Forbidden> {
  if (!can(actor.role, "allotment.edit") && !can(actor.role, "availability.toggle"))
    return { ok: false, code: "FORBIDDEN" };
  const db = opts.db ?? getDb();
  const [rows, blackouts] = await Promise.all([
    db.execute<{
      id: string;
      name: string;
      total_units: number;
      nights: AllotmentGridRow["nights"] | null;
    }>(sql`
      SELECT r.id, r.name, r.total_units,
        (SELECT jsonb_object_agg(i.date::text, jsonb_build_object(
            'allotment', i.allotment, 'sold', i.sold, 'held', i.held))
          FROM inventory i WHERE i.room_type_id = r.id
            AND i.date BETWEEN ${input.from}::date AND ${input.to}::date) AS nights
      FROM room_types r ORDER BY r.sort, r.name
    `),
    readBlackouts(db, input.from, input.to),
  ]);
  return {
    ok: true,
    rows: rows.map((r) => ({
      roomTypeId: r.id,
      name: r.name,
      totalUnits: r.total_units,
      nights: r.nights ?? {},
    })),
    blackouts,
  };
}

async function readBlackouts(db: Db | Tx, from: string, to: string): Promise<BlackoutRow[]> {
  const rows = await db.execute<BlackoutRow>(sql`
    SELECT id, room_type_id AS "roomTypeId", start_date::text AS "startDate",
      end_date::text AS "endDate", reason
    FROM blackout_dates
    WHERE start_date <= ${to}::date AND end_date >= ${from}::date
    ORDER BY start_date, room_type_id NULLS FIRST
  `);
  return [...rows];
}
