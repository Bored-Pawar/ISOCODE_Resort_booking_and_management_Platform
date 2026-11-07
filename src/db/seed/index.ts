/**
 * Idempotent seed: truncates every app table, then rebuilds demo data.
 * Safe to run repeatedly on a development database. Guarded by src/db/safety.ts.
 */
import bcrypt from "bcryptjs";
import path from "node:path";
import sharp from "sharp";
import { sql } from "drizzle-orm";
import { createDb } from "@/lib/db";
import { addDays, eachNight, todayIST } from "@/lib/dates";
import { calculateQuote } from "@/modules/pricing/calculation";
import * as t from "@/db/schema";
import { assertSafeDestructiveTarget } from "@/db/safety";
import {
  DEMO_PASSWORD,
  guestUsers,
  promoSeeds,
  ratePlanSeeds,
  roomTypeSeeds,
  staffUsers,
  taxSlabSeeds,
} from "./data";
import { labelledEnquiries } from "./enquiries.data";
import { buildNights, rng, seedRatePaise } from "./pricing";

// Throws unless the target is safe: DATABASE_URL_UNPOOLED, or TEST_DATABASE_URL when DB_TARGET=test.
const { url, host } = assertSafeDestructiveTarget(process.env);

const { db, client } = createDb(url, { max: 2 });
const rand = rng(20261107);
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
const now = new Date();
const today = todayIST(now);
const DAYS = 180;
const dates = Array.from({ length: DAYS }, (_, i) => addDays(today, i));

