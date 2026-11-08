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
  setOfflineInputSchema,
  setOnlineInputSchema,
  type SetAllotmentInput,
  type SetOfflineInput,
  type SetOnlineInput,
} from "@/modules/admin/schemas";
import { booking, type Booking } from "@/modules/booking";

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

// ---- A3 online / offline -----------------------------------------------------------------------

/** Most bookings the warning lists; beyond this it says the list is incomplete. */
export const WARNING_CAP = 1_000;
const WARNING_PAGE = 200;

export type AffectedBooking = Pick<Booking, "id" | "ref" | "status" | "checkIn" | "checkOut"> & {
  /** Lines of the chosen room type (all lines for all rooms). */
  rooms: number;
};

/**
 * Live bookings (HELD, not yet expired, or CONFIRMED) with a night inside `from`..`to` for the
 * room type (or any room type). They stand: going offline blocks only new holds. Read through the
 * approved booking read `listOverlappingForStaff` (overlap and room filter in SQL before the
 * limit), paged until complete. `truncated` is true when more than WARNING_CAP overlap: the list is
 * then the first WARNING_CAP by check-in, and must not be read as complete (audit M03).
 */
export async function bookingsInRange(
  input: { roomTypeId: string | null; from: string; to: string },
  actor: AdminActor,
): Promise<Ok<{ bookings: AffectedBooking[]; truncated: boolean }> | AdminInvalid | Forbidden> {
  if (!can(actor.role, "availability.toggle")) return { ok: false, code: "FORBIDDEN" };
  const parsed = setOnlineInputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, code: "INVALID_INPUT", errors: fieldErrors(parsed.error) };
  const { roomTypeId, from, to } = parsed.data;
  const found: AffectedBooking[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await booking.listOverlappingForStaff(
      { roomTypeId: roomTypeId ?? undefined, from, to, limit: WARNING_PAGE, cursor },
      { userId: actor.userId, role: actor.role },
    );
    if (!page.ok)
      return page.code === "FORBIDDEN"
        ? { ok: false, code: "FORBIDDEN" }
        : { ok: false, code: "INVALID_INPUT", errors: { form: "Check the dates and room." } };
    for (const b of page.bookings) {
      const lines = b.rooms.filter((r) => roomTypeId === null || r.roomTypeId === roomTypeId);
      found.push({
        id: b.id,
        ref: b.ref,
        status: b.status,
        checkIn: b.checkIn,
        checkOut: b.checkOut,
        rooms: lines.length,
      });
    }
    if (!page.nextCursor)
      return {
        ok: true,
        bookings: found.slice(0, WARNING_CAP),
        truncated: found.length > WARNING_CAP,
      };
    if (found.length >= WARNING_CAP)
      return { ok: true, bookings: found.slice(0, WARNING_CAP), truncated: true };
    cursor = page.nextCursor;
  }
}

/**
 * Blackout edits run one at a time: the first statement of `setOffline` and `setOnline`.
 * Without it, an edit whose inventory range does not overlap another's can still race on the
 * same blackout row (one merges it away while the other's FOR UPDATE skips the deleted row), so a
 * "bring online" could be lost (S2 admin review, major 1). Holds never take this lock, so the
 * order stays: advisory lock, then inventory in (room_type_id, date) order.
 */
