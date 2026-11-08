/**
 * Admin writes and reads for pricing-owned tables: daily rates (A1) and promo codes (A4).
 * Called only through `@/modules/admin` (runbook S2 admin, section 2.5 and 2.8). Every function
 * takes the session actor, checks the capability itself and validates with Zod, so a direct call
 * is as safe as a server action. Prices are integer paise; rupees are converted here only.
 */
import { sql } from "drizzle-orm";
import type { Err, Ok } from "@/lib/result";
import { getDb, type Db } from "@/lib/db";
import { rupeesToPaise } from "@/lib/money";
import { can } from "@/lib/auth/permissions";
import { windowError, type AdminActor } from "@/modules/admin/rules";
import {
  createPromoInputSchema,
  deactivatePromoInputSchema,
  fieldErrors,
  setRatesInputSchema,
  type CreatePromoInput,
  type SetRatesInput,
} from "@/modules/admin/schemas";

export type AdminInvalid = Err<"INVALID_INPUT", { errors: Record<string, string> }>;
export type Forbidden = Err<"FORBIDDEN">;

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

// ---- A1 rates ----------------------------------------------------------------------------------

export type SetRatesResult = Ok<{ changed: number }> | AdminInvalid | Forbidden;

/**
 * Sets prices for single cells or a range (room types x plans x dates on the chosen weekdays).
 * One transaction, one `INSERT ... ON CONFLICT (room_type_id, rate_plan_id, date) DO UPDATE`.
 * Only active plans of the named room types are written; a cell whose price is already equal is
 * left alone, so `changed` counts rows whose price actually changed (or were created).
 * Existing bookings keep their frozen price; open carts get PRICE_CHANGED at hold (01 rule 3).
 */
export async function setRates(
  input: SetRatesInput,
  actor: AdminActor,
  opts: { db?: Db; now?: Date } = {},
): Promise<SetRatesResult> {
  if (!can(actor.role, "rates.edit")) return { ok: false, code: "FORBIDDEN" };
  const parsed = setRatesInputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, code: "INVALID_INPUT", errors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const dates = v.mode === "cells" ? v.cells.map((c) => c.date).sort() : [v.from, v.to];
  const outside = windowError(dates[0], dates[dates.length - 1], opts.now);
  if (outside) return { ok: false, code: "INVALID_INPUT", errors: { form: outside } };

  const source =
    v.mode === "cells"
      ? sql`SELECT v.room_type_id, v.rate_plan_id, v.date, v.price_paise
          FROM (VALUES ${sql.join(
            v.cells.map(
              (c) =>
                sql`(${c.roomTypeId}::uuid, ${c.ratePlanId}::uuid, ${c.date}::date, ${rupeesToPaise(c.rupees)}::int)`,
            ),
            sql`, `,
          )}) AS v(room_type_id, rate_plan_id, date, price_paise)
          JOIN rate_plans p ON p.id = v.rate_plan_id AND p.room_type_id = v.room_type_id AND p.active`
      : sql`SELECT p.room_type_id, p.id, d::date, ${rupeesToPaise(v.rupees)}::int
          FROM rate_plans p
          CROSS JOIN generate_series(${v.from}::date, ${v.to}::date, interval '1 day') AS d
          WHERE p.room_type_id = ANY(${uuidArray(v.roomTypeIds)}) AND p.active
            AND p.code = ANY(${sql`ARRAY[${sql.join(
              v.planCodes.map((c) => sql`${c}`),
              sql`, `,
            )}]::text[]`})
            AND extract(dow FROM d)::int = ANY(${intArray(v.days)})`;

  const db = opts.db ?? getDb();
  const rows = await db.transaction((tx) =>
    tx.execute(sql`
      INSERT INTO daily_rates (room_type_id, rate_plan_id, date, price_paise, updated_by, updated_at)
      SELECT s.*, ${actor.userId}::uuid, now() FROM (${source}) AS s
      ON CONFLICT (room_type_id, rate_plan_id, date) DO UPDATE
        SET price_paise = excluded.price_paise, updated_by = excluded.updated_by,
          updated_at = excluded.updated_at
        WHERE daily_rates.price_paise IS DISTINCT FROM excluded.price_paise
      RETURNING 1
    `),
  );
  return { ok: true, changed: rows.length };
}

export type RateGridRow = {
  roomTypeId: string;
  ratePlanId: string;
  planCode: string;
  planName: string;
  /** date -> price in paise (missing dates have no rate). */
  prices: Record<string, number>;
};

