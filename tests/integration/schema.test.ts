import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, ensureMigrated, inRollback } from "./helpers";

const sql = connect();
beforeAll(() => ensureMigrated(sql));
afterAll(() => sql.end());

async function seedRoom(tx: Parameters<Parameters<typeof sql.begin>[1]>[0]) {
  const [rt] =
    await tx`insert into room_types (slug,name,description,total_units,max_adults,max_children)
    values ('t-'||gen_random_uuid(),'T','d',5,2,1) returning id`;
  const [user] = await tx`insert into users (email,password_hash,name,role)
    values ('u-'||gen_random_uuid()||'@x.test','h','U','guest') returning id`;
  const [plan] =
    await tx`insert into rate_plans (room_type_id,code,name,inclusions) values (${rt.id},'EP','n','i') returning id`;
  return { rt: rt.id as string, user: user.id as string, plan: plan.id as string };
}

async function rejects(
  tx: { savepoint: <T>(f: () => Promise<T>) => Promise<T> },
  fn: () => PromiseLike<unknown>,
  constraint: string,
) {
  await expect(
    tx.savepoint(async () => {
      await fn();
    }),
  ).rejects.toMatchObject({ constraint_name: constraint });
}

describe("schema constraints", () => {
  it("rejects inventory where sold + held exceeds allotment", () =>
    inRollback(sql, async (tx) => {
      const { rt } = await seedRoom(tx);
      await tx`insert into inventory (room_type_id,date,allotment,sold,held) values (${rt},'2026-12-01',2,1,1)`;
      await rejects(
        tx,
        () =>
          tx`insert into inventory (room_type_id,date,allotment,sold,held) values (${rt},'2026-12-02',2,2,1)`,
        "inventory_capacity_check",
      );
      await rejects(
        tx,
        () =>
          tx`insert into inventory (room_type_id,date,allotment,sold,held) values (${rt},'2026-12-03',-1,0,0)`,
        "inventory_allotment_check",
      );
    }));

  it("rejects bad roles, rates, units and ranges", () =>
    inRollback(sql, async (tx) => {
      const { rt, plan } = await seedRoom(tx);
      await rejects(
        tx,
        () =>
          tx`insert into users (email,password_hash,name,role) values ('r@x.test','h','R','admin')`,
        "users_role_check",
      );
      await rejects(
        tx,
        () =>
          tx`insert into room_types (slug,name,description,total_units,max_adults,max_children) values ('z','Z','d',0,1,0)`,
        "room_types_total_units_check",
      );
      await rejects(
        tx,
        () =>
          tx`insert into rate_plans (room_type_id,code,name,inclusions) values (${rt},'XX','n','i')`,
        "rate_plans_code_check",
      );
      await rejects(
        tx,
        () =>
          tx`insert into daily_rates (room_type_id,rate_plan_id,date,price_paise) values (${rt},${plan},'2026-12-01',0)`,
        "daily_rates_price_check",
      );
      await rejects(
        tx,
        () =>
          tx`insert into blackout_dates (start_date,end_date) values ('2026-12-05','2026-12-01')`,
        "blackout_dates_range_check",
      );
      await rejects(
        tx,
        () =>
          tx`insert into promo_codes (code,kind,value,valid_from,valid_to) values ('P','bogus',10,'2026-01-01','2026-12-31')`,
        "promo_codes_kind_check",
      );
    }));

  it("rejects invalid bookings and duplicate provider payments", () =>
    inRollback(sql, async (tx) => {
      const { rt, user, plan } = await seedRoom(tx);
      const mk = (ref: string, status: string, out: string, units = 1) => tx`insert into bookings
        (ref,guest_id,room_type_id,rate_plan_id,check_in,check_out,units,adults,status,quote_hash,subtotal_paise,gst_paise,total_paise)
        values (${ref},${user},${rt},${plan},'2026-12-01',${out},${units},2,${status},'h',100,5,105) returning id`;
      const [b] = await mk("CA-AAAAA", "HELD", "2026-12-03");
      await rejects(tx, () => mk("CA-BBBBB", "HELD", "2026-12-01"), "bookings_dates_check");
      await rejects(tx, () => mk("CA-CCCCC", "PAID", "2026-12-03"), "bookings_status_check");
      await rejects(tx, () => mk("CA-DDDDD", "HELD", "2026-12-03", 0), "bookings_units_check");
      await tx`insert into payments (booking_id,provider,provider_payment_id,amount_paise,status) values (${b.id},'mock','pay_1',105,'SUCCESS')`;
      await rejects(
        tx,
        () =>
          tx`insert into payments (booking_id,provider,provider_payment_id,amount_paise,status) values (${b.id},'mock','pay_1',105,'SUCCESS')`,
        "payments_provider_payment_id_unique",
      );
    }));

  it("rejects bad enquiry enums", () =>
    inRollback(sql, async (tx) => {
      const ins = (id: string, channel: string, lane: string) =>
        tx`insert into enquiries (id,channel,sender_name,sender_contact,raw_text,lane) values (${id},${channel},'n','c','t',${lane})`;
      await ins("ENQ-T1", "web", "unsorted");
      await rejects(tx, () => ins("ENQ-T2", "fax", "unsorted"), "enquiries_channel_check");
      await rejects(tx, () => ins("ENQ-T3", "web", "middle"), "enquiries_lane_check");
    }));
});