async function chunked<T>(rows: T[], size: number, fn: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

async function main() {
  // ---- reset --------------------------------------------------------------
  await db.execute(sql`TRUNCATE TABLE users, room_types, room_photos, rate_plans, daily_rates, tax_slabs,
    promo_codes, inventory, blackout_dates, bookings, booking_nights, payments, booking_events, enquiries,
    event_details, reply_drafts, enquiry_events, notifications, export_runs RESTART IDENTITY CASCADE`);

  // ---- users --------------------------------------------------------------
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const staff = await db
    .insert(t.users)
    .values(staffUsers.map((u) => ({ ...u, passwordHash })))
    .returning();
  const guests = await db
    .insert(t.users)
    .values(
      guestUsers.map((u) => ({
        ...u,
        role: "guest",
        passwordHash,
        consentAt: now,
        consentVersion: "2026-11",
      })),
    )
    .returning();
  const staffByRole = Object.fromEntries(staff.map((u) => [u.role, u]));

  // ---- catalog ------------------------------------------------------------
  const rooms = await db
    .insert(t.roomTypes)
    .values(
      roomTypeSeeds.map((r, i) => ({
        slug: r.slug,
        name: r.name,
        description: r.description,
        totalUnits: r.totalUnits,
        maxAdults: r.maxAdults,
        maxChildren: r.maxChildren,
        amenities: [...r.amenities],
        sort: i,
      })),
    )
    .returning();
  const roomBySlug = Object.fromEntries(rooms.map((r) => [r.slug, r]));

  const photoRows: (typeof t.roomPhotos.$inferInsert)[] = [];
  for (const seed of roomTypeSeeds) {
    for (let n = 1; n <= 3; n++) {
      const file = path.resolve(`public/images/${seed.slug}-${n}.jpg`);
      const meta = await sharp(file).metadata();
      const blur = await sharp(file).resize(12).jpeg({ quality: 40 }).toBuffer();
      photoRows.push({
        roomTypeId: roomBySlug[seed.slug].id,
        url: `/images/${seed.slug}-${n}.jpg`,
        alt: seed.photoAlts[n - 1],
        width: meta.width ?? 2000,
        height: meta.height ?? 1333,
        blurData: `data:image/jpeg;base64,${blur.toString("base64")}`,
        sort: n,
      });
    }
  }
  await db.insert(t.roomPhotos).values(photoRows);

  const planRows = rooms.flatMap((r) =>
    ratePlanSeeds.map((p) => ({
      roomTypeId: r.id,
      code: p.code,
      name: p.name,
      inclusions: p.inclusions,
      refundable: p.refundable,
    })),
  );
  const plans = await db.insert(t.ratePlans).values(planRows).returning();
  const seedOf = new Map(roomTypeSeeds.map((r) => [roomBySlug[r.slug].id, r]));
  const addOf = new Map(ratePlanSeeds.map((p) => [p.code as string, p.addRupees]));

  // 180 days of rates for every room type x plan
  const rateMap = new Map<string, number>();
  const rateRows = plans.flatMap((p) => {
    const room = seedOf.get(p.roomTypeId)!;
    return dates.map((date) => {
      const price = seedRatePaise(room.baseRupees, addOf.get(p.code) ?? 0, date);
      rateMap.set(`${p.roomTypeId}|${p.id}|${date}`, price);
      return {
        roomTypeId: p.roomTypeId,
        ratePlanId: p.id,
        date,
        pricePaise: price,
        updatedBy: staffByRole.reservations.id,
      };
    });
  });
  await chunked(rateRows, 500, (c) => db.insert(t.dailyRates).values(c));

  await db.insert(t.taxSlabs).values(taxSlabSeeds.map((s) => ({ ...s })));
  const promos = await db
    .insert(t.promoCodes)
    .values(promoSeeds.map((p) => ({ ...p, validFrom: today, validTo: addDays(today, 365) })))
    .returning();

  // ---- blackouts ----------------------------------------------------------
  const poolId = roomBySlug["pool-villa"].id;
  const blackouts = [
    {
      roomTypeId: poolId,
      startDate: addDays(today, 60),
      endDate: addDays(today, 66),
      reason: "Plunge pool resurfacing",
    },
    {
      roomTypeId: null,
      startDate: addDays(today, 100),
      endDate: addDays(today, 101),
      reason: "Estate staff retreat",
    },
  ];
  await db
    .insert(t.blackoutDates)
    .values(blackouts.map((b) => ({ ...b, createdBy: staffByRole.reservations.id })));
  const isBlackedOut = (roomId: string, ds: string[]) =>
    blackouts.some(
      (b) =>
        (b.roomTypeId === null || b.roomTypeId === roomId) &&
        ds.some((d) => d >= b.startDate && d <= b.endDate),
    );

  // ---- bookings (30) ------------------------------------------------------
  const used = new Map<string, { sold: number; held: number }>();
  const usageOf = (roomId: string, d: string) => used.get(`${roomId}|${d}`) ?? { sold: 0, held: 0 };
  const statusPlan = [
    ...Array(18).fill("CONFIRMED"),
    ...Array(3).fill("HELD"),
    ...Array(4).fill("EXPIRED"),
    ...Array(5).fill("CANCELLED"),
  ] as string[];
  const weights = [
    ["plantation-room", 0.45],
    ["estate-suite", 0.75],
    ["garden-villa", 0.9],
    ["pool-villa", 1],
  ] as const;
  const refChars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const refs = new Set<string>();
  const newRef = () => {
    let ref = "";
    do
      ref =
        "CA-" +
        Array.from({ length: 5 }, () => refChars[Math.floor(rand() * refChars.length)]).join("");
    while (refs.has(ref));
    refs.add(ref);
    return ref;
  };
  const activePromos = promos.filter((p) => p.active);
  const slabs = taxSlabSeeds.map((s) => ({ ...s }));

  type Planned = {
    row: typeof t.bookings.$inferInsert;
    nights: ReturnType<typeof buildNights>;
    status: string;
    wasConfirmed: boolean;
    dates: string[];
  };
  const planned: Planned[] = [];
  for (let i = 0; i < 30; i++) {
    const status = statusPlan[i];
    const counts = status === "CONFIRMED" || status === "HELD";
    for (let attempt = 0; attempt < 50; attempt++) {
      const r = rand();
      const slug = weights.find(([, w]) => r < w)![0];
      const room = roomBySlug[slug];
      const rs = seedOf.get(room.id)!;
      const nightsCount = 1 + Math.floor(rand() * 4);
      const checkIn = addDays(today, 2 + Math.floor(rand() * 110));
      const ds = eachNight(checkIn, addDays(checkIn, nightsCount));
      if (isBlackedOut(room.id, ds)) continue;
      if (
        counts &&
        ds.some((d) => usageOf(room.id, d).sold + usageOf(room.id, d).held + 1 > rs.allotment)
      )
        continue;

      const planCode = pick(["EP", "CP", "CP", "MAP"]);
      const plan = plans.find((p) => p.roomTypeId === room.id && p.code === planCode)!;
      const rates = ds.map((d) => rateMap.get(`${room.id}|${plan.id}|${d}`)!);
      const promo = nightsCount >= 2 && rand() < 0.3 ? pick(activePromos) : null;
      const promoSpec = promo ? { kind: promo.kind as "pct" | "flat", value: promo.value } : null;
      const q = calculateQuote(
        {
          roomTypeId: room.id,
          ratePlanId: plan.id,
          checkIn,
          checkOut: addDays(checkIn, nightsCount),
        },
        ds,
        rates,
        promo ? { code: promo.code, kind: promoSpec!.kind, value: promo.value } : null,
        slabs,
      );
      const {
        nights,
        subtotalPaise: subtotal,
        discountPaise: discount,
        gstPaise: gst,
        quoteHash,
      } = q;
      const wasConfirmed = status === "CONFIRMED" || (status === "CANCELLED" && i % 5 < 2);
      const createdAt =
        status === "HELD"
          ? new Date(now.getTime() - 60_000 * (1 + Math.floor(rand() * 4)))
          : new Date(now.getTime() - 3_600_000 * (3 + Math.floor(rand() * 300)));
      planned.push({
        status,
        wasConfirmed,
        dates: ds,
        nights,
        row: {
          ref: newRef(),
          guestId: guests[i % guests.length].id,
          roomTypeId: room.id,
          ratePlanId: plan.id,
          checkIn,
          checkOut: addDays(checkIn, nightsCount),
          units: 1,
          adults: 1 + Math.floor(rand() * rs.maxAdults),
          children: rs.maxChildren > 0 && rand() < 0.25 ? 1 : 0,
          status,
          holdExpiresAt:
            status === "CONFIRMED" ? null : new Date(createdAt.getTime() + 10 * 60_000),
          quoteHash,
          promoId: promo?.id ?? null,
          subtotalPaise: subtotal,
          discountPaise: discount,
          gstPaise: gst,
          totalPaise: subtotal - discount + gst,
          createdAt,
          confirmedAt: wasConfirmed ? new Date(createdAt.getTime() + 3 * 60_000) : null,
        },
      });
      if (counts) {
        for (const d of ds) {
          const u = usageOf(room.id, d);
          used.set(
            `${room.id}|${d}`,
            status === "CONFIRMED" ? { ...u, sold: u.sold + 1 } : { ...u, held: u.held + 1 },
          );
        }
      }
      break;
    }
  }
  if (planned.length !== 30) throw new Error(`Only planned ${planned.length} bookings`);

  const inserted = await db
    .insert(t.bookings)
    .values(planned.map((p) => p.row))
    .returning({ id: t.bookings.id });
  const nightRows = planned.flatMap((p, i) =>
    p.nights.map((n) => ({ bookingId: inserted[i].id, ...n })),
  );
  await db.insert(t.bookingNights).values(nightRows);

  const events: (typeof t.bookingEvents.$inferInsert)[] = [];
  const payments: (typeof t.payments.$inferInsert)[] = [];
  let lateDone = false;
  planned.forEach((p, i) => {
    const id = inserted[i].id;
    const at = p.row.createdAt as Date;
    events.push({
      bookingId: id,
      fromStatus: null,
      toStatus: "HELD",
      actor: "guest",
      note: "Hold acquired",
      at,
    });
    if (p.wasConfirmed) {
      const paidAt = new Date(at.getTime() + 3 * 60_000);
      events.push({
        bookingId: id,
        fromStatus: "HELD",
        toStatus: "CONFIRMED",
        actor: "system:payment",
        note: "Payment received",
        at: paidAt,
      });
      payments.push({
        bookingId: id,
        provider: "mock",
        providerPaymentId: `mock_pay_${i + 1}`,
        amountPaise: p.row.totalPaise,
        status: "SUCCESS",
        createdAt: paidAt,
      });
    }
    if (p.status === "CANCELLED") {
      const from = p.wasConfirmed ? "CONFIRMED" : "HELD";
      events.push({
        bookingId: id,
        fromStatus: from,
        toStatus: "CANCELLED",
        actor: p.wasConfirmed ? "staff" : "guest",
        note: p.wasConfirmed ? "Cancelled by reservations" : "Guest abandoned",
        at: new Date(at.getTime() + 3_600_000),
      });
    }
    if (p.status === "EXPIRED") {
      const expiredAt = p.row.holdExpiresAt as Date;
      events.push({
        bookingId: id,
        fromStatus: "HELD",
        toStatus: "EXPIRED",
        actor: "system:expiry",
        note: "Hold expired",
        at: expiredAt,
      });
      if (!lateDone) {
        lateDone = true; // one late payment per 01-booking-core: stays EXPIRED, payment REFUND_PENDING
        const lateAt = new Date(expiredAt.getTime() + 2 * 60_000);
        payments.push({
          bookingId: id,
          provider: "mock",
          providerPaymentId: `mock_pay_late_${i + 1}`,
          amountPaise: p.row.totalPaise,
          status: "REFUND_PENDING",
          createdAt: lateAt,
        });
        events.push({
          bookingId: id,
          fromStatus: "EXPIRED",
          toStatus: "EXPIRED",
          actor: "system:payment",
          note: "Payment received after hold expired; refund pending",
          at: lateAt,
        });
      }
    }
  });
  await db.insert(t.bookingEvents).values(events);
  await db.insert(t.payments).values(payments);

  // promo usage = confirmed bookings that used a promo (used_count increments at confirm)
  for (const promo of promos) {
    const n = planned.filter((p) => p.row.promoId === promo.id && p.status === "CONFIRMED").length;
    if (n > 0)
      await db
        .update(t.promoCodes)
        .set({ usedCount: n })
        .where(sql`${t.promoCodes.id} = ${promo.id}`);
  }

  // ---- inventory (after bookings so sold/held match) -----------------------
  const invRows = rooms.flatMap((r) =>
    dates.map((date) => {
      const u = usageOf(r.id, date);
      return {
        roomTypeId: r.id,
        date,
        allotment: seedOf.get(r.id)!.allotment,
        sold: u.sold,
        held: u.held,
      };
    }),
  );
  await chunked(invRows, 500, (c) => db.insert(t.inventory).values(c));

  // ---- enquiries (30) -----------------------------------------------------
  const ownerRole = {
    room: "reservations",
    wedding: "sales",
    offsite: "sales",
    complaint: "gm",
  } as const;
  const enquiryRows: (typeof t.enquiries.$inferInsert)[] = [];
  const enquiryEvents: (typeof t.enquiryEvents.$inferInsert)[] = [];
  const notifs: (typeof t.notifications.$inferInsert)[] = [];
  for (const q of labelledEnquiries) {
    const receivedAt = new Date(now.getTime() - q.hoursAgo * 3_600_000);
    const base = {
      id: q.id,
      channel: q.channel,
      senderName: q.name,
      senderContact: q.contact,
      rawText: q.text,
      receivedAt,
      aiUpdatedAt: receivedAt,
    };
    if (q.ai.status === "pending") {
      enquiryRows.push({ ...base, aiStatus: "pending", lane: "unsorted", status: "new" });
      continue;
    }
    const fallback = q.ai.status === "fallback";
    const category = fallback ? "other" : q.label;
    const confidence = q.ai.confidence ?? 0.5;
    const sorted = !fallback && confidence >= 0.7;
    const role =
      sorted && category in ownerRole ? ownerRole[category as keyof typeof ownerRole] : null;
    const owner = role ? staffByRole[role] : null;
    const summary = q.text.length > 80 ? `${q.text.slice(0, 77)}...` : q.text;
    enquiryRows.push({
      ...base,
      category,
      confidence: confidence.toFixed(2),
      extracted: { summary, language: q.note?.includes("Hinglish") ? "hi-en" : "en" },
      aiStatus: q.ai.status,
      aiAttempts: fallback ? 2 : 1,
      aiLastError: fallback ? "Provider returned invalid JSON; rules fallback used" : null,
      lane: sorted ? "sorted" : "unsorted",
      ownerId: owner?.id ?? null,
      status: owner ? "assigned" : "new",
      isComplaint: category === "complaint",
    });
    enquiryEvents.push({
      enquiryId: q.id,
      actor: fallback ? "rules" : "ai",
      action: "classified",
      toValue: category,
      at: new Date(receivedAt.getTime() + 20_000),
    });
    if (category === "complaint")
      notifs.push({ userId: staffByRole.gm.id, enquiryId: q.id, kind: "complaint" });
    else if (!sorted) notifs.push({ userId: staffByRole.gm.id, enquiryId: q.id, kind: "unsorted" });
  }
  await db.insert(t.enquiries).values(enquiryRows);
  await db.insert(t.enquiryEvents).values(enquiryEvents);
  await db.insert(t.notifications).values(notifs);
  await db.insert(t.eventDetails).values({ enquiryId: "ENQ-4395", eventType: "wedding" });

  console.log(
    `Seeded ${host}: ${rooms.length} room types, ${rateRows.length} rates, ${invRows.length} inventory rows, ` +
      `${planned.length} bookings, ${enquiryRows.length} enquiries, ${staff.length + guests.length} users.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => client.end());