/** Active plans with their prices from `from` to `to` inclusive. */
export async function readRates(
  input: { from: string; to: string },
  actor: AdminActor,
  opts: { db?: Db } = {},
): Promise<Ok<{ rows: RateGridRow[] }> | Forbidden> {
  if (!can(actor.role, "rates.edit")) return { ok: false, code: "FORBIDDEN" };
  const db = opts.db ?? getDb();
  const rows = await db.execute<{
    room_type_id: string;
    rate_plan_id: string;
    code: string;
    name: string;
    prices: Record<string, number> | null;
  }>(sql`
    SELECT p.room_type_id, p.id AS rate_plan_id, p.code, p.name,
      (SELECT jsonb_object_agg(d.date::text, d.price_paise) FROM daily_rates d
        WHERE d.rate_plan_id = p.id AND d.room_type_id = p.room_type_id
          AND d.date BETWEEN ${input.from}::date AND ${input.to}::date) AS prices
    FROM rate_plans p JOIN room_types r ON r.id = p.room_type_id
    WHERE p.active
    ORDER BY r.sort, r.name, array_position(ARRAY['EP','CP','MAP'], p.code)
  `);
  return {
    ok: true,
    rows: rows.map((r) => ({
      roomTypeId: r.room_type_id,
      ratePlanId: r.rate_plan_id,
      planCode: r.code,
      planName: r.name,
      prices: r.prices ?? {},
    })),
  };
}

// ---- A4 promos ---------------------------------------------------------------------------------

export type PromoRow = {
  id: string;
  code: string;
  kind: "pct" | "flat";
  /** Percent for pct, paise for flat. */
  value: number;
  validFrom: string;
  validTo: string;
  minNights: number;
  maxUses: number | null;
  usedCount: number;
  active: boolean;
};

export async function listPromos(
  actor: AdminActor,
  opts: { db?: Db } = {},
): Promise<Ok<{ promos: PromoRow[] }> | Forbidden> {
  if (!can(actor.role, "promos.manage")) return { ok: false, code: "FORBIDDEN" };
  const db = opts.db ?? getDb();
  const rows = await db.execute<PromoRow>(sql`
    SELECT id, code, kind, value, valid_from::text AS "validFrom", valid_to::text AS "validTo",
      min_nights AS "minNights", max_uses AS "maxUses", used_count AS "usedCount", active
    FROM promo_codes ORDER BY active DESC, valid_to DESC, code
  `);
  return { ok: true, promos: [...rows] };
}

export type CreatePromoResult =
  Ok<{ promo: PromoRow }> | AdminInvalid | Err<"DUPLICATE_CODE", { existing: string }> | Forbidden;

/**
 * Codes are stored uppercase. A code equal to an existing one ignoring case is rejected (B1
 * review minor), including legacy lower-case rows. Flat values arrive in rupees, stored in paise.
 * The unique constraint on `code` catches two concurrent creates of the same uppercase code.
 */
export async function createPromo(
  input: CreatePromoInput,
  actor: AdminActor,
  opts: { db?: Db } = {},
): Promise<CreatePromoResult> {
  if (!can(actor.role, "promos.manage")) return { ok: false, code: "FORBIDDEN" };
  const parsed = createPromoInputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, code: "INVALID_INPUT", errors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const value = v.kind === "flat" ? rupeesToPaise(v.value) : v.value;
  const db = opts.db ?? getDb();
  try {
    return await db.transaction(async (tx) => {
      // Serialise creates of the same code (ignoring case) so the check below cannot race.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${"promo:" + v.code}, 0))`,
      );
      const dup = await tx.execute<{ code: string }>(
        sql`SELECT code FROM promo_codes WHERE upper(code) = ${v.code} LIMIT 1`,
      );
      if (dup.length) return { ok: false, code: "DUPLICATE_CODE", existing: dup[0].code } as const;
      const [row] = await tx.execute<PromoRow>(sql`
        INSERT INTO promo_codes (code, kind, value, valid_from, valid_to, min_nights, max_uses)
        VALUES (${v.code}, ${v.kind}, ${value}, ${v.validFrom}::date, ${v.validTo}::date,
          ${v.minNights}, ${v.maxUses})
        RETURNING id, code, kind, value, valid_from::text AS "validFrom", valid_to::text AS "validTo",
          min_nights AS "minNights", max_uses AS "maxUses", used_count AS "usedCount", active
      `);
      return { ok: true, promo: row } as const;
    });
  } catch (err) {
    if ((err as { cause?: { code?: string }; code?: string })?.cause?.code === "23505")
      return { ok: false, code: "DUPLICATE_CODE", existing: v.code };
    throw err;
  }
}

export type DeactivatePromoResult =
  Ok<{ promo: PromoRow }> | AdminInvalid | Err<"NOT_FOUND"> | Forbidden;

/** Stops new quotes using the code (PROMO_INVALID). Confirmed bookings keep their discount. */
export async function deactivatePromo(
  input: { id: string },
  actor: AdminActor,
  opts: { db?: Db } = {},
): Promise<DeactivatePromoResult> {
  if (!can(actor.role, "promos.manage")) return { ok: false, code: "FORBIDDEN" };
  const parsed = deactivatePromoInputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, code: "INVALID_INPUT", errors: fieldErrors(parsed.error) };
  const db = opts.db ?? getDb();
  const rows = await db.execute<PromoRow>(sql`
    UPDATE promo_codes SET active = false WHERE id = ${parsed.data.id}::uuid
    RETURNING id, code, kind, value, valid_from::text AS "validFrom", valid_to::text AS "validTo",
      min_nights AS "minNights", max_uses AS "maxUses", used_count AS "usedCount", active
  `);
  if (!rows.length) return { ok: false, code: "NOT_FOUND" };
  return { ok: true, promo: rows[0] };
}
