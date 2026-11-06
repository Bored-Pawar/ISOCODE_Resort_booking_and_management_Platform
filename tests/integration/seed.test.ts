import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, ensureMigrated } from "./helpers";
import { labelledEnquiries } from "@/db/seed/enquiries.data";

const sql = connect();

beforeAll(async () => {
  await ensureMigrated(sql);
  // Run twice: the seed must be idempotent.
  execSync("pnpm db:seed", { stdio: "pipe" });
  execSync("pnpm db:seed", { stdio: "pipe" });
}, 180_000);
afterAll(() => sql.end());

const count = async (table: string) =>
  Number((await sql.unsafe(`select count(*)::int n from ${table}`))[0].n);

describe("seed", () => {
  it("creates the A9 catalog", async () => {
    const rows = await sql`select name, total_units from room_types order by sort`;
    expect(rows.map((r) => [r.name, r.total_units])).toEqual([
      ["Plantation Room", 40],
      ["Estate Suite", 24],
      ["Garden Villa", 8],
      ["Pool Villa", 4],
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
        select b.room_type_id, n.date,
               count(*) filter (where b.status = 'CONFIRMED')::int sold,
               count(*) filter (where b.status = 'HELD')::int held
        from bookings b join booking_nights n on n.booking_id = b.id group by 1, 2
      ) x on x.room_type_id = i.room_type_id and x.date = i.date
      where i.sold <> coalesce(x.sold, 0) or i.held <> coalesce(x.held, 0)`;
    expect(mismatch).toHaveLength(0);
    const totals = await sql`select count(*)::int n from bookings b
      join (select booking_id, sum(rate_paise - discount_paise + gst_paise)::int t from booking_nights group by 1) s on s.booking_id = b.id
      where b.total_paise <> s.t`;
    expect(totals[0].n).toBe(0);
    const statuses = await sql`select distinct status from bookings`;
    expect(statuses.map((r) => r.status).sort()).toEqual([
      "CANCELLED",
      "CONFIRMED",
      "EXPIRED",
      "HELD",
    ]);
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
});
