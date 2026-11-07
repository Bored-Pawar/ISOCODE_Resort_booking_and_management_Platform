import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { promoCodes, ratePlans, roomTypes } from "./catalog";
import { users } from "./identity";

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Guest facing reference, e.g. CA-7K3P9 */
    ref: text("ref").notNull().unique(),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => users.id),
    roomTypeId: uuid("room_type_id")
      .notNull()
      .references(() => roomTypes.id),
    ratePlanId: uuid("rate_plan_id")
      .notNull()
      .references(() => ratePlans.id),
    checkIn: date("check_in", { mode: "string" }).notNull(),
    checkOut: date("check_out", { mode: "string" }).notNull(),
    /** MVP validation enforces 1 */
    units: integer("units").notNull().default(1),
    adults: integer("adults").notNull(),
    children: integer("children").notNull().default(0),
    status: text("status").notNull(),
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
    quoteHash: text("quote_hash").notNull(),
    promoId: uuid("promo_id").references(() => promoCodes.id),
    subtotalPaise: integer("subtotal_paise").notNull(),
    discountPaise: integer("discount_paise").notNull().default(0),
    gstPaise: integer("gst_paise").notNull(),
    totalPaise: integer("total_paise").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (t) => [
    check("bookings_units_check", sql`${t.units} >= 1`),
    check("bookings_status_check", sql`${t.status} IN ('HELD','CONFIRMED','EXPIRED','CANCELLED')`),
    check("bookings_dates_check", sql`${t.checkOut} > ${t.checkIn}`),
    index("bookings_status_hold_idx").on(t.status, t.holdExpiresAt),
    index("bookings_guest_idx").on(t.guestId),
    index("bookings_check_in_idx").on(t.checkIn),
  ],
);

export const bookingNights = pgTable(
  "booking_nights",
  {
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    ratePaise: integer("rate_paise").notNull(),
    discountPaise: integer("discount_paise").notNull().default(0),
    gstBp: integer("gst_bp").notNull(),
    gstPaise: integer("gst_paise").notNull(),
  },
  (t) => [primaryKey({ columns: [t.bookingId, t.date] })],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id),
    provider: text("provider").notNull(),
    providerPaymentId: text("provider_payment_id").notNull().unique(),
    amountPaise: integer("amount_paise").notNull(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("payments_status_check", sql`${t.status} IN ('SUCCESS','FAILED','REFUND_PENDING')`),
  ],
);

export const bookingEvents = pgTable("booking_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id")
    .notNull()
    .references(() => bookings.id, { onDelete: "cascade" }),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  actor: text("actor").notNull(),
  note: text("note"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});