async function lockBlackoutEdits(tx: Tx) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('admin:blackout_dates', 0))`);
}

/**
 * Creates the missing stock rows of a blackout range (allotment, sold, held 0; they sell nothing,
 * like a missing row) in (room_type_id, date) order, the same insert A2 does. A row created here is
 * not visible to others until commit, and A2's insert of the same key waits on it, so A2 cannot
 * make a date sellable between our lock step and the blackout commit (audit M02).
 */
async function ensureRange(tx: Tx, roomTypeId: string | null, from: string, to: string) {
  const scope = roomTypeId ? sql`WHERE r.id = ${roomTypeId}::uuid` : sql``;
  await tx.execute(sql`
    INSERT INTO inventory (room_type_id, date, allotment, sold, held)
    SELECT r.id, d::date, 0, 0, 0
    FROM room_types r
    CROSS JOIN generate_series(${from}::date, ${to}::date, interval '1 day') AS d
    ${scope}
    ORDER BY r.id, d
    ON CONFLICT (room_type_id, date) DO NOTHING
  `);
}

/** Locks the stock rows a blackout change covers, ordered like the hold path. */
async function lockRange(tx: Tx, roomTypeId: string | null, from: string, to: string) {
  const scope = roomTypeId ? sql`AND room_type_id = ${roomTypeId}::uuid` : sql``;
  await tx.execute(sql`
    SELECT room_type_id FROM inventory
    WHERE date BETWEEN ${from}::date AND ${to}::date ${scope}
    ORDER BY room_type_id, date FOR UPDATE
  `);
}

const sameScope = (roomTypeId: string | null) =>
  roomTypeId ? sql`room_type_id = ${roomTypeId}::uuid` : sql`room_type_id IS NULL`;

const BLACKOUT_COLUMNS = sql`id, room_type_id AS "roomTypeId", start_date::text AS "startDate",
  end_date::text AS "endDate", reason`;

export type SetOfflineResult =
  Ok<{ blackout: BlackoutRow; merged: number }> | AdminInvalid | Err<"NOT_FOUND"> | Forbidden;

/**
 * Takes a room type (or all rooms, `roomTypeId: null`) offline from `from` to `to` inclusive by
 * writing a blackout with a reason. Blackouts of the same scope that overlap or touch the range
 * are merged into one row (their reasons kept). Missing stock rows in the range are created
 * (allotment 0) and every stock row in the range is locked first, in (room_type_id, date) order,
 * so a hold already past its blackout check commits before this, and every later hold (also on a
 * date A2 creates meanwhile) sees the blackout (BLACKOUT). Existing bookings stand.
 */
export async function setOffline(
  input: SetOfflineInput,
  actor: AdminActor,
  opts: {
    db?: Db;
    now?: Date;
    /** Test seam: runs after the range is locked, before the blackout is written. */
    afterLock?: () => Promise<void>;
  } = {},
): Promise<SetOfflineResult> {
  if (!can(actor.role, "availability.toggle")) return { ok: false, code: "FORBIDDEN" };
  const parsed = setOfflineInputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, code: "INVALID_INPUT", errors: fieldErrors(parsed.error) };
  const { roomTypeId, from, to, reason } = parsed.data;
  const outside = windowError(from, to, opts.now);
  if (outside) return { ok: false, code: "INVALID_INPUT", errors: { form: outside } };
  const db = opts.db ?? getDb();
  return db.transaction(async (tx) => {
    await lockBlackoutEdits(tx);
    if (roomTypeId) {
      const known = await tx.execute(sql`SELECT 1 FROM room_types WHERE id = ${roomTypeId}::uuid`);
      if (!known.length) return { ok: false, code: "NOT_FOUND" } as const;
    }
    await ensureRange(tx, roomTypeId, from, to);
    await lockRange(tx, roomTypeId, from, to);
    await opts.afterLock?.();
    const touching = await tx.execute<BlackoutRow>(sql`
      SELECT ${BLACKOUT_COLUMNS} FROM blackout_dates
      WHERE ${sameScope(roomTypeId)}
        AND start_date <= ${addDays(to, 1)}::date AND end_date >= ${addDays(from, -1)}::date
      ORDER BY start_date FOR UPDATE
    `);
    const start = [from, ...touching.map((b) => b.startDate)].sort()[0];
    const end = [to, ...touching.map((b) => b.endDate)].sort().at(-1)!;
    const reasons = [...new Set([...touching.map((b) => b.reason ?? ""), reason])].filter(Boolean);
    if (touching.length)
      await tx.execute(
        sql`DELETE FROM blackout_dates WHERE id = ANY(${uuidArray(touching.map((b) => b.id))})`,
      );
    const [row] = await tx.execute<BlackoutRow>(sql`
      INSERT INTO blackout_dates (room_type_id, start_date, end_date, reason, created_by)
      VALUES (${roomTypeId}::uuid, ${start}::date, ${end}::date, ${reasons.join("; ").slice(0, 500)},
        ${actor.userId}::uuid)
      RETURNING ${BLACKOUT_COLUMNS}
    `);
    return { ok: true, blackout: row, merged: touching.length } as const;
  });
}

export type SetOnlineResult =
  | Ok<{ removed: number; trimmed: number; split: number }>
  | AdminInvalid
  | Err<"ALL_ROOMS_OFFLINE", { blackout: BlackoutRow }>
  | Forbidden;

/**
 * Brings a room type (or all rooms) back online from `from` to `to` inclusive: blackouts of the
 * same scope inside the range are deleted, ones over an edge are trimmed, and one covering the
 * range on both sides is split in two. A room type inside an all-rooms blackout is refused with
 * ALL_ROOMS_OFFLINE and nothing changes (bring all rooms online for those dates first).
 */
export async function setOnline(
  input: SetOnlineInput,
  actor: AdminActor,
  opts: { db?: Db; now?: Date } = {},
): Promise<SetOnlineResult> {
  if (!can(actor.role, "availability.toggle")) return { ok: false, code: "FORBIDDEN" };
  const parsed = setOnlineInputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, code: "INVALID_INPUT", errors: fieldErrors(parsed.error) };
  const { roomTypeId, from, to } = parsed.data;
  const outside = windowError(from, to, opts.now);
  if (outside) return { ok: false, code: "INVALID_INPUT", errors: { form: outside } };
  const db = opts.db ?? getDb();
  return db.transaction(async (tx) => {
    await lockBlackoutEdits(tx);
    await lockRange(tx, roomTypeId, from, to);
    if (roomTypeId) {
      const all = await tx.execute<BlackoutRow>(sql`
        SELECT ${BLACKOUT_COLUMNS} FROM blackout_dates
        WHERE room_type_id IS NULL AND start_date <= ${to}::date AND end_date >= ${from}::date
        ORDER BY start_date LIMIT 1
      `);
      if (all.length) return { ok: false, code: "ALL_ROOMS_OFFLINE", blackout: all[0] } as const;
    }
    const overlapping = await tx.execute<BlackoutRow>(sql`
      SELECT ${BLACKOUT_COLUMNS} FROM blackout_dates
      WHERE ${sameScope(roomTypeId)} AND start_date <= ${to}::date AND end_date >= ${from}::date
      ORDER BY start_date FOR UPDATE
    `);
    let removed = 0;
    let trimmed = 0;
    let split = 0;
    for (const b of overlapping) {
      const keepLeft = b.startDate < from;
      const keepRight = b.endDate > to;
      if (!keepLeft && !keepRight) {
        await tx.execute(sql`DELETE FROM blackout_dates WHERE id = ${b.id}::uuid`);
        removed += 1;
        continue;
      }
      if (keepLeft)
        await tx.execute(
          sql`UPDATE blackout_dates SET end_date = ${addDays(from, -1)}::date WHERE id = ${b.id}::uuid`,
        );
      if (keepLeft && keepRight) {
        await tx.execute(sql`
          INSERT INTO blackout_dates (room_type_id, start_date, end_date, reason, created_by)
          VALUES (${b.roomTypeId}::uuid, ${addDays(to, 1)}::date, ${b.endDate}::date, ${b.reason},
            ${actor.userId}::uuid)
        `);
        split += 1;
        continue;
      }
      if (keepRight)
        await tx.execute(
          sql`UPDATE blackout_dates SET start_date = ${addDays(to, 1)}::date WHERE id = ${b.id}::uuid`,
        );
      trimmed += 1;
    }
    return { ok: true, removed, trimmed, split } as const;
  });
}
