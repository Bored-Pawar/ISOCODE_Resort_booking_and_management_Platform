import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { childEnvForTests } from "@/db/safety";
import { connect, ensureMigrated } from "./helpers";
import { labelledEnquiries } from "@/db/seed/enquiries.data";
import { calculateQuote, type Slab } from "@/modules/pricing/calculation";
import type { QuoteNight } from "@/modules/pricing";
import { REF_PATTERN } from "@/modules/booking/ref";

const sql = connect(); // validates TEST_DATABASE_URL first
// The child seeds TEST_DATABASE_URL only; it never targets DATABASE_URL*.
const seedEnv = childEnvForTests(process.env) as NodeJS.ProcessEnv;

beforeAll(async () => {
  await ensureMigrated(sql);
  // Run twice: the seed must be idempotent.
  execSync("pnpm db:seed", { stdio: "pipe", env: seedEnv });
  execSync("pnpm db:seed", { stdio: "pipe", env: seedEnv });
}, 180_000);
afterAll(() => sql.end());

const count = async (table: string) =>
  Number((await sql.unsafe(`select count(*)::int n from ${table}`))[0].n);

describe("seed", () => {
  it("creates the A9 catalog", async () => {
    const rows = await sql`select name, total_units, max_occupancy from room_types order by sort`;
    expect(rows.map((r) => [r.name, r.total_units, r.max_occupancy])).toEqual([
      ["Plantation Room", 40, 3],
      ["Estate Suite", 24, 4],
      ["Garden Villa", 8, 5],
      ["Pool Villa", 4, 6],
    ]);
    expect(await count("room_photos")).toBe(12);
    expect(await count("rate_plans")).toBe(12);
    expect(await count("tax_slabs")).toBe(2);
  });

  it("has 180 days of rates and inventory, allotment within total units", async () => {
    expect(await count("daily_rates")).toBe(12 * 180);
    expect(await count("inventory")).toBe(4 * 180);
    const over =
      await sql`select 1 from inventory i join room_types r on r.id = i.room_type_id where i.allotment > r.total_units`;
    expect(over).toHaveLength(0);
  });

  it("has staff and demo guests", async () => {
    const roles = await sql`select role, count(*)::int n from users group by role order by role`;
    expect(Object.fromEntries(roles.map((r) => [r.role, r.n]))).toEqual({
      gm: 1,
      guest: 2,
      reservations: 1,
      sales: 1,
    });
  });

  it("has 30 bookings whose inventory matches their status", async () => {
    expect(await count("bookings")).toBe(30);
    const mismatch = await sql`
      select i.room_type_id, i.date from inventory i
      left join (
        select r.room_type_id, n.date,
               count(*) filter (where b.status = 'CONFIRMED')::int sold,
               count(*) filter (where b.status = 'HELD')::int held
        from bookings b join booking_rooms r on r.booking_id = b.id
        join booking_nights n on n.booking_room_id = r.id group by 1, 2
      ) x on x.room_type_id = i.room_type_id and x.date = i.date
      where i.sold <> coalesce(x.sold, 0) or i.held <> coalesce(x.held, 0)`;
    expect(mismatch).toHaveLength(0);
    // Order totals = sum of line totals = sum of cells (B10 rule 1).
    const lineTotals = await sql`select count(*)::int n from booking_rooms r
      join (select booking_room_id, sum(rate_paise)::int sub, sum(discount_paise)::int dis,
        sum(gst_paise)::int gst from booking_nights group by 1) s on s.booking_room_id = r.id
      where r.subtotal_paise <> s.sub or r.discount_paise <> s.dis or r.gst_paise <> s.gst
        or r.total_paise <> s.sub - s.dis + s.gst`;
    expect(lineTotals[0].n).toBe(0);
    const orderTotals = await sql`select count(*)::int n from bookings b
      join (select booking_id, sum(subtotal_paise)::int sub, sum(discount_paise)::int dis,
        sum(gst_paise)::int gst, sum(total_paise)::int tot from booking_rooms group by 1) s on s.booking_id = b.id
      where b.subtotal_paise <> s.sub or b.discount_paise <> s.dis or b.gst_paise <> s.gst
        or b.total_paise <> s.tot`;
    expect(orderTotals[0].n).toBe(0);
    const statuses = await sql`select distinct status from bookings`;
    expect(statuses.map((r) => r.status).sort()).toEqual([
      "CANCELLED",
      "CONFIRMED",
      "EXPIRED",
      "HELD",
    ]);
  });

  it("B10: about 5 multi-room bookings with consecutive lines, valid occupancy and shared refs", async () => {
    const perBooking =
      await sql`select b.ref, count(r.id)::int lines, array_agg(r.line_no order by r.line_no) nos
      from bookings b join booking_rooms r on r.booking_id = b.id group by b.id, b.ref`;
    expect(perBooking).toHaveLength(30);
    const multi = perBooking.filter((b) => b.lines > 1);
    expect(multi.length).toBeGreaterThanOrEqual(4);
    expect(multi.length).toBeLessThanOrEqual(6);
    for (const b of perBooking) {
      expect(b.nos).toEqual(Array.from({ length: b.lines }, (_, i) => i + 1));
      expect(b.ref).toMatch(REF_PATTERN);
    }
    const overfull =
      await sql`select 1 from booking_rooms r join room_types t on t.id = r.room_type_id
      where r.adults < 1 or r.adults > t.max_adults or r.adults + r.children > t.max_occupancy`;
    expect(overfull).toHaveLength(0);
  });

  it("has 30 enquiries including the three from the brief, verbatim", async () => {
    expect(await count("enquiries")).toBe(30);
    expect(labelledEnquiries).toHaveLength(30);
    for (const id of ["ENQ-4410", "ENQ-4411", "ENQ-4412"]) {
      const [row] = await sql`select raw_text from enquiries where id = ${id}`;
      expect(row.raw_text).toBe(labelledEnquiries.find((e) => e.id === id)!.text);
    }
    const [c] = await sql`select count(*)::int n from notifications where kind = 'complaint'`;
    expect(c.n).toBe(5);
  });

  it("reconciles frozen seed snapshots and hashes through the runtime pricing calculation", async () => {
    const slabs =
      await sql`select min_paise as "minPaise", max_paise as "maxPaise", gst_bp as "gstBp", effective_from::text as "effectiveFrom" from tax_slabs`;
    const rows = await sql`select b.*, b.check_in::text as check_in, b.check_out::text as check_out,
      case when p.id is null then null else jsonb_build_object('code',p.code,'kind',p.kind,'value',p.value) end as promo,
      (select jsonb_agg(jsonb_build_object('roomTypeId', r.room_type_id, 'ratePlanId', r.rate_plan_id,
        'adults', r.adults, 'children', r.children,
        'nights', (select jsonb_agg(jsonb_build_object('date', n.date, 'ratePaise',n.rate_paise,
          'discountPaise',n.discount_paise, 'gstBp',n.gst_bp,'gstPaise',n.gst_paise) order by n.date)
          from booking_nights n where n.booking_room_id = r.id)) order by r.line_no)
        from booking_rooms r where r.booking_id = b.id) as lines
      from bookings b left join promo_codes p on p.id=b.promo_id`;
    for (const b of rows) {
      type Line = {
        roomTypeId: string;
        ratePlanId: string;
        adults: number;
        children: number;
        nights: QuoteNight[];
      };
      const lines = b.lines as Line[];
      const q = calculateQuote(
        { checkIn: b.check_in, checkOut: b.check_out },
        lines[0].nights.map((n) => n.date),
        lines.map((l) => ({ ...l, rates: l.nights.map((n) => n.ratePaise) })),
        b.promo as Parameters<typeof calculateQuote>[3],
        slabs as unknown as Slab[],
      );
      expect(q.lines.map((l) => l.nights)).toEqual(lines.map((l) => l.nights));
      expect([q.subtotalPaise, q.discountPaise, q.gstPaise, q.totalPaise, q.quoteHash]).toEqual([
        b.subtotal_paise,
        b.discount_paise,
        b.gst_paise,
        b.total_paise,
        b.quote_hash,
      ]);
    }
  });
});
