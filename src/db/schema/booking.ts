import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
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
    checkIn: date("check_in", { mode: "string" }).notNull(),
    checkOut: date("check_out", { mode: "string" }).notNull(),
    status: text("status").notNull(),
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
    quoteHash: text("quote_hash").notNull(),
    promoId: uuid("promo_id").references(() => promoCodes.id),
    subtotalPaise: integer("subtotal_paise").notNull(),
    discountPaise: integer("discount_paise").notNull().default(0),
    gstPaise: integer("gst_paise").notNull(),
    /** Order totals = sum of booking_rooms totals. */
    totalPaise: integer("total_paise").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (t) => [
    check("bookings_status_check", sql`${t.status} IN ('HELD','CONFIRMED','EXPIRED','CANCELLED')`),
    check("bookings_dates_check", sql`${t.checkOut} > ${t.checkIn}`),
    index("bookings_status_hold_idx").on(t.status, t.holdExpiresAt),
    index("bookings_guest_idx").on(t.guestId),
    index("bookings_check_in_idx").on(t.checkIn),
  ],
);

/** B10: one row per room line of a booking (1 to 4). Every line shares the booking's dates. */
export const bookingRooms = pgTable(
  "booking_rooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    lineNo: smallint("line_no").notNull(),
    roomTypeId: uuid("room_type_id")
      .notNull()
      .references(() => roomTypes.id),
    ratePlanId: uuid("rate_plan_id")
      .notNull()
      .references(() => ratePlans.id),
    adults: integer("adults").notNull(),
    children: integer("children").notNull().default(0),
    subtotalPaise: integer("subtotal_paise").notNull(),
    discountPaise: integer("discount_paise").notNull().default(0),
    gstPaise: integer("gst_paise").notNull(),
    totalPaise: integer("total_paise").notNull(),
  },
  (t) => [
    check("booking_rooms_line_no_check", sql`${t.lineNo} BETWEEN 1 AND 4`),
    check("booking_rooms_adults_check", sql`${t.adults} >= 1`),
    check("booking_rooms_children_check", sql`${t.children} >= 0`),
    unique("booking_rooms_booking_line_unique").on(t.bookingId, t.lineNo),
    index("booking_rooms_booking_idx").on(t.bookingId),
    index("booking_rooms_room_type_idx").on(t.roomTypeId),
  ],
);

export const bookingNights = pgTable(
  "booking_nights",
  {
    bookingRoomId: uuid("booking_room_id")
      .notNull()
      .references(() => bookingRooms.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    ratePaise: integer("rate_paise").notNull(),
    discountPaise: integer("discount_paise").notNull().default(0),
    gstBp: integer("gst_bp").notNull(),
    gstPaise: integer("gst_paise").notNull(),
  },
  (t) => [primaryKey({ columns: [t.bookingRoomId, t.date] })],
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
